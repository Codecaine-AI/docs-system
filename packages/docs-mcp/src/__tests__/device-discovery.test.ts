import { expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, rm, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyDeviceScan, scanDevice } from '../background/device-discovery';
import { discoverProjects } from '../discovery';
import { mergeDiscovery, readRegistry, writeRegistry } from '../background/registry';
import { directoryHtml } from '../background/home';
import { Window } from 'happy-dom';

const document = { schemaVersion: 1, id: 'test', title: 'Test', root: 'root', blocks: { root: { id: 'root', type: 'paragraph', props: {}, children: ['p'] }, p: { id: 'p', type: 'paragraph', props: {}, text: [{ insert: 'Device docs.' }], children: [] } } };
test('device discovery registers native and custom corpora, deduplicates aliases, and skips generated copies', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'docs-device-')));
  try {
    for (const path of ['project/docs', 'custom/knowledge', 'markdown/docs', 'node_modules/copied/docs', '.backup/copied/docs', 'archive/copied/docs', 'external/copied/docs', 'outputs/generated/docs', 'runs/generated/docs', 'repo-backup-2026/docs']) {
      await mkdir(join(temp, path, 'page'), { recursive: true });
      if (!path.startsWith('markdown')) await writeFile(join(temp, path, 'page/doc.json'), JSON.stringify(document));
    }
    await writeFile(join(temp, 'markdown/docs/readme.md'), '# Not migrated');
    await writeFile(join(temp, 'custom/codecaine.docs.json'), JSON.stringify({ name: 'Custom', docsRoot: 'knowledge' }));
    await symlink(join(temp, 'project'), join(temp, 'project-alias'));
    await symlink(join(temp, 'outputs/generated'), join(temp, 'generated-alias'));
    await symlink(join(temp, 'node_modules/copied'), join(temp, 'dependency-alias'));
    await symlink(temp, join(temp, 'loop'));
    const scan = { ...emptyDeviceScan(), roots: [temp, join(temp, 'project')] };
    const attempted: string[] = [];
    const file = join(temp, 'registry.json');
    let registry = await readRegistry(file, temp);
    await scanDevice(scan, async root => {
      attempted.push(root);
      const found = await discoverProjects(root);
      if (found.projects.length) registry = mergeDiscovery(registry, found.workspace, found.projects);
    });
    expect(attempted.sort()).toEqual(['custom', 'markdown', 'project'].map(p => join(temp, p)));
    expect(registry.projects.map(p => p.name).sort()).toEqual(['Custom', 'project']);
    await writeRegistry(file, registry);
    expect((await readRegistry(file, temp)).projects).toEqual(registry.projects);
    expect(scan.candidates).toBe(3);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

/** A knowledge base (docsRoot "."), a Place with its own docs/ inside it, a symlink view and an ordinary repo. */
async function knowledgeBaseFixture() {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'docs-device-kb-')));
  const kb = join(home, 'kb');
  const write = async (path: string, value: unknown) => { await mkdir(join(home, path, '..'), { recursive: true }); await writeFile(join(home, path), typeof value === 'string' ? value : JSON.stringify(value)); };
  await write('kb/codecaine.docs.json', { name: 'knowledge-base', docsRoot: '.', exclude: ['sessions/*/outputs/inputs/**'] });
  await write('kb/notes/seed/doc.json', document);
  await write('kb/notes/note-a/note.json', { id: 'note-a' });
  await write('kb/places/area-a/entity.json', { id: 'area-a' });
  await write('kb/places/area-a/docs/overview/doc.json', document);
  await write('kb/sessions/s1/outputs/inputs/spec-pages/p1/doc.json', document);
  await write('repo-x/docs/intro/doc.json', document);
  await write('view/.codecaine-docs-ignore', '');
  await symlink(join(kb, 'places/area-a'), join(home, 'view/area-a'));
  await symlink(join(home, 'repo-x'), join(home, 'view/repo-x'));
  await symlink(join(kb, 'places/area-a'), join(home, 'link-to-area'));
  return { home, kb };
}

async function scanFixture(roots: string[], corpusRoots: string[] = []) {
  const scan = { ...emptyDeviceScan(), roots };
  const attempted: string[] = [];
  let registry = await readRegistry(join(roots[roots.length - 1]!, 'no-registry.json'), roots[0]!);
  await scanDevice(scan, async root => {
    attempted.push(root);
    const found = await discoverProjects(root);
    if (found.projects.length) registry = mergeDiscovery(registry, found.workspace, found.projects);
  }, undefined, corpusRoots);
  return { scan, attempted: attempted.sort(), registry };
}

