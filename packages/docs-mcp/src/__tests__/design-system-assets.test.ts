import { expect, test } from 'bun:test';
import { readFileSync, realpathSync } from 'node:fs';
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
    expect((await request(DESIGN_SYSTEM_PREFIX + path)).status).toBe(404);
  }
  expect((await request('/@codecaine-ai/design-systemx/package.json')).status).toBe(404);
  expect((await request(`${DESIGN_SYSTEM_PREFIX}css/fonts.css`, { method: 'POST' })).status).toBe(405);
});
