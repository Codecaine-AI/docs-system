#!/usr/bin/env bun
/**
 * Hub soak: measure the managed runtime's memory and CPU over a scripted hour (Spec decision 5).
 *
 *   bun scripts/hub-soak.ts --label before --out /tmp/soak-before.json
 *   bun scripts/hub-soak.ts --minutes 2 --out /tmp/soak-smoke.json        # smoke test
 *   bun scripts/hub-soak.ts --source <docs root> --copy-mode full --minutes 60 --label after --out after.json
 *   bun scripts/hub-soak.ts --label before --minutes 60 --profile --out before.json   # + before.profile/
 *
 * --profile starts the runtime under Bun's --heap-prof (a heap snapshot written when the runtime exits
 * through its SIGTERM handler) with scripts/hub-soak/profile-preload.ts preloaded: it samples
 * process.memoryUsage() every 10 s and, when the soak asks at the end of the load phase, writes a
 * Chrome-format heap snapshot. Everything lands in <out minus .json>.profile/. Read it with scripts/hub-soak/summarize-profiles.ts.
 * --cpu-profile adds Bun's --cpu-prof (5 ms). JavaScriptCore's sampling profiler pins every sampled
 * function until exit (one closure per sample: scripts/hub-soak/cpu-prof-retention-probe.ts), so a run
 * with it shows a heap and an RSS the runtime would not have on its own. Use it for the busy loop only,
 * and read retainers from a run without it.
 * Jev judgment (a paid TypeSafe call on every save) is off unless --judgment is given, so a soak never spends credits.
 *
 * The live hub's shape, in small numbers (all default to 0, which is the single-project soak above):
 *   --projects <n>      n APFS clones of the docs copy registered as extra projects and workspaces: n more
 *                       watchers, stores, route tables and backlinks databases.
 *   --clients <n>       n agent loops over POST /rpc, each on one project: docs_begin and the style guidance
 *                       once, then every 3 s docs_tree and docs_read, and every 10th round one docs_apply_ops.
 *                       Tasks are never ended, like most real agents. No identity, so nothing reaches the action log.
 *   --sse <n>           n subscribers to GET /api/events on the main project that drop and reconnect every 30 s.
 *   --asset-reads <n>   n GET /api/asset reads per 10 s tick, rotating over the copy's asset files largest first,
 *                       the way open editor tabs load their images and videos (the route reads the whole file).
 *   --filler-files <n>  n empty .txt files, 20 per folder, under <docs copy>/filler: a big tree for the
 *                       walker, the discovery glob and the watcher, like the 354k-file knowledge base.
 *   --runtime-build <file>  Run this prebuilt runtime .mjs (such as the live hub's builds/runtime-<hash>.mjs,
 *                       copied first so the file name never matches a live sampler) instead of building this
 *                       worktree. --package-root sets CODECAINE_DOCS_PACKAGE_ROOT for it.
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
    profile: { type: 'boolean', default: false },
    'cpu-profile': { type: 'boolean', default: false },
    judgment: { type: 'boolean', default: false },
    projects: { type: 'string', default: '0' },
    clients: { type: 'string', default: '0' },
    sse: { type: 'string', default: '0' },
    'filler-files': { type: 'string', default: '0' },
    'asset-reads': { type: 'string', default: '0' },
    'runtime-build': { type: 'string' },
    'package-root': { type: 'string' },
  },
});
const count = (name: 'projects' | 'clients' | 'sse' | 'filler-files' | 'asset-reads') => { const n = Number(args[name]); if (!Number.isInteger(n) || n < 0) throw new Error(`--${name} must be a whole number, got ${args[name]}`); return n; };
const shape = { projects: count('projects'), clients: count('clients'), sse: count('sse'), fillerFiles: count('filler-files'), assetReads: count('asset-reads') };
const minutes = Number(args.minutes);
if (!Number.isFinite(minutes) || minutes <= 0) throw new Error(`--minutes must be a positive number, got ${args.minutes}`);
if (!/^[a-z0-9][a-z0-9-]*$/.test(args.label!)) throw new Error('--label must be a lowercase slug such as before, after or before-heavy');
const copyMode = args['copy-mode'] as 'full' | 'docs';
if (!['full', 'docs'].includes(copyMode)) throw new Error('--copy-mode must be full or docs');
const source = resolve(args.source!);
const out = resolve(args.out ?? `hub-soak-${args.label}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const profileDir = args.profile || args['cpu-profile'] ? `${out.replace(/\.json$/, '')}.profile` : undefined;
const preload = join(import.meta.dir, 'hub-soak/profile-preload.ts');

const sourceRoot = resolve(import.meta.dir, '..');
const packageRoot = args['package-root'] ? resolve(args['package-root']) : join(sourceRoot, 'packages/docs-mcp');
const TICK_MS = 10_000;
const IDLE_MS = 60_000;
const CLIENT_INTERVAL_MS = 3_000;
const SSE_RECONNECT_MS = 30_000;

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
/** SIGTERM the runtime and wait for it: with --profile, Bun writes the CPU and allocation profiles on this exit. */
async function stopRuntime() {
  stopping = true;
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([child.exited, Bun.sleep(profileDir ? 60_000 : 5000)]);
}
async function cleanup() {
  await stopRuntime();
  await rm(tempRoot, { recursive: true, force: true });
}
process.on('SIGINT', () => void cleanup().finally(() => process.exit(130)));
process.on('SIGTERM', () => void cleanup().finally(() => process.exit(143)));