test('a docsRoot "." project registers alone: no nested Place, symlink into it, or ignored view registers', async () => {
  const { home, kb } = await knowledgeBaseFixture();
  try {
    const { attempted, registry } = await scanFixture([home]);
    expect(attempted).toEqual([kb, join(home, 'repo-x')]);
    const projects = [...registry.projects].sort((a, b) => a.name.localeCompare(b.name));
    expect(projects.map(p => [p.name, p.root, p.docsRoot])).toEqual([
      ['knowledge-base', kb, kb],
      ['repo-x', join(home, 'repo-x'), join(home, 'repo-x/docs')],
    ]);
    expect(projects[0]!.exclude).toEqual(['sessions/*/outputs/inputs/**']);
    expect(projects[1]!.exclude).toBeUndefined();
    // The registry file keeps exclude (schemaVersion 1).
    const file = join(home, 'projects.json');
    await writeRegistry(file, registry);
    const restored = await readRegistry(file, home);
    expect(restored.schemaVersion).toBe(1);
    expect(restored.projects).toEqual(registry.projects);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('a symlink into the knowledge base is skipped even when it is scanned before the knowledge base', async () => {
  const { home, kb } = await knowledgeBaseFixture();
  try {
    const { attempted } = await scanFixture([join(home, 'link-to-area'), join(home, 'view/area-a'), home]);
    expect(attempted).toEqual([kb, join(home, 'repo-x')]);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('registered whole-folder projects hide their subtree, even a registered workspace inside them', async () => {
  const { home, kb } = await knowledgeBaseFixture();
  try {
    // The configuration file is gone, but the registry still says kb is a docsRoot "." project.
    await rm(join(kb, 'codecaine.docs.json'));
    const { attempted } = await scanFixture([join(kb, 'places/area-a'), home], [kb]);
    expect(attempted).toEqual([join(home, 'repo-x')]);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('the ignore marker hides its folder and subtree, including a symlink that lands inside it', async () => {
  const { home } = await knowledgeBaseFixture();
  try {
    await mkdir(join(home, 'view/own/docs/page'), { recursive: true });
    await writeFile(join(home, 'view/own/docs/page/doc.json'), JSON.stringify(document));
    await symlink(join(home, 'view/own'), join(home, 'into-view'));
    const { attempted } = await scanFixture([join(home, 'into-view'), home]);
    expect(attempted).not.toContain(join(home, 'view/own'));
    expect(attempted).not.toContain(join(home, 'view'));
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('a symbolic link met while walking is never followed: a link to an ordinary repo does not register, a real directory does', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'docs-device-nofollow-')));
  const outside = await realpath(await mkdtemp(join(tmpdir(), 'docs-device-outside-')));
  try {
    await mkdir(join(outside, 'repo/docs/intro'), { recursive: true });
    await writeFile(join(outside, 'repo/docs/intro/doc.json'), JSON.stringify(document));
    await mkdir(join(home, 'start/real-repo/docs/intro'), { recursive: true });
    await writeFile(join(home, 'start/real-repo/docs/intro/doc.json'), JSON.stringify(document));
    await symlink(join(outside, 'repo'), join(home, 'start/link-repo'));
    // A repo the walk cannot list its way to (its parent is traversable but not readable):
    // only a followed link could reach it.
    await mkdir(join(home, 'start/vault/repo/docs/intro'), { recursive: true });
    await writeFile(join(home, 'start/vault/repo/docs/intro/doc.json'), JSON.stringify(document));
    await symlink(join(home, 'start/vault/repo'), join(home, 'start/link-vault'));
    await chmod(join(home, 'start/vault'), 0o311);
    const { scan, attempted } = await scanFixture([join(home, 'start')]);
    // Positive control: the real directory registers. No link target is read or registered.
    expect(attempted).toEqual([join(home, 'start/real-repo')]);
    expect(attempted.some(path => path.startsWith(outside))).toBe(false);
    expect(scan.warnings.join('\n')).not.toContain(outside);
    expect(scan.warnings.join("\n")).toContain(join(home, "start/vault"));
  } finally {
    await chmod(join(home, 'start/vault'), 0o755).catch(() => {});
    await rm(home, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('an explicit root inside the marked view never registers: a link to an ordinary external repo or a real folder below the marker', async () => {
  const { home } = await knowledgeBaseFixture();
  const outside = await realpath(await mkdtemp(join(tmpdir(), 'docs-device-view-ext-')));
  try {
    await mkdir(join(outside, 'repo-y/docs/intro'), { recursive: true });
    await writeFile(join(outside, 'repo-y/docs/intro/doc.json'), JSON.stringify(document));
    // ~/kb-view/repo-y -> an ordinary repo outside the knowledge base.
    await symlink(join(outside, 'repo-y'), join(home, 'view/repo-y'));
    // A real folder below the marker, with docs of its own.
    await mkdir(join(home, 'view/real/docs/intro'), { recursive: true });
    await writeFile(join(home, 'view/real/docs/intro/doc.json'), JSON.stringify(document));
    const viewLink = await scanFixture([join(home, 'view/repo-y')]);
    expect(viewLink.attempted).toEqual([]);
    expect(viewLink.registry.projects).toEqual([]);
    expect(viewLink.scan.warnings.join('\n')).toContain('never reached through a symbolic link');
    const viewReal = await scanFixture([join(home, 'view/real')]);
    expect(viewReal.attempted).toEqual([]);
    // Positive control: the same ordinary repo, given as a real root, registers.
    const direct = await scanFixture([join(outside, 'repo-y')]);
    expect(direct.attempted).toEqual([join(outside, 'repo-y')]);
    expect(direct.registry.projects.map(p => p.root)).toEqual([join(outside, 'repo-y')]);
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('an explicit root reached through any symbolic-link component is refused before it is canonicalized', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'docs-device-rootlink-')));
  try {
    await mkdir(join(home, 'repos/repo-z/docs/intro'), { recursive: true });
    await writeFile(join(home, 'repos/repo-z/docs/intro/doc.json'), JSON.stringify(document));
    await symlink(join(home, 'repos'), join(home, 'alias'));
    const viaLink = await scanFixture([join(home, 'alias/repo-z')]);
    expect(viaLink.attempted).toEqual([]);
    const real = await scanFixture([join(home, 'repos/repo-z')]);
    expect(real.attempted).toEqual([join(home, 'repos/repo-z')]);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('one malformed project does not stop device discovery and cancellation is honored', async () => {
  // Canonical: scan roots are never reached through a symbolic link (macOS tmpdir is below /var -> private/var).
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'docs-device-fail-')));
  try {
    for (const name of ['a', 'b']) await mkdir(join(temp, name, 'docs'), { recursive: true });
    const scan = { ...emptyDeviceScan(), roots: [temp] };
    const attempted: string[] = [];
    await scanDevice(scan, async root => { attempted.push(root); if (root.endsWith('/a')) throw new Error('Invalid manifest'); });
    expect(attempted).toHaveLength(2);
    expect(scan.skipped).toBe(1);
    expect(scan.warnings[0]).toContain('Invalid manifest');
    const controller = new AbortController(); controller.abort();
    await expect(scanDevice(scan, async () => {}, controller.signal)).rejects.toThrow();
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('home escapes project names and paths, provides labeled search and device discovery', () => {
  const html = directoryHtml([{ id: 'safe-id', name: '<script>alert(1)</script>', root: '/tmp/<unsafe>', docsRoot: '/tmp/<unsafe>/docs', products: ['docs'] }], '0.0.2');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(html).not.toContain('<script>alert(1)</script>');
  expect(html).toContain('/tmp/&lt;unsafe&gt;');
  expect(html).toContain('Search projects by name or folder');
  expect(html).toContain('Register docs on this device');
});

test('home filters names and folder paths, shows no matches, and starts initial discovery once', async () => {
  // The page links the design-system stylesheets; never fetch them here (no request leaves the test).
  const window = new Window({ url: 'http://localhost:4820/', settings: { disableCSSFileLoading: true, handleDisabledFileLoadingAsSuccess: true } });
  const projects = [
    { id: 'canvas', name: 'Canvas', root: '/projects/drawing', docsRoot: '/projects/drawing/docs', products: ['docs'] },
    { id: 'budget', name: 'Budget', root: '/projects/household', docsRoot: '/projects/household/docs', products: ['docs'] },
  ];
  const html = directoryHtml(projects, '0.0.2');
  window.document.body.innerHTML = html;
  let posts = 0;
  let refresh = () => {};
  const scan = emptyDeviceScan();
  const fetch = async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { posts++; scan.phase = 'complete'; }
    return { ok: true, json: async () => url === '/api/projects' ? { projects } : url === '/api/status' ? { ready: true, error: null } : scan };
  };
  try {
    new Function('document', 'fetch', 'setInterval', window.document.querySelector('script')!.textContent!)(window.document, fetch, (fn: () => void) => { refresh = fn; });
    for (let i = 0; i < 40; i++) await Promise.resolve();
    expect(posts).toBe(1);
    const search = window.document.getElementById('search') as unknown as HTMLInputElement;
    const visible = () => [...window.document.querySelectorAll('.project')].filter(e => !(e as any).hidden);
    search.value = '  HOUSEHOLD  '; search.dispatchEvent(new window.Event('input') as any);
    expect(visible()).toHaveLength(1);
    expect(visible()[0]!.textContent).toContain('Budget');
    search.value = 'CANVAS'; search.dispatchEvent(new window.Event('input') as any);
    expect(visible()[0]!.textContent).toContain('Canvas');
    search.value = 'missing'; search.dispatchEvent(new window.Event('input') as any);
    expect(visible()).toHaveLength(0);
    expect(window.document.getElementById('empty')!.hasAttribute('hidden')).toBe(false);
    refresh(); for (let i = 0; i < 40; i++) await Promise.resolve();
    expect(posts).toBe(1);
    expect(search.value).toBe('missing');
  } finally { await window.happyDOM.close(); }
});
