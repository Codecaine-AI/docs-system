#!/usr/bin/env bun
/**
 * Hub soak: measure the managed runtime's memory and CPU over a scripted hour (Spec decision 5).
 *
 *   bun scripts/hub-soak.ts --label before --out /tmp/soak-before.json
 *   bun scripts/hub-soak.ts --minutes 2 --out /tmp/soak-smoke.json        # smoke test
 *   bun scripts/hub-soak.ts --source <docs root> --copy-mode full --minutes 60 --label after --out after.json
 *
 * It copies the docs root into a temp dir, writes its own one-project registry in a temp state dir,
 * builds packages/docs-mcp/src/managed-runtime.ts the way the supervisor's buildRuntime does, and
 * starts it with the supervisor's env shape on a free port. It never touches the live hub (4820).
 * Every 10 s: one ps sample of the runtime PID and one write (POST /projects/<id>/api/ops appends a
 * paragraph to a rotating doc). Every 60 s: GET /api/tree and three GET /api/bundle reads.
 * Then a 60 s idle window with no requests, sampled the same way. A runtime exit voids the run (pidChanged).
 * Like the live supervisor's builds/ folder, the build folder has no harfbuzz.wasm, so layout lints stay approximate.
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, copyFile, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    source: { type: 'string', default: '/Users/Ford/workspace/knowledge-base' },
    minutes: { type: 'string', default: '60' },
    out: { type: 'string' },
    label: { type: 'string', default: 'before' },
    'copy-mode': { type: 'string', default: 'docs' },
  },
});
const minutes = Number(args.minutes);
if (!Number.isFinite(minutes) || minutes <= 0) throw new Error(`--minutes must be a positive number, got ${args.minutes}`);
if (!['before', 'after'].includes(args.label!)) throw new Error('--label must be before or after');
const copyMode = args['copy-mode'] as 'full' | 'docs';
if (!['full', 'docs'].includes(copyMode)) throw new Error('--copy-mode must be full or docs');
const source = resolve(args.source!);
const out = resolve(args.out ?? `hub-soak-${args.label}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

const sourceRoot = resolve(import.meta.dir, '..');
const packageRoot = join(sourceRoot, 'packages/docs-mcp');
const TICK_MS = 10_000;
const IDLE_MS = 60_000;

type Sample = { t: number; rssKb: number; cpu: number; phase: 'load' | 'idle' };
const log = (message: string) => console.error(`[soak] ${message}`);

// -- 1. Copy the docs root -----------------------------------------------------
const config = JSON.parse(await readFile(join(source, 'codecaine.docs.json'), 'utf8')) as { name?: string; docsRoot?: string; exclude?: string[] };
if ((config.docsRoot ?? '.') !== '.') throw new Error(`--source must be a whole-folder docs root (docsRoot "."), got docsRoot ${config.docsRoot}`);
const excludes = (config.exclude ?? []).map(pattern => new Bun.Glob(pattern));
/** A path is excluded when a glob matches it, or matches a file inside it (prunes whole subtrees). */
const excluded = (rel: string) => excludes.some(g => g.match(rel) || g.match(`${rel}/_`));
const skipName = (name: string) => name.startsWith('.') || name === 'node_modules';

