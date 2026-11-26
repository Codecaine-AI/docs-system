import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createInteractionService } from '../service';
import { CLI_PATH } from '../lifecycle';
import { ROOT_MARKER } from '../root-marker';
import { docsFs } from '@codecaine-ai/docs-index/safe-path';

const SETTINGS = ['CODECAINE_DOCS_READ_ONLY', 'CODECAINE_DOCS_REQUIRED_ROOTS', 'CODECAINE_DOCS_CENTRAL_SITE', 'CODECAINE_DOCS_ROOT_ID'];
const saved = Object.fromEntries(SETTINGS.map(name => [name, process.env[name]]));
const temps: string[] = [];
afterEach(async () => {
  for (const name of SETTINGS) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
  await Promise.all(temps.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

const page = (id: string, text: string, link?: string) => ({ schemaVersion: 1, id, title: id, root: 'root', blocks: { root: { id: 'root', type: 'paragraph', props: {}, children: ['p'] }, p: { id: 'p', type: 'paragraph', props: {}, children: [], text: [link ? { insert: text, attributes: { link } } : { insert: text }] } } });
/** A whole-folder knowledge root with 2 pages, one linking to the other, and an optional root marker. */
async function knowledgeRoot(role?: string) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'docs-read-only-'))); temps.push(root);
  await writeFile(join(root, 'codecaine.docs.json'), JSON.stringify({ name: 'knowledge-base', docsRoot: '.' }));
  for (const [path, doc] of [['alpha', page('alpha', 'Alpha text.')], ['beta', page('beta', 'See alpha.', '../alpha')]] as const) {
    await mkdir(join(root, path), { recursive: true }); await writeFile(join(root, path, 'doc.json'), JSON.stringify(doc));
  }
  if (role) await writeFile(join(root, ROOT_MARKER), JSON.stringify({ kind: 'knowledge-root', id: 'kbr_test', role, name: 'Test', created: '2026-11-26T00:00:00Z' }));
  return root;
}
/** Every file below a root with its size and modified time. */
async function manifest(root: string) {
  const lines: string[] = [];
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    const path = join(entry.parentPath, entry.name); const s = await stat(path);
    lines.push(`${relative(root, path)} ${entry.isDirectory() ? 'dir' : `${s.size} ${s.mtimeMs}`}`);
  }
  return lines.sort();
}
async function open(root: string) {
  const service = createInteractionService({ judgmentEngine: null });
  const call = async (name: string, args: Record<string, unknown> = {}) => (await service.call(root, name, args)).structuredContent as any;
  const found = await call('docs_capabilities');
  return { service, call, found, project: found.projects[0]?.id as string | undefined };
}
async function tryWrite(call: (name: string, args?: Record<string, unknown>) => Promise<any>, project: string) {
  const read = await call('docs_read', { project, path: 'alpha' });
  const task = (await call('docs_begin')).task_id;
  await call('docs_guidance', { task_id: task, topic: 'style' });
  return call('docs_write_text', { task_id: task, project, path: 'alpha', expected_hash: read.hash, blockId: 'p', markdown: 'Changed.' });
}

