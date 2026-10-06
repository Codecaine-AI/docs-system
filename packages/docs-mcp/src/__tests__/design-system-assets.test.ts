import { expect, test } from 'bun:test';
import { readFileSync, realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DESIGN_SYSTEM_PREFIX, designSystemAssets } from '../background/design-system-assets';
import { directoryHtml } from '../background/home';

// Requests go to the route handler in process: no port is bound and nothing is fetched.
const packageDir = join(import.meta.dir, '../..');
const designSystem = realpathSync(dirname(Bun.resolveSync('@codecaine-ai/design-system/package.json', packageDir)));
const serve = designSystemAssets(packageDir);
const request = (path: string, init?: RequestInit) => serve(new Request(new URL(path, 'http://127.0.0.1'), init));

test('home links fonts.css, then the dark-first tokens, before its own styles', () => {
  const html = directoryHtml([], '0.0.2');
  const links = [...html.matchAll(/<link\b[^>]*>/g)].map(m => m[0]);
  expect(links).toEqual([
    `<link rel="stylesheet" href="${DESIGN_SYSTEM_PREFIX}css/fonts.css">`,
    `<link rel="stylesheet" href="${DESIGN_SYSTEM_PREFIX}dist/css/tokens-dark-first.css">`,
  ]);
  expect(html.indexOf('<link')).toBeLessThan(html.indexOf('<style>'));
});

test('the design-system route serves the linked files and their fonts byte for byte from the resolved package', async () => {
  const html = directoryHtml([], '0.0.2');
  const linked = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]!.slice(DESIGN_SYSTEM_PREFIX.length));
  const fonts = [...readFileSync(join(designSystem, 'css/fonts.css'), 'utf8').matchAll(/url\("\.\.\/(fonts\/[^"]+)"\)/g)].map(m => m[1]!);
  expect(linked).toEqual(['css/fonts.css', 'dist/css/tokens-dark-first.css']);
  expect(fonts.length).toBeGreaterThan(0);
  const types: Record<string, string> = { css: 'text/css; charset=utf-8', woff2: 'font/woff2', json: 'application/json; charset=utf-8' };
  for (const path of [...linked, ...new Set(fonts), 'package.json']) {
    const response = await request(DESIGN_SYSTEM_PREFIX + path);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(types[path.split('.').pop()!]!);
    expect(Buffer.from(await response.arrayBuffer()).equals(readFileSync(join(designSystem, path)))).toBe(true);
  }
  const head = await request(`${DESIGN_SYSTEM_PREFIX}css/fonts.css`, { method: 'HEAD' });
  expect(head.status).toBe(200);
  expect(await head.text()).toBe('');
});

test('the design-system route answers nothing outside the package files it serves', async () => {
  for (const path of ['apps.json', 'scripts/build.ts', 'tokens/base', 'css/', 'css/.hidden', '.git', 'css/..%2Fpackage.json', 'css/..%2F..%2F..%2Fpackage.json', 'dist%2F..%2F.gitignore', 'css/%E0%A4%A']) {
    const response = await request(DESIGN_SYSTEM_PREFIX + path);
    expect(response.status).toBe(404);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  }
  expect((await request('/@codecaine-ai/design-systemx/package.json')).status).toBe(404);
  const post = await request(`${DESIGN_SYSTEM_PREFIX}css/fonts.css`, { method: 'POST' });
  expect(post.status).toBe(405);
  expect(post.headers.get('x-content-type-options')).toBe('nosniff');
  expect((await request(`${DESIGN_SYSTEM_PREFIX}css/fonts.css`)).headers.get('x-content-type-options')).toBe('nosniff');
});

test('symlinks serve only files whose real path is a served package file, and active content goes out as bytes', async () => {
  // A fake package in a temp folder: the real design-system checkout is never touched.
  const temp = realpathSync(await mkdtemp(join(tmpdir(), 'docs-ds-assets-')));
  try {
    const pkg = join(temp, 'app/node_modules/@codecaine-ai/design-system');
    const files: Record<string, string> = {
      'package.json': '{"name":"@codecaine-ai/design-system"}', 'css/fonts.css': 'fonts', 'dist/page.html': '<script>1</script>', 'dist/index.js': 'run()', 'dist/icon.svg': '<svg/>',
      'scripts/internal.txt': 'internal', 'tokens/base.json': '{}', '.secret': 'secret', '.hidden/file.css': 'hidden', '../../../outside.css': 'outside',
    };
    for (const [path, text] of Object.entries(files)) { await mkdir(dirname(join(pkg, path)), { recursive: true }); await writeFile(join(pkg, path), text); }
    const links: Record<string, string> = {
      'dist/alias.css': '../css/fonts.css', 'dist/unserved.txt': '../scripts/internal.txt', 'dist/scripts': '../scripts', 'css/tokens': '../tokens',
      'dist/secret.txt': '../.secret', 'css/hidden': '../.hidden', 'dist/outside.css': '../../../../outside.css',
    };
    for (const [path, target] of Object.entries(links)) await symlink(target, join(pkg, path));
    const fake = designSystemAssets(join(temp, 'app'));
    const get = (path: string) => fake(new Request(new URL(DESIGN_SYSTEM_PREFIX + path, 'http://127.0.0.1')));
    for (const path of ['css/fonts.css', 'dist/alias.css']) {
      const response = await get(path);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('fonts');
    }
    for (const path of ['dist/unserved.txt', 'dist/scripts/internal.txt', 'css/tokens/base.json', 'dist/secret.txt', 'css/hidden/file.css', 'dist/outside.css', 'scripts/internal.txt', '.secret']) {
      const response = await get(path);
      expect(response.status).toBe(404);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    }
    for (const path of ['dist/page.html', 'dist/index.js', 'dist/icon.svg']) {
      const response = await get(path);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/octet-stream');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