/** Folders under root that hold doc.json, relative to root, honoring the exclude globs. */
async function bundleFolders(root: string, rel = ''): Promise<string[]> {
  const entries = await readdir(join(root, rel), { withFileTypes: true }).catch(() => []);
  const found: string[] = entries.some(e => e.isFile() && e.name === 'doc.json') ? [rel] : [];
  for (const e of entries) {
    if (!e.isDirectory() || skipName(e.name)) continue;
    const child = rel ? `${rel}/${e.name}` : e.name;
    if (!excluded(child)) found.push(...await bundleFolders(root, child));
  }
  return found;
}
/** Full mode: every file except dot folders, node_modules and excluded subtrees. */
async function copyTree(from: string, to: string, rel = ''): Promise<void> {
  await mkdir(join(to, rel), { recursive: true });
  for (const e of await readdir(join(from, rel), { withFileTypes: true })) {
    const child = rel ? `${rel}/${e.name}` : e.name;
    if (skipName(e.name) || excluded(child)) continue;
    if (e.isDirectory()) await copyTree(from, to, child);
    else if (e.isFile()) await copyFile(join(from, child), join(to, child));
  }
}
/** Docs mode: each bundle folder's own files and its assets/ folder, plus the .json record files of its ancestors. */
async function copyDocs(from: string, to: string, bundles: string[]): Promise<void> {
  const ancestors = new Set<string>();
  for (const b of bundles) for (let d = dirname(b); d !== '.' && d !== ''; d = dirname(d)) ancestors.add(d);
  ancestors.add('');
  const copyFiles = async (rel: string, only?: (name: string) => boolean) => {
    await mkdir(join(to, rel), { recursive: true });
    for (const e of await readdir(join(from, rel), { withFileTypes: true }))
      if (e.isFile() && !skipName(e.name) && (!only || only(e.name))) await copyFile(join(from, rel, e.name), join(to, rel, e.name));
  };
  for (const a of ancestors) await copyFiles(a, name => name.endsWith('.json'));
  for (const b of bundles) {
    await copyFiles(b);
    const assets = join(from, b, 'assets');
    if (existsSync(assets) && !excluded(b ? `${b}/assets` : 'assets')) await cp(assets, join(to, b, 'assets'), { recursive: true });
  }
}

// realpath: macOS /var is a symlink, and discovery reports resolved docs roots.
const tempRoot = await realpath(await mkdtemp(join(tmpdir(), 'hub-soak-')));
const docsCopy = join(tempRoot, 'docs');
const stateDir = join(tempRoot, 'state');
let child: ReturnType<typeof Bun.spawn> | undefined;
let stopping = false;
async function cleanup() {
  stopping = true;
  child?.kill();
  if (child) await Promise.race([child.exited, Bun.sleep(5000)]);
  await rm(tempRoot, { recursive: true, force: true });
}
process.on('SIGINT', () => void cleanup().finally(() => process.exit(130)));
process.on('SIGTERM', () => void cleanup().finally(() => process.exit(143)));

