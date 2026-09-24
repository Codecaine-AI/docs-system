import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, realpath, symlink, writeFile } from 'node:fs/promises';
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

test('one malformed project does not stop device discovery and cancellation is honored', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'docs-device-fail-'));
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
  const window = new Window({ url: 'http://localhost:4820/' });
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