try {
  const copyStarted = Date.now();
  const sourceBundles = await bundleFolders(source);
  if (copyMode === 'full') await copyTree(source, docsCopy);
  else await copyDocs(source, docsCopy, sourceBundles);
  // Extra projects are APFS clones of the docs copy (cp -c: no extra space), made before the filler goes in.
  const clones: { id: string; root: string }[] = [];
  for (let i = 0; i < shape.projects; i++) {
    const root = join(tempRoot, `project-${i}`);
    const cp = Bun.spawnSync(['cp', '-Rc', docsCopy, root]);
    if (!cp.success) throw new Error(`cp -Rc failed for ${root}: ${cp.stderr.toString()}`);
    clones.push({ id: `hub-soak-clone-${i}`, root });
  }
  if (shape.fillerFiles) {
    const perFolder = 20;
    for (let i = 0; i < shape.fillerFiles; i++) {
      const folder = join(docsCopy, 'filler', `d${Math.floor(i / perFolder)}`);
      if (i % perFolder === 0) await mkdir(folder, { recursive: true });
      await writeFile(join(folder, `f${i}.txt`), '');
    }
  }
  const bundles = (await bundleFolders(docsCopy)).filter(Boolean).sort();
  // Asset files of the copy, largest first: the asset route's whole-file reads cost by size.
  const assetFiles: { path: string; size: number }[] = [];
  if (shape.assetReads) for await (const path of new Bun.Glob('**/assets/**').scan({ cwd: docsCopy, onlyFiles: true, followSymlinks: false })) assetFiles.push({ path, size: Bun.file(join(docsCopy, path)).size });
  assetFiles.sort((a, b) => b.size - a.size);
  const countFolders = async (dir: string): Promise<number> => {
    let n = 1;
    for (const e of await readdir(dir, { withFileTypes: true })) if (e.isDirectory()) n += await countFolders(join(dir, e.name));
    return n;
  };
  const folders = await countFolders(docsCopy);
  const copy = { mode: copyMode, folders, bundles: bundles.length, seconds: (Date.now() - copyStarted) / 1000 };
  log(`Copied ${copy.bundles} bundles in ${copy.folders} folders to ${docsCopy} (${copy.seconds} s)${clones.length ? `, ${clones.length} clones` : ''}${shape.fillerFiles ? `, ${shape.fillerFiles} filler files` : ''}${assetFiles.length ? `, ${assetFiles.length} asset files` : ''}`);
  if (!bundles.length) throw new Error(`No doc.json bundles under ${source}`);

  const projectId = `hub-soak-${createHash('sha256').update(docsCopy).digest('hex').slice(0, 8)}`;
  const registryFile = join(stateDir, 'projects.json');
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const project = (id: string, root: string) => ({ id, name: config.name ?? 'Soak', root, docsRoot: root, products: ['docs'], exclude: config.exclude ?? [] });
  const allProjects = [{ id: projectId, root: docsCopy }, ...clones];
  await writeFile(registryFile, JSON.stringify({
    schemaVersion: 1,
    workspaces: allProjects.map(p => p.root),
    projects: allProjects.map(p => project(p.id, p.root)),
  }, null, 2), { mode: 0o600 });

  // -- 2. Build and start the runtime (mirrors supervisor.ts buildRuntime and startRuntime) --
  let bytes: ArrayBuffer;
  if (args['runtime-build']) {
    bytes = await Bun.file(resolve(args['runtime-build'])).arrayBuffer();
  } else {
    const sourcePaths = ['authoring-guidance.ts', 'visual-component-guidance.ts', 'project-markdown.ts'].map(p => `packages/docs-model/src/${p}`);
    for await (const path of new Bun.Glob('packages/docs-model/src/components/*/manifest.ts').scan(sourceRoot)) sourcePaths.push(path);
    const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, createHash('sha256').update(await readFile(join(sourceRoot, path))).digest('hex')])));
    const built = await Bun.build({ entrypoints: [join(packageRoot, 'src/managed-runtime.ts')], target: 'bun', format: 'esm', packages: 'bundle', define: { __DOCS_RUNTIME_SOURCES__: JSON.stringify(sourceHashes) } });
    if (!built.success) throw new Error(built.logs.map(String).join('\n'));
    if (built.outputs.length !== 1) throw new Error('Managed runtime must produce one JavaScript artifact');
    bytes = await built.outputs[0]!.arrayBuffer();
  }
  const buildHash = createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
  // Not builds/runtime-<hash>.mjs: a sampler of the live hub matches that name (pgrep -f "builds/runtime-").
  const buildFile = join(stateDir, 'soak-builds', `soak-runtime-${buildHash}.mjs`);
  await mkdir(dirname(buildFile), { recursive: true, mode: 0o700 });
  await Bun.write(buildFile, bytes);
  log(`${args['runtime-build'] ? 'Using prebuilt' : 'Built'} runtime ${buildHash.slice(0, 12)}`);

  const token = randomBytes(32).toString('hex');
  if (profileDir) await mkdir(profileDir, { recursive: true });
  // 5 ms CPU samples: an hour is 720k samples, a few MB of .cpuprofile, and 720k functions pinned until exit (see the header).
  const cpuFlags = args['cpu-profile'] ? ['--cpu-prof', `--cpu-prof-dir=${profileDir}`, '--cpu-prof-name=runtime.cpuprofile', '--cpu-prof-interval=5000'] : [];
  const profileFlags = profileDir ? [...cpuFlags, '--heap-prof', `--heap-prof-dir=${profileDir}`, '--heap-prof-name=runtime.heapprofile', '--preload', preload] : [];
  child = Bun.spawn([process.execPath, ...profileFlags, buildFile], {
    cwd: sourceRoot,
    env: { ...process.env, CODECAINE_DOCS_PACKAGE_ROOT: packageRoot, CODECAINE_DOCS_MANAGED: '1', CODECAINE_DOCS_RUNTIME_TOKEN: token, CODECAINE_DOCS_REGISTRY: registryFile, CODECAINE_DOCS_GLOBAL_THEMES: join(stateDir, 'themes'), CODECAINE_DOCS_BUILD: buildHash, ...(args.judgment ? {} : { CODECAINE_DOCS_JUDGMENT: 'off' }), ...(profileDir ? { HUB_SOAK_PROFILE_DIR: profileDir } : {}) },
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
  log(`Runtime pid ${pid} on port ${port}, health ok (${health.projects} project${health.projects === 1 ? '' : 's'})`);

  // -- 3. The scripted hour ------------------------------------------------------
  const requests = { writes: 0, trees: 0, bundles: 0, assets: 0, assetBytes: 0, rpc: 0, sseReconnects: 0, errors: 0 };
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
  let assetIndex = 0;
  async function assetReads() {
    if (!assetFiles.length) return;
    await Promise.all(Array.from({ length: shape.assetReads }, async () => {
      const asset = assetFiles[assetIndex++ % assetFiles.length]!;
      try {
        const response = await fetch(`${api}/asset?path=${encodeURIComponent(asset.path)}`, { headers, signal: AbortSignal.timeout(30_000) });
        const body = await response.arrayBuffer();
        if (!response.ok) { fail('asset', `${response.status} ${asset.path}`); return; }
        requests.assets++; requests.assetBytes += body.byteLength;
      } catch (e) { fail('asset', String(e)); }
    }));
  }

  // -- 3a. The live hub's clients: agent loops over /rpc and SSE subscribers that reconnect -------------
  let done = false;
  /** One MCP tool call the way mcp.ts makes it, without identity (nothing reaches the action log). */
  async function rpc(workspace: string, name: string, toolArgs: Record<string, unknown>): Promise<any> {
    try {
      const response = await fetch(`${base}/rpc`, { method: 'POST', headers, body: JSON.stringify({ workspace, name, arguments: toolArgs }), signal: AbortSignal.timeout(120_000) });
      const text = await response.text();
      if (!response.ok) { fail(`rpc ${name}`, `${response.status} ${text}`); return undefined; }
      const result = JSON.parse(text);
      if (result.isError || result.structuredContent?.ok === false) { fail(`rpc ${name}`, text); return undefined; }
      requests.rpc++;
      return result.structuredContent;
    } catch (e) { fail(`rpc ${name}`, String(e)); return undefined; }
  }
  async function agentLoop(i: number) {
    await Bun.sleep(i * 250);
    const project = allProjects[i % allProjects.length]!;
    const begin = await rpc(project.root, 'docs_begin', {});
    const taskId = begin?.task_id as string | undefined;
    if (taskId) await rpc(project.root, 'docs_guidance', { task_id: taskId, topic: 'style' });
    for (let n = 0; !done && !pidChanged; n++) {
      await rpc(project.root, 'docs_tree', { project: project.id });
      const path = bundles[(i * 7 + n) % bundles.length]!;
      const read = await rpc(project.root, 'docs_read', { project: project.id, path });
      if (n % 10 === 9 && taskId && read?.doc) {
        const doc = read.doc, parentId = doc.root as string;
        const op = { type: 'insertBlock', blockId: `soak-rpc-${i}-${n}-${randomBytes(4).toString('hex')}`, parentId, index: doc.blocks[parentId].children.length, blockType: 'paragraph', props: {}, text: [{ insert: `Agent ${i} wrote paragraph ${n} at ${new Date().toISOString()}.` }] };
        await rpc(project.root, 'docs_apply_ops', { project: project.id, path, expected_hash: read.expected_hash, ops: [op], task_id: taskId });
      }
      await Bun.sleep(CLIENT_INTERVAL_MS);
    }
  }
  async function sseLoop(i: number) {
    await Bun.sleep(i * 100);
    while (!done && !pidChanged) {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), SSE_RECONNECT_MS);
      try {
        const response = await fetch(`${api}/events`, { headers, signal: abort.signal });
        const reader = response.body!.getReader();
        while (!(await reader.read()).done) {}
      } catch {} finally { clearTimeout(timer); }
      requests.sseReconnects++;
    }
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
  const background = [...Array.from({ length: shape.clients }, (_, i) => agentLoop(i)), ...Array.from({ length: shape.sse }, (_, i) => sseLoop(i))];
  for (let tick = 0; tick < loadTicks && !pidChanged; tick++) {
    await Bun.sleep(Math.max(0, t0 + tick * TICK_MS - Date.now()));
    await sample('load');
    await write(tick);
    if (shape.assetReads) await assetReads();
    if (tick % 6 === 0) await reads();
    if (tick % 6 === 0) { const s = samples.at(-1); log(`${Math.round((Date.now() - t0) / 1000)} s rss ${s ? Math.round(s.rssKb / 1024) : '?'} MB cpu ${s?.cpu ?? '?'}% ${JSON.stringify(requests)}`); }
  }
  // Clients stop before the snapshot and the idle window, so both see the retained state, not in-flight calls.
  done = true;
  if (background.length) await Promise.race([Promise.allSettled(background), Bun.sleep(15_000)]);
  // The runtime's own counts at the end of the load: open tasks, and the undo ledger's patches (an in-memory map).
  const healthAfterLoad = pidChanged ? undefined : await fetch(`${base}/health`, { headers, signal: AbortSignal.timeout(30_000) }).then(r => r.json()).catch(e => ({ error: String(e) }));
  // -- 3b. With --profile: a heap snapshot of the loaded runtime, before the idle window ---------
  let heap: Record<string, unknown> | undefined;
  if (profileDir && !pidChanged) {
    const statsFile = join(profileDir, 'heap-stats.json');
    await rm(statsFile, { force: true });
    await writeFile(join(profileDir, 'snapshot.request'), '');
    const deadline = Date.now() + 180_000;
    while (!existsSync(statsFile) && Date.now() < deadline && !pidChanged) await Bun.sleep(500);
    heap = existsSync(statsFile) ? JSON.parse(await readFile(statsFile, 'utf8')) : { error: pidChanged ? 'the runtime exited before the heap snapshot' : 'heap snapshot timed out after 180 s' };
    log(`Heap snapshot: ${heap!.error ?? `${Math.round(Number(heap!.snapshotBytes) / 1048576)} MB in ${heap!.ms} ms`}`);
  }
  const idleStart = Math.max(t0 + loadTicks * TICK_MS, Date.now());
  for (let i = 1; i <= IDLE_MS / TICK_MS && !pidChanged; i++) {
    await Bun.sleep(Math.max(0, idleStart + i * TICK_MS - Date.now()));
    await sample('idle');
  }

  // -- 4. Report -----------------------------------------------------------------
  // Stop first: with --profile the CPU and allocation profiles are written on this exit.
  await stopRuntime();
  const profile = profileDir ? { dir: profileDir, cpuProfile: args['cpu-profile'], files: (await readdir(profileDir)).sort(), heap } : undefined;
  const mean = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 10) / 10 : null;
  const report = {
    label: args.label, startedAt, minutes, pid, pidChanged,
    shape: { ...shape, projects: allProjects.length },
    healthAfterLoad,
    samples: samples.map(({ t, rssKb, cpu, phase }) => ({ t, rssKb, cpu, phase })),
    peakRssKb: Math.max(0, ...samples.map(s => s.rssKb)),
    meanCpu: mean(samples.filter(s => s.phase === 'load').map(s => s.cpu)),
    idleMeanCpu: mean(samples.filter(s => s.phase === 'idle').map(s => s.cpu)),
    copy: { folders: copy.folders, bundles: copy.bundles, mode: copy.mode, seconds: copy.seconds },
    requests, errorSamples,
    runtime: { build: buildHash.slice(0, 12), source, sourceRoot: relative(process.cwd(), sourceRoot) || '.', judgment: args.judgment ? 'on' : 'off', ...(args['runtime-build'] ? { prebuilt: resolve(args['runtime-build']), packageRoot } : {}) },
    ...(profile ? { profile } : {}),
  };
  await writeFile(out, JSON.stringify(report, null, 2) + '\n');
  log(`Wrote ${out}: peak ${Math.round(report.peakRssKb / 1024)} MB, mean cpu ${report.meanCpu}%, idle cpu ${report.idleMeanCpu}%, pidChanged ${pidChanged}`);
  if (profile) log(`Profile files in ${profile.dir}: ${profile.files.join(', ')}`);
} finally {
  await cleanup();
}
