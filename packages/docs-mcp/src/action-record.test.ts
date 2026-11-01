import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openActionLog } from '@codecaine-ai/action-log';
import { serializeDocDocument } from '@codecaine-ai/docs-model';
import { createRpcRecorder, serveRpc } from './action-record';
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
 await rpc('docs_read', { path: 'page' }, { runId: 'run-b', threadId: null, agent: null });
 const records = openActionLog().query({ threadId: 'thread-b' });
 expect(records.map(r => r.tool)).toEqual(['docs_begin', 'docs_read']);
 expect(records[0]).toMatchObject({ agent: 'docs-mcp', snapshotId: begun.snapshot_id });
 expect(records[1]!.target).toBe('page');
 await rpc('docs_read', { path: 'missing-page' }, { runId: 'run-b', threadId: null, agent: null });
 expect(openActionLog().query({ threadId: 'thread-b' })[2]).toMatchObject({ target: 'missing-page', result: 'refused' });
});
