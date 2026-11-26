import { afterAll, beforeAll, expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLI_PATH } from '../lifecycle';

// One real docs daemon stands in for the remote server. Each client runs the CLI or the MCP bridge in remote mode,
// with its own empty state folder, so a client that started a local daemon would leave a daemon.json there.
let root: string, serverWs: string, localWs: string, codeWs: string, tokenFile: string, daemon: ReturnType<typeof Bun.spawn>, url: string, projectId: string;
const doc = { schemaVersion: 1, id: 'page', title: 'Page', root: 'root', blocks: { root: { id: 'root', type: 'paragraph', props: {}, children: ['p'] }, p: { id: 'p', type: 'paragraph', props: {}, children: [], text: [{ insert: 'Server text.' }] } } };
const quiet = () => ({ ...process.env, CODECAINE_ENV_FILE: join(root, 'no-env') }) as Record<string, string>;

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'docs-remote-mode-')));
  serverWs = join(root, 'server', 'knowledge-base'); localWs = join(root, 'laptop', 'knowledge-base'); codeWs = join(root, 'code-repo');
  await mkdir(join(serverWs, 'page'), { recursive: true }); await mkdir(localWs, { recursive: true }); await mkdir(codeWs, { recursive: true });
  await writeFile(join(serverWs, 'codecaine.docs.json'), JSON.stringify({ name: 'knowledge-base', docsRoot: '.' }));
  await writeFile(join(serverWs, 'page', 'doc.json'), JSON.stringify(doc));
  // The id rule: the slug, then the first 8 hex digits of the sha256 of the server's docs root.
  projectId = `knowledge-base-${createHash('sha256').update(serverWs).digest('hex').slice(0, 8)}`;
  const serverState = join(root, 'server-state');
  daemon = Bun.spawn([process.execPath, CLI_PATH, 'daemon'], { env: { ...quiet(), CODECAINE_DOCS_STATE_DIR: serverState }, stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 200 && !existsSync(join(serverState, 'daemon.json')); i++) await Bun.sleep(50);
  const state = JSON.parse(await readFile(join(serverState, 'daemon.json'), 'utf8'));
  url = state.url; tokenFile = join(root, 'remote-token'); await writeFile(tokenFile, state.token);
}, 20000);
const clientStates: string[] = [];
afterAll(async () => {
  // A failing run may have started a local daemon in a client state folder: stop it before the folder goes.
  for (const state of clientStates) try { const d = JSON.parse(await readFile(join(state, 'daemon.json'), 'utf8')); await fetch(`${d.url}/shutdown`, { method: 'POST', headers: { authorization: `Bearer ${d.token}` } }); } catch {}
  daemon?.kill(); await daemon?.exited; await rm(root, { recursive: true, force: true });
});

function client(name: string, settings: Record<string, string>) {
  const state = join(root, `client-${name}`);
  clientStates.push(state);
  const env = { ...quiet(), CODECAINE_DOCS_STATE_DIR: state, CODECAINE_DOCS_REMOTE_URL: url, CODECAINE_DOCS_REMOTE_TOKEN_FILE: tokenFile, ...settings };
  const run = (workspace: string, command: string[]) => {
    const proc = Bun.spawnSync([process.execPath, CLI_PATH, ...command, '--workspace', workspace], { env });
    return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString(), json: () => JSON.parse(proc.stdout.toString()) };
  };
  return { env, run, startedDaemon: () => existsSync(join(state, 'daemon.json')) };
}

test('a mapped laptop workspace reads and writes the server files under the server project id, and starts no local daemon', async () => {
  const laptop = client('mapped', { CODECAINE_DOCS_REMOTE_PATH_MAP: `${localWs}=${serverWs}` });
  const capabilities = laptop.run(localWs, ['capabilities']).json();
  expect(capabilities.structuredContent.scope.workspace).toBe(serverWs);
  expect(capabilities.structuredContent.projects.map((p: any) => p.id)).toEqual([projectId]);
  const call = (name: string, args: Record<string, unknown>) => laptop.run(localWs, ['call', name, '--args', JSON.stringify(args)]).json().structuredContent;
  const read = call('docs_read', { project: projectId, path: 'page' });
  expect(read.markdown).toContain('Server text.');
  const task = call('docs_begin', {}).task_id;
  call('docs_guidance', { task_id: task, topic: 'style' });
  expect(call('docs_write_text', { task_id: task, project: projectId, path: 'page', expected_hash: read.hash, blockId: 'p', markdown: 'Laptop text.' }).ok).toBe(true);
  expect(await readFile(join(serverWs, 'page', 'doc.json'), 'utf8')).toContain('Laptop text.');
  expect(laptop.startedDaemon()).toBe(false);
}, 30000);

test('a call that names the remote project from an unmapped workspace goes to the default remote workspace', () => {
  const thread = client('project', { CODECAINE_DOCS_REMOTE_PROJECTS: projectId, CODECAINE_DOCS_REMOTE_WORKSPACE: serverWs });
  const read = thread.run(codeWs, ['call', 'docs_read', '--args', JSON.stringify({ project: projectId, path: 'page' })]);
  expect(read.code).toBe(0);
  expect(read.json().structuredContent.ok).toBe(true);
  expect(thread.startedDaemon()).toBe(false);
}, 20000);

test('the MCP bridge maps its workspace, and its calls without a project stay on the remote route after docs_capabilities', async () => {
  // The map names a symlink, so the server replies with a real path that is under no mapped prefix.
  const serverLink = join(root, 'server-link'); await symlink(serverWs, serverLink);
  const laptop = client('mcp', { CODECAINE_DOCS_REMOTE_PATH_MAP: `${localWs}=${serverLink}`, CODECAINE_DOCS_REMOTE_PROJECTS: projectId });
  const mcp = new Client({ name: 'remote-qa', version: '1.0' });
  await mcp.connect(new StdioClientTransport({ command: process.execPath, args: [CLI_PATH, 'mcp', '--workspace', localWs], env: laptop.env }));
  try {
    expect((await mcp.listTools()).tools.length).toBeGreaterThan(40);
    const found = (await mcp.callTool({ name: 'docs_capabilities', arguments: { workspace: localWs } })).structuredContent as any;
    expect(found.projects.map((p: any) => p.id)).toEqual([projectId]);
    const read = (await mcp.callTool({ name: 'docs_read', arguments: { project: projectId, path: 'page' } })).structuredContent as any;
    expect(read.ok).toBe(true);
    const begun = (await mcp.callTool({ name: 'docs_begin', arguments: {} })).structuredContent as any;
    expect((await mcp.callTool({ name: 'docs_guidance', arguments: { task_id: begun.task_id, topic: 'style' } })).structuredContent).toMatchObject({ ok: true });
  } finally { await mcp.close(); }
  expect(laptop.startedDaemon()).toBe(false);
}, 20000);

test('with the remote server down, a call fails with a clear error and no local daemon starts', () => {
  const offline = client('down', { CODECAINE_DOCS_REMOTE_URL: 'http://127.0.0.1:9', CODECAINE_DOCS_REMOTE_PATH_MAP: `${localWs}=${serverWs}` });
  const result = offline.run(localWs, ['capabilities']);
  expect(result.code).toBe(1);
  expect(result.err).toContain('The remote docs server at http://127.0.0.1:9 is not available');
  expect(offline.startedDaemon()).toBe(false);
}, 20000);
