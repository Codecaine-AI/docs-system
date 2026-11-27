import { afterAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { PACKAGE_ROOT } from '../lifecycle';

const SUPERVISOR = join(PACKAGE_ROOT, 'src/background/supervisor.ts');
const KEY = 'scratch-upstream-key-for-the-test';
const temps: string[] = [];
const children: ReturnType<typeof Bun.spawn>[] = [];
afterAll(async () => {
  for (const child of children) { child.kill('SIGKILL'); await child.exited; }
  await Promise.all(temps.map(dir => rm(dir, { recursive: true, force: true })));
});

/** A scratch supervisor config: its own state folder, an OS-assigned port, and one workspace with one page. */
async function scratch() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'docs-supervisor-guard-'))); temps.push(root);
  await mkdir(join(root, 'ws', 'page'), { recursive: true });
  await writeFile(join(root, 'ws', 'codecaine.docs.json'), JSON.stringify({ name: 'scratch', docsRoot: '.' }));
  await writeFile(join(root, 'ws', 'page', 'doc.json'), JSON.stringify({ schemaVersion: 1, id: 'page', title: 'Page', root: 'root', blocks: { root: { id: 'root', type: 'paragraph', props: {}, children: [] } } }));
  await writeFile(join(root, 'config.json'), JSON.stringify({ sourceRoot: resolve(PACKAGE_ROOT, '../..'), workspace: join(root, 'ws'), port: 0, stateDirectory: join(root, 'state') }));
  await writeFile(join(root, 'key'), `${KEY}\n`);
  return { root, env: { ...process.env, CODECAINE_ENV_FILE: join(root, 'no-env'), CODECAINE_DOCS_BACKGROUND_CONFIG: join(root, 'config.json') } as Record<string, string> };
}

test('with an upstream key file and the viewer off, only /health passes without the key, and the viewer routes answer 404', async () => {
  const { root, env } = await scratch();
  const child = Bun.spawn([process.execPath, SUPERVISOR], { env: { ...env, CODECAINE_DOCS_UPSTREAM_KEY_FILE: join(root, 'key'), CODECAINE_DOCS_VIEWER: '0' }, stdout: 'pipe', stderr: 'pipe' });
  children.push(child);
  let out = '';
  const reader = (child.stdout as ReadableStream<Uint8Array>).getReader();
  while (!out.includes('"ready":true')) { const part = await reader.read(); if (part.done) break; out += new TextDecoder().decode(part.value); }
  const { port } = JSON.parse(out.split('\n').find(line => line.includes('"ready":true'))!);
  const token = (await readFile(join(root, 'state', 'service-token'), 'utf8')).trim();
  const get = (path: string, key?: string) => fetch(`http://127.0.0.1:${port}${path}`, { headers: { authorization: `Bearer ${token}`, ...(key === undefined ? {} : { 'x-kb-upstream-key': key }) } });
  // /health without both credentials answers only whether the server runs.
  const bare = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  expect(bare).toEqual({ service: 'codecaine-docs', ready: true, viewer: false });
  expect(Object.keys(await (await get('/health')).json() as object).sort()).toEqual(['ready', 'service', 'viewer']);
  expect(await (await get('/health', KEY)).json()).toMatchObject({ service: 'codecaine-docs', pid: child.pid });
  // The remote client's health check passes with the small answer.
  const remoteStart = Bun.spawnSync([process.execPath, join(PACKAGE_ROOT, 'src/cli.ts'), 'start', '--workspace', join(root, 'ws')], { env: { ...env, CODECAINE_DOCS_STATE_DIR: join(root, 'client'), CODECAINE_DOCS_REMOTE_URL: `http://127.0.0.1:${port}` } });
  expect(JSON.parse(remoteStart.stdout.toString())).toMatchObject({ remote: true });
  expect((await get('/tools')).status).toBe(401);
  expect((await get('/tools', 'wrong')).status).toBe(401);
  expect((await get('/tools', KEY)).status).toBe(200);
  expect((await get('/__viewer/', KEY)).status).toBe(404);
  const projectId = `scratch-${createHash('sha256').update(join(root, 'ws')).digest('hex').slice(0, 8)}`;
  expect((await fetch(`http://127.0.0.1:${port}/projects/${projectId}/docs`, { redirect: 'manual', headers: { 'x-kb-upstream-key': KEY } })).status).toBe(404);
  // A WebSocket upgrade without the key is refused before the viewer route.
  const opened = await new Promise<boolean>(done => { const ws = new WebSocket(`ws://127.0.0.1:${port}/__viewer/`); ws.onopen = () => { ws.close(); done(true); }; ws.onerror = () => done(false); ws.onclose = () => done(false); });
  expect(opened).toBe(false);
  const status = await (await get('/api/status', KEY)).json() as any;
  expect(status).toMatchObject({ ready: true, viewer: false });
  child.kill('SIGKILL'); await child.exited;
  const logs = await new Response(child.stderr as ReadableStream).text();
  expect(logs).toContain('Refused GET /tools');
  expect(logs).toContain('Refused GET /__viewer/');
  expect(logs).not.toContain(KEY);
}, 60000);

test('a key file setting that names an empty or a missing file stops the supervisor with exit 78', async () => {
  const { root, env } = await scratch();
  await writeFile(join(root, 'empty'), '');
  for (const [file, text] of [['empty', 'names an empty file'], ['missing', 'cannot be read']]) {
    const run = Bun.spawnSync([process.execPath, SUPERVISOR], { env: { ...env, CODECAINE_DOCS_UPSTREAM_KEY_FILE: join(root, file) }, timeout: 20000 });
    expect(run.exitCode).toBe(78);
    expect(run.stderr.toString()).toContain(text);
  }
}, 30000);
