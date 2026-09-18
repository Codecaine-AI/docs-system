import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localBrowserRequest, mergeDiscovery, projectRoute, readRegistry, writeRegistry } from '../background/registry';
import { createInteractionService } from '../service';
import { createDocsStore } from '@codecaine-ai/docs-server/store';
import { FS_WATCH_ACTOR } from '@codecaine-ai/docs-server/fs-watch';
import { DraftLockStore } from '@codecaine-ai/docs-server/draft-locks';
import { projectStorage, projectStorageKey } from '../../../docs-workbench/web/src/data/project-storage';

test('draft counts exclude other projects and expired leases', () => {
  const base = new DraftLockStore(1000);
  const a = base.forRoot('/tmp/docs-lock-count-a');
  const b = base.forRoot('/tmp/docs-lock-count-b');
  const time = new Date('2026-01-01T00:00:00Z');
  a.acquire({ kind: 'doc', path: 'page' }, 'a', time);
  b.acquire({ kind: 'doc', path: 'page' }, 'b', time);
  expect(a.activeCount(time)).toBe(1);
  expect(b.activeCount(time)).toBe(1);
  expect(a.activeCount(new Date(time.getTime() + 1001))).toBe(0);
});

test('central projects do not share browser preferences or document caches', () => {
  const previous = window.location.href;
  try {
    window.location.href = 'http://localhost:4820/projects/a/docs/';
    projectStorage.setItem('central-test', 'A');
    window.location.href = 'http://localhost:4820/projects/b/docs/';
    expect(projectStorage.getItem('central-test')).toBeNull();
    projectStorage.setItem('central-test', 'B');
    window.location.href = 'http://localhost:4820/projects/a/docs/';
    expect(projectStorage.getItem('central-test')).toBe('A');
    projectStorage.removeItem('central-test');
    window.location.href = 'http://localhost:4820/projects/b/docs/';
    projectStorage.removeItem('central-test');
    window.location.href = 'http://localhost:4808/';
    expect(projectStorageKey('existing-key')).toBe('existing-key');
  } finally { window.location.href = previous; }
});

test('project registration persists stable IDs and keeps different projects distinct', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'docs-registry-'));
  try {
    const file = join(temp, 'projects.json');
    let registry = await readRegistry(file, temp);
    const a = { id: 'a', name: 'A', root: join(temp, 'a'), docsRoot: join(temp, 'a/docs'), products: ['docs'] };
    const b = { ...a, id: 'b', name: 'B', root: join(temp, 'b'), docsRoot: join(temp, 'b/docs') };
    registry = mergeDiscovery(registry, temp, [a, b]);
    registry = mergeDiscovery(registry, temp, [{ ...a, id: 'changed-discovery-id' }]);
    await writeRegistry(file, registry);
    const restored = await readRegistry(file, temp);
    expect(restored.projects.map(p => p.id)).toEqual(['a', 'b']);
    expect(restored.workspaces).toEqual([temp]);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('central routes preserve the project for API requests and normalize the document base', () => {
  expect(projectRoute('/projects/a/docs/api/tree')).toEqual({ id: 'a', apiPath: '/projects/a/api/tree' });
  expect(projectRoute('/projects/b/docs/api/ops')).toEqual({ id: 'b', apiPath: '/projects/b/api/ops' });
  expect(projectRoute('/projects/a/docs')).toEqual({ id: 'a', redirect: '/projects/a/docs/' });
  expect(projectRoute('/projects/a/docs/')).toEqual({ id: 'a' });
  expect(projectRoute('/projects/%2e%2e/docs/api/tree')).toBeNull();
  expect(projectRoute('/other')).toBeNull();
});

test('browser routes refuse foreign origins, sibling origins, and non-loopback hosts', () => {
  const request = (url: string, headers: Record<string, string> = {}) => ({ url, headers: new Headers(headers) }) as Request;
  expect(localBrowserRequest(new Request('http://localhost:4820/api/projects'))).toBe(true);
  expect(localBrowserRequest(new Request('http://localhost:4820/api/projects', { headers: { origin: 'http://localhost:4820', 'sec-fetch-site': 'same-origin' } }))).toBe(true);
  expect(localBrowserRequest(request('http://localhost:4820/api/projects', { origin: 'https://example.com' }))).toBe(false);
  expect(localBrowserRequest(request('http://localhost:4820/api/projects', { 'sec-fetch-site': 'same-site' }))).toBe(false);
  expect(localBrowserRequest(new Request('http://attacker.test:4820/api/projects'))).toBe(false);
});

test('managed projects isolate writes and publish external file changes to the active store', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'docs-managed-'));
  const service = createInteractionService({ managed: true, watchFs: true });
  let unsubscribe = () => {};
  try {
    await writeFile(join(temp, 'codecaine.docs.json'), JSON.stringify({ projects: ['a', 'b'] }));
    const doc = { schemaVersion: 1, id: 'test', title: 'Test', root: 'root', blocks: { root: { id: 'root', type: 'paragraph', props: {}, children: ['p'] }, p: { id: 'p', type: 'paragraph', props: {}, text: [{ insert: 'Initial.' }], children: [] } } };
    for (const name of ['a', 'b']) { await mkdir(join(temp, name, 'docs/page'), { recursive: true }); await writeFile(join(temp, name, 'docs/page/doc.json'), JSON.stringify(doc)); }
    const found = await service.discover(temp);
    const [a, b] = found.projects;
    expect(found.projects).toHaveLength(2);
    const begin = (await service.call(temp, 'docs_begin')).structuredContent as any;
    expect(begin.ok).toBe(true);
    const read = (await service.call(temp, 'docs_read', { project: a!.id, path: 'page' })).structuredContent as any;
    const saved = (await service.call(temp, 'docs_write_text', { project: a!.id, path: 'page', blockId: 'p', markdown: 'Changed A.', task_id: begin.task_id, expected_hash: read.hash })).structuredContent as any;
    expect(saved.ok).toBe(true);
    const other = (await service.call(temp, 'docs_read', { project: b!.id, path: 'page' })).structuredContent as any;
    expect(other.markdown).toContain('Initial.');
    const response = await service.uiRequest(a!.id, new Request(`http://localhost/projects/${a!.id}/api/tree`));
    expect(response.status).toBe(200);
    const events: string[] = [];
    unsubscribe = createDocsStore(a!.docsRoot).subscribeChanges(event => events.push(event.actor));
    await writeFile(join(a!.docsRoot, 'page/doc.json'), JSON.stringify(doc));
    for (let i = 0; i < 40 && !events.includes(FS_WATCH_ACTOR); i++) await Bun.sleep(25);
    expect(events).toContain(FS_WATCH_ACTOR);
    await service.call(temp, 'docs_end', { task_id: begin.task_id });
  } finally { unsubscribe(); service.close(); await rm(temp, { recursive: true, force: true }); }
});