try {
  const copyStarted = Date.now();
  const sourceBundles = await bundleFolders(source);
  if (copyMode === 'full') await copyTree(source, docsCopy);
  else await copyDocs(source, docsCopy, sourceBundles);
  const bundles = (await bundleFolders(docsCopy)).filter(Boolean).sort();
  const countFolders = async (dir: string): Promise<number> => {
    let n = 1;
    for (const e of await readdir(dir, { withFileTypes: true })) if (e.isDirectory()) n += await countFolders(join(dir, e.name));
    return n;
  };
  const folders = await countFolders(docsCopy);
  const copy = { mode: copyMode, folders, bundles: bundles.length, seconds: (Date.now() - copyStarted) / 1000 };
  log(`Copied ${copy.bundles} bundles in ${copy.folders} folders to ${docsCopy} (${copy.seconds} s)`);
  if (!bundles.length) throw new Error(`No doc.json bundles under ${source}`);

  const projectId = `hub-soak-${createHash('sha256').update(docsCopy).digest('hex').slice(0, 8)}`;
  const registryFile = join(stateDir, 'projects.json');
  await mkdir(join(stateDir, 'builds'), { recursive: true, mode: 0o700 });
  await writeFile(registryFile, JSON.stringify({
    schemaVersion: 1,
    workspaces: [docsCopy],
    projects: [{ id: projectId, name: config.name ?? 'Soak', root: docsCopy, docsRoot: docsCopy, products: ['docs'], exclude: config.exclude ?? [] }],
  }, null, 2), { mode: 0o600 });

  // -- 2. Build and start the runtime (mirrors supervisor.ts buildRuntime and startRuntime) --
  const sourcePaths = ['authoring-guidance.ts', 'visual-component-guidance.ts', 'project-markdown.ts'].map(p => `packages/docs-model/src/${p}`);
  for await (const path of new Bun.Glob('packages/docs-model/src/components/*/manifest.ts').scan(sourceRoot)) sourcePaths.push(path);
  const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, createHash('sha256').update(await readFile(join(sourceRoot, path))).digest('hex')])));
  const built = await Bun.build({ entrypoints: [join(packageRoot, 'src/managed-runtime.ts')], target: 'bun', format: 'esm', packages: 'bundle', define: { __DOCS_RUNTIME_SOURCES__: JSON.stringify(sourceHashes) } });
  if (!built.success) throw new Error(built.logs.map(String).join('\n'));
  if (built.outputs.length !== 1) throw new Error('Managed runtime must produce one JavaScript artifact');
  const bytes = await built.outputs[0]!.arrayBuffer();
  const buildHash = createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
  const buildFile = join(stateDir, 'builds', `runtime-${buildHash}.mjs`);
  await Bun.write(buildFile, bytes);
  log(`Built runtime ${buildHash.slice(0, 12)}`);

  const token = randomBytes(32).toString('hex');
  child = Bun.spawn([process.execPath, buildFile], {
    cwd: sourceRoot,
    env: { ...process.env, CODECAINE_DOCS_PACKAGE_ROOT: packageRoot, CODECAINE_DOCS_MANAGED: '1', CODECAINE_DOCS_RUNTIME_TOKEN: token, CODECAINE_DOCS_REGISTRY: registryFile, CODECAINE_DOCS_GLOBAL_THEMES: join(stateDir, 'themes'), CODECAINE_DOCS_BUILD: buildHash },
    stdout: 'pipe', stderr: 'inherit',
  });
  const pid = child.pid;
  const reader = (child.stdout as ReadableStream<Uint8Array>).getReader();
  let buffer = '';
  const port = await Promise.race([
    (async () => {
      for (;;) {
        const part = await reader.read();
        if (part.done) throw new Error(`Runtime exited before ready (${await child!.exited})`);
        buffer += new TextDecoder().decode(part.value);
        for (const line of buffer.split('\n').slice(0, -1)) { try { const v = JSON.parse(line); if (v.ready && Number.isInteger(v.port)) return v.port as number; } catch {} }
        buffer = buffer.slice(buffer.lastIndexOf('\n') + 1);
      }
    })(),
    Bun.sleep(120_000).then(() => { throw new Error('Runtime startup timed out after 120 s'); }),
  ]);
  void (async () => { while (!(await reader.read()).done) {} })().catch(() => {});
  const base = `http://127.0.0.1:${port}`;
  const api = `${base}/projects/${projectId}/api`;
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const health = await (await fetch(`${base}/health`, { headers })).json() as any;
  if (health.service !== 'codecaine-docs-runtime' || health.build !== buildHash) throw new Error(`Runtime failed its health check: ${JSON.stringify(health)}`);
  log(`Runtime pid ${pid} on port ${port}, health ok (${health.projects} project)`);

  // -- 3. The scripted hour ------------------------------------------------------
  const requests = { writes: 0, trees: 0, bundles: 0, errors: 0 };
  const errorSamples: string[] = [];
  const fail = (what: string, detail: string) => { requests.errors++; if (errorSamples.length < 10) errorSamples.push(`${what}: ${detail.slice(0, 300)}`); };
  async function call(what: string, path: string, init?: RequestInit): Promise<any> {
    try {
      const response = await fetch(`${api}${path}`, { headers, signal: AbortSignal.timeout(30_000), ...init });
      const text = await response.text();
      if (!response.ok) { fail(what, `${response.status} ${text}`); return undefined; }
      return JSON.parse(text);
    } catch (e) { fail(what, String(e)); return undefined; }
  }
  const bundleRead = (path: string) => call('bundle', `/bundle?path=${encodeURIComponent(path)}`);
  // Writes rotate over a fixed spread of docs. Reads rotate over all of them.
  const writeTargets = Array.from({ length: Math.min(12, bundles.length) }, (_, i) => bundles[Math.floor(i * bundles.length / Math.min(12, bundles.length))]!);
  let writeIndex = 0, readIndex = 0;
  async function write(tick: number) {
    const path = writeTargets[writeIndex++ % writeTargets.length]!;
    const loaded = await bundleRead(path);
    if (!loaded) return;
    const doc = loaded.doc;
    const parentId = doc.root as string;
    const op = { type: 'insertBlock', blockId: `soak-${tick}-${randomBytes(4).toString('hex')}`, parentId, index: doc.blocks[parentId].children.length, blockType: 'paragraph', props: {}, text: [{ insert: `Soak run paragraph ${tick} was written at ${new Date().toISOString()}.` }] };
    const result = await call('write', '/ops', { method: 'POST', body: JSON.stringify({ path, ops: [op], expected_hash: loaded.doc_hash, session_id: 'hub-soak' }) });
    if (result) requests.writes++;
  }
  async function reads() {
    if (await call('tree', '/tree')) requests.trees++;
    for (let i = 0; i < 3; i++) if (await bundleRead(bundles[readIndex++ % bundles.length]!)) requests.bundles++;
  }

  const samples: Sample[] = [];
  let pidChanged = false;
  void child.exited.then(code => { if (stopping) return; pidChanged = true; log(`Runtime pid ${pid} exited (${code}). The run is void.`); });
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  async function sample(phase: Sample['phase']) {
    const ps = Bun.spawnSync(['ps', '-o', 'rss=,%cpu=', '-p', String(pid)]);
    const [rss, cpu] = ps.stdout.toString().trim().split(/\s+/).map(Number);
    if (!ps.success || !Number.isFinite(rss)) { pidChanged = true; return; }
    samples.push({ t: Math.round((Date.now() - t0) / 1000), rssKb: rss!, cpu: cpu!, phase });
  }
  const loadTicks = Math.round(minutes * 60_000 / TICK_MS);
  for (let tick = 0; tick < loadTicks && !pidChanged; tick++) {
    await Bun.sleep(Math.max(0, t0 + tick * TICK_MS - Date.now()));
    await sample('load');
    await write(tick);
    if (tick % 6 === 0) await reads();
    if (tick % 6 === 0) { const s = samples.at(-1); log(`${Math.round((Date.now() - t0) / 1000)} s rss ${s ? Math.round(s.rssKb / 1024) : '?'} MB cpu ${s?.cpu ?? '?'}% ${JSON.stringify(requests)}`); }
  }
  const idleStart = t0 + loadTicks * TICK_MS;
  for (let i = 1; i <= IDLE_MS / TICK_MS && !pidChanged; i++) {
    await Bun.sleep(Math.max(0, idleStart + i * TICK_MS - Date.now()));
    await sample('idle');
  }

  // -- 4. Report -----------------------------------------------------------------
  const mean = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 10) / 10 : null;
  const report = {
    label: args.label, startedAt, minutes, pid, pidChanged,
    samples: samples.map(({ t, rssKb, cpu, phase }) => ({ t, rssKb, cpu, phase })),
    peakRssKb: Math.max(0, ...samples.map(s => s.rssKb)),
    meanCpu: mean(samples.filter(s => s.phase === 'load').map(s => s.cpu)),
    idleMeanCpu: mean(samples.filter(s => s.phase === 'idle').map(s => s.cpu)),
    copy: { folders: copy.folders, bundles: copy.bundles, mode: copy.mode, seconds: copy.seconds },
    requests, errorSamples,
    runtime: { build: buildHash.slice(0, 12), source, sourceRoot: relative(process.cwd(), sourceRoot) || '.' },
  };
  await writeFile(out, JSON.stringify(report, null, 2) + '\n');
  log(`Wrote ${out}: peak ${Math.round(report.peakRssKb / 1024)} MB, mean cpu ${report.meanCpu}%, idle cpu ${report.idleMeanCpu}%, pidChanged ${pidChanged}`);
} finally {
  await cleanup();
}