test('a mirror root serves every read and metadata tool, refuses each write with 403, and writes nothing below the root', async () => {
  process.env.CODECAINE_DOCS_CENTRAL_SITE = 'knowledge.example.test';
  const root = await knowledgeRoot('mirror');
  const before = await manifest(root);
  const { service, call, found, project } = await open(root);
  try {
    expect(found.ok).toBe(true);
    expect((await call('docs_read', { project, path: 'alpha' })).markdown).toContain('Alpha text.');
    expect((await call('docs_tree', { project })).ok).toBe(true);
    expect((await call('docs_search', { project, query: 'Alpha' })).ok).toBe(true);
    expect((await call('docs_backlinks', { project, path: 'alpha' })).ok).toBe(true);
    expect((await call('docs_check', { project, path: 'alpha' })).ok).toBe(true);
    const refused = await tryWrite(call, project!);
    expect(refused).toMatchObject({ ok: false, status: 403 });
    expect(refused.detail).toContain('read-only mirror');
    expect(refused.detail).toContain('https://knowledge.example.test');
    const ui = (method: string, path: string, body?: unknown) => service.uiRequest(project!, new Request(`http://127.0.0.1/projects/${project}/api/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }));
    expect((await ui('GET', 'bundle?path=alpha')).status).toBe(200);
    const post = await ui('POST', 'title', { path: 'alpha', title: 'New' });
    expect(post.status).toBe(403);
    expect((await post.json() as any).detail).toContain('read-only mirror');
  } finally { service.close(); }
  expect(await manifest(root)).toEqual(before);
});

test('CODECAINE_DOCS_READ_ONLY=1 refuses writes on a root with no marker, and the same root writes without it', async () => {
  const root = await knowledgeRoot();
  process.env.CODECAINE_DOCS_READ_ONLY = '1';
  const guarded = await open(root);
  try {
    const refused = await tryWrite(guarded.call, guarded.project!);
    expect(refused).toMatchObject({ ok: false, status: 403 });
    expect(refused.detail).toContain('CODECAINE_DOCS_READ_ONLY=1');
  } finally { guarded.service.close(); }
  delete process.env.CODECAINE_DOCS_READ_ONLY;
  const open_ = await open(root);
  try { expect((await tryWrite(open_.call, open_.project!)).ok).toBe(true); } finally { open_.service.close(); }
});

test('a live root opens only when CODECAINE_DOCS_REQUIRED_ROOTS names it', async () => {
  const root = await knowledgeRoot('live');
  const stray = await open(root);
  try {
    expect(stray.found.projects).toEqual([]);
    expect(stray.found.warnings.join('\n')).toContain('is a live root, and CODECAINE_DOCS_REQUIRED_ROOTS does not name it');
  } finally { stray.service.close(); }
  process.env.CODECAINE_DOCS_REQUIRED_ROOTS = root;
  const listed = await open(root);
  try { expect((await tryWrite(listed.call, listed.project!)).ok).toBe(true); } finally { listed.service.close(); }
});

test('a required root with no marker or a marker that does not parse refuses its project', async () => {
  const root = await knowledgeRoot();
  process.env.CODECAINE_DOCS_REQUIRED_ROOTS = root;
  const missing = await open(root);
  try { expect(missing.found.projects).toEqual([]); expect(missing.found.warnings.join('\n')).toContain(`has no ${ROOT_MARKER}`); } finally { missing.service.close(); }
  await writeFile(join(root, ROOT_MARKER), '{not json');
  const broken = await open(root);
  try { expect(broken.found.projects).toEqual([]); expect(broken.found.warnings.join('\n')).toContain('is not valid JSON'); } finally { broken.service.close(); }
});

test('the docs daemon refuses to start with exit 78 when a required root has no valid marker', async () => {
  const root = await knowledgeRoot();
  const state = join(root, '..', `${relative(join(root, '..'), root)}-state`); temps.push(state);
  const start = (env: Record<string, string>) => Bun.spawnSync([process.execPath, CLI_PATH, 'daemon'], { env: { ...process.env, CODECAINE_ENV_FILE: join(root, 'no-env'), CODECAINE_DOCS_STATE_DIR: state, ...env } as Record<string, string>, timeout: 15000 });
  const missing = start({ CODECAINE_DOCS_REQUIRED_ROOTS: root });
  expect(missing.exitCode).toBe(78);
  expect(missing.stderr.toString()).toContain(`has no ${ROOT_MARKER}`);
  await writeFile(join(root, ROOT_MARKER), JSON.stringify({ kind: 'knowledge-root', id: 'kbr_other', role: 'live' }));
  const wrongId = start({ CODECAINE_DOCS_REQUIRED_ROOTS: root, CODECAINE_DOCS_ROOT_ID: 'kbr_test' });
  expect(wrongId.exitCode).toBe(78);
  expect(wrongId.stderr.toString()).toContain('not CODECAINE_DOCS_ROOT_ID kbr_test');
}, 30000);

const marker = (role: string) => JSON.stringify({ kind: 'knowledge-root', id: 'kbr_test', role });

test('a backup root is refused, with or without a listing', async () => {
  const root = await knowledgeRoot('backup');
  const stray = await open(root);
  try { expect(stray.found.projects).toEqual([]); expect(stray.found.warnings.join('\n')).toContain('is a backup copy'); } finally { stray.service.close(); }
  process.env.CODECAINE_DOCS_REQUIRED_ROOTS = root;
  const listed = await open(root);
  try { expect(listed.found.projects).toEqual([]); } finally { listed.service.close(); }
});

test('a marker deeper inside a listed live root counts: a backup copy is refused and a mirror copy opens read-only', async () => {
  // A listed live folder that holds a docs project one level down, so the copy is its own project.
  const live = await realpath(await mkdtemp(join(tmpdir(), 'docs-listed-live-'))); temps.push(live);
  await writeFile(join(live, ROOT_MARKER), marker('live'));
  const copy = join(live, 'kb'); await mkdir(join(copy, 'alpha'), { recursive: true });
  await writeFile(join(copy, 'codecaine.docs.json'), JSON.stringify({ name: 'copy', docsRoot: '.' }));
  await writeFile(join(copy, 'alpha', 'doc.json'), JSON.stringify(page('alpha', 'Copy text.')));
  process.env.CODECAINE_DOCS_REQUIRED_ROOTS = live;
  const plain = await open(copy);
  try { expect((await tryWrite(plain.call, plain.project!)).ok).toBe(true); } finally { plain.service.close(); }
  await writeFile(join(copy, ROOT_MARKER), marker('backup'));
  const backup = await open(copy);
  try { expect(backup.found.projects).toEqual([]); } finally { backup.service.close(); }
  await writeFile(join(copy, ROOT_MARKER), marker('mirror'));
  const mirror = await open(copy);
  try { expect((await tryWrite(mirror.call, mirror.project!))).toMatchObject({ ok: false, status: 403 }); } finally { mirror.service.close(); }
});

test('a listed root named through a symlink opens like its real path', async () => {
  const root = await knowledgeRoot('live');
  const link = `${root}-link`; temps.push(link); await symlink(root, link);
  process.env.CODECAINE_DOCS_REQUIRED_ROOTS = link;
  const listed = await open(root);
  try { expect((await tryWrite(listed.call, listed.project!)).ok).toBe(true); } finally { listed.service.close(); }
});

test('a read-only root refuses docs_create, docs_set_title and docs_apply_ops, and lets an OPTIONS preflight through', async () => {
  const root = await knowledgeRoot('mirror');
  const { service, call, project } = await open(root);
  try {
    const task = (await call('docs_begin')).task_id;
    for (const [name, args] of [['docs_create', { path: 'new' }], ['docs_set_title', { path: 'alpha', title: 'New' }], ['docs_apply_ops', { path: 'alpha', ops: [] }]] as const)
      expect(await call(name, { task_id: task, project, ...args })).toMatchObject({ ok: false, status: 403 });
    const preflight = await service.uiRequest(project!, new Request(`http://127.0.0.1/projects/${project}/api/ops`, { method: 'OPTIONS' }));
    expect(preflight.status).not.toBe(403);
  } finally { service.close(); }
});

test('a root that turns read-only after discovery writes no backlinks index, and a live marker that appears closes the project', async () => {
  const root = await knowledgeRoot();
  const { service, call, project } = await open(root);
  try {
    await writeFile(join(root, ROOT_MARKER), marker('mirror'));
    const before = await manifest(root);
    expect((await call('docs_backlinks', { project, path: 'alpha' })).ok).toBe(true);
    expect((await service.uiRequest(project!, new Request(`http://127.0.0.1/projects/${project}/api/backlinks?target=alpha`))).status).toBe(200);
    expect(await manifest(root)).toEqual(before);
    await writeFile(join(root, ROOT_MARKER), marker('live'));
    expect((await call('docs_read', { project, path: 'alpha' })).detail).toContain('Project is not in this workspace');
  } finally { service.close(); }
});

test('a listed root that loses its marker or gets one with another id refuses each write with 503, and writes again when the marker is back', async () => {
  const root = await knowledgeRoot('live');
  process.env.CODECAINE_DOCS_REQUIRED_ROOTS = root;
  process.env.CODECAINE_DOCS_ROOT_ID = 'kbr_test';
  const { service, call, project } = await open(root);
  const alpha = () => readFile(join(root, 'alpha', 'doc.json'), 'utf8');
  const ui = (method: string, path: string, body?: unknown) => service.uiRequest(project!, new Request(`http://127.0.0.1/projects/${project}/api/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }));
  try {
    const task = (await call('docs_begin')).task_id;
    await call('docs_guidance', { task_id: task, topic: 'style' });
    const hash = (await call('docs_read', { project, path: 'alpha' })).hash;
    const before = await alpha();
    for (const lose of [() => rm(join(root, ROOT_MARKER)), () => writeFile(join(root, ROOT_MARKER), JSON.stringify({ kind: 'knowledge-root', id: 'kbr_other', role: 'live' }))]) {
      await lose();
      // A tool write, a project API write, and any other write through the guarded filesystem.
      const refused = await call('docs_write_text', { task_id: task, project, path: 'alpha', expected_hash: hash, blockId: 'p', markdown: 'Changed.' });
      expect(refused).toMatchObject({ ok: false, status: 503 });
      expect(refused.detail).toContain('The docs root is lost or changed');
      const post = await ui('POST', 'title', { path: 'alpha', title: 'New', expected_hash: hash });
      expect(post.status).toBe(503);
      expect((await post.json() as any).detail).toContain('refuses each write until the root marker is back');
      await expect(docsFs(root).atomicWrite('alpha/doc.json', '{}')).rejects.toMatchObject({ status: 503, reason: 'root-lost' });
      expect(await alpha()).toBe(before);
      // Reads still answer.
      expect(await docsFs(root).readFile('alpha/doc.json', 'utf8')).toBe(before);
    }
    await writeFile(join(root, ROOT_MARKER), marker('live'));
    expect((await call('docs_write_text', { task_id: task, project, path: 'alpha', expected_hash: hash, blockId: 'p', markdown: 'Changed.' })).ok).toBe(true);
  } finally { service.close(); }
});

test('a project API write to a project whose marker was missing at discovery answers 503, and a read answers 404', async () => {
  const root = await knowledgeRoot();
  process.env.CODECAINE_DOCS_REQUIRED_ROOTS = root;
  const { service, found } = await open(root);
  try {
    expect(found.projects).toEqual([]);
    const id = (await (await import('../discovery')).discoverProjects(root)).projects[0]!.id;
    const ui = (method: string) => service.uiRequest(id, new Request(`http://127.0.0.1/projects/${id}/api/title`, { method, headers: { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify({ path: 'alpha', title: 'New' }) }));
    const post = await ui('POST');
    expect(post.status).toBe(503);
    expect((await post.json() as any).detail).toContain('The docs root is lost or changed');
    expect((await ui('GET')).status).toBe(404);
  } finally { service.close(); }
});
