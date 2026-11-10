import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openActionLog } from '@codecaine-ai/action-log';
import { serializeDocDocument } from '@codecaine-ai/docs-model';
import { createRpcRecorder, serveRpc, summarize } from './action-record';
import { createInteractionService } from './service';

let root: string; let workspace: string;
const saved = process.env.CODECAINE_ACTION_LOG;
const savedBuild = process.env.CODECAINE_DOCS_BUILD;
process.env.CODECAINE_DOCS_BUILD = 'test'; // managed services take their build id from the env, not from a checkout fingerprint
const service = createInteractionService({ managed: true });
let rpc: (name: string, args: Record<string, unknown>, identity: Record<string, unknown>) => Promise<any>;

beforeAll(async () => {
 root = await mkdtemp(join(tmpdir(), 'docs-action-log-'));
 process.env.CODECAINE_ACTION_LOG = join(root, 'log.sqlite');
 workspace = join(root, 'ws');
 await mkdir(join(workspace, 'docs', 'page'), { recursive: true });
 await writeFile(join(workspace, 'docs', 'page', 'doc.json'), serializeDocDocument({ schemaVersion: 1, id: 'p', title: 'P', root: 'root', blocks: { root: { id: 'root', type: 'paragraph', props: {}, children: [] } } } as any));
 // serveRpc is the daemon's /rpc route: run the call, then log it.
 const recorder = createRpcRecorder();
 rpc = (name, arguments_, identity) => serveRpc(service, recorder, { workspace, name, arguments: arguments_, identity });
});
afterAll(async () => {
 if (savedBuild === undefined) delete process.env.CODECAINE_DOCS_BUILD; else process.env.CODECAINE_DOCS_BUILD = savedBuild;
 if (saved === undefined) delete process.env.CODECAINE_ACTION_LOG; else process.env.CODECAINE_ACTION_LOG = saved;
 await rm(root, { recursive: true, force: true });
});

test('a call with an identity writes one record with its thread id and tool', async () => {
 await rpc('docs_discover', {}, { runId: 'run-a', threadId: 'thread-a', agent: 'claude-code' });
 const records = openActionLog().query({ threadId: 'thread-a' });
 expect(records.length).toBe(1);
 expect(records[0]).toMatchObject({ runId: 'run-a', threadId: 'thread-a', agent: 'claude-code', tool: 'docs_discover', target: '-', result: 'ok' });
});

test('docs_begin with thread_id binds the run, so earlier and later calls resolve to the thread', async () => {
 const begun = (await rpc('docs_begin', { thread_id: 'thread-b' }, { runId: 'run-b', threadId: null, agent: null })).structuredContent;
 expect(begun.ok).toBe(true);
 // Read the project id straight from the service, so no record joins the thread.
 const project = ((await service.call(workspace, 'docs_capabilities')).structuredContent as any).projects[0].id;
 expect((await rpc('docs_read', { project, path: 'page', task_id: begun.task_id }, { runId: 'run-b', threadId: null, agent: null })).structuredContent.ok).toBe(true);
 const records = openActionLog().query({ threadId: 'thread-b' });
 expect(records.map(r => r.tool)).toEqual(['docs_begin', 'docs_read']);
 expect(records[0]).toMatchObject({ agent: 'docs-mcp', snapshotId: begun.snapshot_id });
 expect(records[1]).toMatchObject({ target: 'page', result: '1 findings', snapshotId: begun.snapshot_id });
 // The managed service accepts every docs_begin, so a refusal is fed to the recorder directly.
 createRpcRecorder()({ name: 'docs_begin', arguments: { thread_id: 'thread-refused' }, identity: { runId: 'run-c', threadId: null, agent: null } }, { isError: true, structuredContent: { ok: false, detail: 'x' } });
 expect(openActionLog().query({ runId: 'run-c' })).toMatchObject([{ threadId: null, result: 'refused' }]);
 const missing = await rpc('docs_read', { project, path: 'missing-page' }, { runId: 'run-b', threadId: null, agent: null });
 expect(missing.structuredContent.detail).not.toContain('Project');
 expect(openActionLog().query({ threadId: 'thread-b' })[2]).toMatchObject({ target: 'missing-page', result: 'refused' });
});

test('the daemon\'s own probes, sent without an identity, write no record', async () => {
 const before = openActionLog().query().length;
 const result = await serveRpc(service, createRpcRecorder(), { workspace, name: 'docs_discover', arguments: {} });
 expect(result.structuredContent.ok).toBe(true);
 expect(openActionLog().query().length).toBe(before);
});

test('the result summary counts a write\'s style findings and a check\'s lint findings, and never carries error text', () => {
 expect(summarize({ structuredContent: { ok: true, style_findings: { shown: [{ rule: 'a' }], omitted: 2 } } })).toBe('3 findings');
 expect(summarize({ structuredContent: { ok: true, lint: { findings: [{ rule: 'a' }] } } })).toBe('1 findings');
 expect(summarize({ structuredContent: { ok: true, lint: { findings: [] } } })).toBe('ok');
 expect(summarize({ isError: true, structuredContent: { ok: false, lint: { findings: [{ rule: 'a' }, { rule: 'b' }] } } })).toBe('2 findings');
 expect(summarize({ isError: true, structuredContent: { detail: 'secret page text' } })).toBe('refused');
});
