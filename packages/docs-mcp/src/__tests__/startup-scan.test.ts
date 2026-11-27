import { afterAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PACKAGE_ROOT } from '../lifecycle';

const temps: string[] = [];
const children: ReturnType<typeof Bun.spawn>[] = [];
afterAll(async () => {
  for (const child of children) { child.kill('SIGKILL'); await child.exited; }
  await Promise.all(temps.map(dir => rm(dir, { recursive: true, force: true })));
});

/**
 * A registry of two workspaces. The scan of the first never ends: its members.json is a FIFO with no writer, so the
 * read blocks, as a read on a dead network mount does. The second holds the project scratch-1 with one page. A scan
 * in registry order never reaches the second.
 */
async function scratch() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'docs-startup-scan-'))); temps.push(root);
  const stuck = join(root, 'stuck');
  await mkdir(stuck);
  expect(Bun.spawnSync(['mkfifo', join(stuck, 'members.json')]).exitCode).toBe(0);
  const ws = join(root, 'ws');
  await mkdir(join(ws, 'page'), { recursive: true });
  await writeFile(join(ws, 'codecaine.docs.json'), JSON.stringify({ name: 'scratch', docsRoot: '.' }));
  await writeFile(join(ws, 'page', 'doc.json'), JSON.stringify({ schemaVersion: 1, id: 'page', title: 'Page', root: 'root', blocks: { root: { id: 'root', type: 'paragraph', props: {}, children: [] } } }));
  const state = join(root, 'state');
  await mkdir(state);
  await writeFile(join(state, 'projects.json'), JSON.stringify({ schemaVersion: 1, workspaces: [stuck, ws], projects: [{ id: 'scratch-1', name: 'scratch', root: ws, docsRoot: ws, products: ['docs'] }] }));
  return { root, ws, state };
}

/** Starts the process and returns its ready line, parsed. */
async function ready(command: string[], env: Record<string, string>) {
  const child = Bun.spawn(command, { cwd: PACKAGE_ROOT, env: { ...process.env, ...env }, stdout: 'pipe', stderr: 'ignore' });
  children.push(child);
  const reader = (child.stdout as ReadableStream<Uint8Array>).getReader();
  let out = '';
  while (!out.includes('"ready":true')) {
    const part = await reader.read();
    if (part.done) throw new Error('The process exited before its ready line');
    out += new TextDecoder().decode(part.value);
  }
  return { child, line: JSON.parse(out.split('\n').find(line => line.includes('"ready":true'))!) as { port: number } };
}

test('the service starts and writes daemon.json for clients while the scan of a registered workspace never ends', async () => {
  const { root, ws, state } = await scratch();
  await writeFile(join(root, 'config.json'), JSON.stringify({ sourceRoot: resolve(PACKAGE_ROOT, '../..'), workspace: ws, port: 0, stateDirectory: state }));
  const { child, line } = await ready([process.execPath, join(PACKAGE_ROOT, 'src/background/supervisor.ts')], { CODECAINE_ENV_FILE: join(root, 'no-env'), CODECAINE_DOCS_BACKGROUND_CONFIG: join(root, 'config.json'), CODECAINE_DOCS_VIEWER: '0' });
  // A client takes the service as running when daemon.json names the pid that /health reports.
  expect(JSON.parse(await readFile(join(state, 'daemon.json'), 'utf8'))).toMatchObject({ url: `http://127.0.0.1:${line.port}`, pid: child.pid });
});

test('the managed runtime serves a registered project while the scan of another registered workspace never ends', async () => {
  const { state } = await scratch();
  const { line } = await ready([process.execPath, join(PACKAGE_ROOT, 'src/managed-runtime.ts')], { CODECAINE_DOCS_RUNTIME_TOKEN: 'test-token', CODECAINE_DOCS_REGISTRY: join(state, 'projects.json'), CODECAINE_DOCS_BUILD: 'test' });
  const tree = await fetch(`http://127.0.0.1:${line.port}/projects/scratch-1/api/tree`, { headers: { authorization: 'Bearer test-token' } });
  expect(tree.status).toBe(200);
  expect(await tree.json()).toEqual({ tree: [{ name: 'page', path: 'page', kind: 'bundle' }] });
});
