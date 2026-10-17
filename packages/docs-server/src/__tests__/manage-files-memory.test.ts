import { test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, mkdtemp, mkdir, readdir, readFile, rename, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listManagedAssets } from '../manage-files';

const doc = (id: string) => JSON.stringify({ schemaVersion: 1, id, title: id, root: 'root', blocks: { root: { id: 'root', type: 'paragraph', props: {}, children: [] } } });
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

async function fixture() {
 const root = await mkdtemp(join(tmpdir(), 'manage-files-memory-'));
 const files: Record<string, string> = {
  'a/doc.json': doc('a'), 'a/assets/images/one.png': 'one', 'a/assets/images/two.png': 'two two',
  'a/b/doc.json': doc('b'), 'a/b/assets/canvases/c.canvas.json': '{"objects":[]}', 'a/b/assets/media/empty.bin': '',
  'z/doc.json': doc('z'), 'z/assets/images/three.png': 'three', 'z/notes.txt': 'not an asset',
  // Service-owned metadata at the root is never inventoried.
  '.changesets/file-management/x/backup/a/assets/images/one.png': 'backup', '.index/assets/i.png': 'index', '.git/assets/g.png': 'git',
 };
 for (const [p, body] of Object.entries(files)) { await mkdir(join(root, p, '..'), { recursive: true }); await writeFile(join(root, p), body); }
 return root;
}

/** The pre-change listing: buffer every corpus file, then report the `/assets/` ones. Same walk order. */
async function legacyList(root: string, path?: string) {
 const files = new Map<string, Buffer>();
 async function walk(dir: string) {
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
   if (!dir && ['.index', '.changesets', '.git'].includes(entry.name)) continue;
   const p = dir ? `${dir}/${entry.name}` : entry.name;
   if (entry.isDirectory()) await walk(p); else files.set(p, await readFile(join(root, p)));
  }
 }
 await walk('');
 const under = (f: string, d: string) => f === d || f.startsWith(d + '/');
 return { ok: true, assets: [...files].filter(([p]) => p.includes('/assets/') && (!path || under(p, path))).map(([p, b]) => ({ path: p, size: b.length, hash: sha(b) })) };
}

test('listManagedAssets output is unchanged for no path, a page, a single asset and a missing path', async () => {
 const root = await fixture();
 try {
  for (const path of [undefined, 'a', 'a/b', 'a/assets/images/one.png', 'missing']) {
   const result = await listManagedAssets(root, path);
   expect(result).toEqual(await legacyList(root, path));
  }
  const all = await listManagedAssets(root);
  expect(all.assets.map((a: any) => a.path).sort()).toEqual(['a/assets/images/one.png', 'a/assets/images/two.png', 'a/b/assets/canvases/c.canvas.json', 'a/b/assets/media/empty.bin', 'z/assets/images/three.png']);
  expect(all.assets.find((a: any) => a.path === 'a/assets/images/two.png')).toEqual({ path: 'a/assets/images/two.png', size: 7, hash: sha(Buffer.from('two two')) });
  expect(await listManagedAssets(root, 'missing')).toEqual({ ok: true, assets: [] });
  expect(await listManagedAssets(root, '../outside')).toMatchObject({ ok: false, status: 400 });
 } finally { await rm(root, { recursive: true, force: true }); }
});

test('listManagedAssets refuses symbolic links anywhere in the corpus, including ones pointing out of the root', async () => {
 const root = await fixture(), outside = await mkdtemp(join(tmpdir(), 'manage-files-outside-'));
 try {
  await writeFile(join(outside, 'secret.png'), 'outside bytes');
  await symlink(join(outside, 'secret.png'), join(root, 'z/assets/images/link.png'));
  for (const path of [undefined, 'z', 'a']) {
   const result = await listManagedAssets(root, path);
   expect(result).toMatchObject({ ok: false, status: 400 });
   expect(result.detail).toContain('Symbolic links are unsupported for corpus management: z/assets/images/link.png');
  }
 } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('listing a 512 MB asset streams it instead of buffering corpus contents', async () => {
 const root = await fixture();
 try {
  const big = join(root, 'a/assets/media/big.mp4');
  await mkdir(join(big, '..'), { recursive: true });
  await writeFile(big, 'head');
  await truncate(big, 512 * 1024 * 1024); // sparse: no real disk cost
  // A timeout, not AbortSignal: the happy-dom preload replaces the global AbortSignal.
  const child = Bun.spawn(['bun', join(import.meta.dir, 'fixtures/manage-files-rss.ts'), root], { stdout: 'pipe', stderr: 'pipe', timeout: 90_000, killSignal: 'SIGKILL' });
  const [out, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  expect(code).toBe(0);
  const { result, maxRSS } = JSON.parse(out.trim().split('\n').at(-1)!);
  expect(result.ok).toBe(true);
  const h = createHash('sha256');
  for await (const chunk of createReadStream(big, { highWaterMark: 1 << 20 })) h.update(chunk);
  expect(result.assets.find((a: any) => a.path === 'a/assets/media/big.mp4')).toEqual({ path: 'a/assets/media/big.mp4', size: 512 * 1024 * 1024, hash: h.digest('hex') });
  // Buffering the asset alone would push the child past 512 MB.
  expect(maxRSS).toBeLessThan(300 * 1024 * 1024);
 } finally { await rm(root, { recursive: true, force: true }); }
}, { timeout: 120_000 });

const mkfifo = (p: string) => expect(spawnSync('mkfifo', [p]).status).toBe(0);

test('listManagedAssets refuses odd filesystem entries such as a FIFO found by the walk', async () => {
 const root = await fixture();
 try {
  mkfifo(join(root, 'z/assets/images/pipe.png'));
  const result = await listManagedAssets(root);
  expect(result).toMatchObject({ ok: false, status: 400 });
  expect(result.detail).toContain('Unsupported filesystem entry: z/assets/images/pipe.png');
 } finally { await rm(root, { recursive: true, force: true }); }
});

test.skipIf(process.getuid?.() === 0)('listManagedAssets reports a read error instead of listing the asset', async () => {
 const root = await fixture();
 try {
  await chmod(join(root, 'a/assets/images/one.png'), 0o000);
  const result = await listManagedAssets(root);
  expect(result).toMatchObject({ ok: false, status: 400 });
  expect(result.detail).toContain('EACCES');
 } finally { await chmod(join(root, 'a/assets/images/one.png'), 0o644).catch(() => {}); await rm(root, { recursive: true, force: true }); }
});

/**
 * Swap an asset after the inventory walk but before it is hashed, at the real filesystem boundary.
 * A 2 GB sparse asset that the walk visits first takes seconds to hash; the walk of this small fixture
 * takes milliseconds. So a swap 250 ms in lands inside the hashing window without a production hook.
 * If the swap ever landed too late the listing would succeed and the test would fail, never pass falsely.
 * A swap during the walk could pass falsely (the walk refuses the same entries), so the test first times a
 * full listing of the same tree with the asset still tiny: walk plus hashing must take well under 250 ms.
 */
async function swapDuringHashing(swap: (root: string, target: string, outside: string) => Promise<void>) {
 const root = await fixture(), outside = await mkdtemp(join(tmpdir(), 'manage-files-outside-'));
 try {
  for (const page of ['b', 'c', 'd', 'e']) { await mkdir(join(root, page, 'assets/images'), { recursive: true }); await writeFile(join(root, page, 'assets/images/late.png'), `late ${page}`); }
  const big = join(root, 'a/assets/media/big.mp4');
  await mkdir(join(big, '..'), { recursive: true }); await writeFile(big, 'head');
  const started = performance.now();
  const order = (await listManagedAssets(root)).assets.map((a: any) => a.path);
  expect(performance.now() - started).toBeLessThan(50);
  const target = order.slice(order.indexOf('a/assets/media/big.mp4') + 1).find((p: string) => p.endsWith('/late.png'));
  expect(target).toBeDefined();
  await truncate(big, 2 * 1024 * 1024 * 1024);
  const listing = listManagedAssets(root);
  await Bun.sleep(250);
  await swap(root, target, outside);
  return { result: await listing, target };
 } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
}

test('an asset swapped for an out-of-root symlink after the walk is refused, not read', async () => {
 const { result, target } = await swapDuringHashing(async (root, target, outside) => {
  await writeFile(join(outside, 'secret.png'), 'outside bytes');
  await rm(join(root, target)); await symlink(join(outside, 'secret.png'), join(root, target));
 });
 expect(result).toMatchObject({ ok: false, status: 400 });
 expect(result.detail).toContain(`Symbolic links are unsupported for corpus management: ${target}`);
}, { timeout: 60_000 });

test('an asset replaced by a different regular file after the walk is refused', async () => {
 const { result, target } = await swapDuringHashing(async (root, target) => {
  await writeFile(join(root, target + '.next'), 'replacement'); await rename(join(root, target + '.next'), join(root, target));
 });
 expect(result).toMatchObject({ ok: false, status: 400 });
 expect(result.detail).toContain(`Corpus changed while listing assets: ${target}`);
}, { timeout: 60_000 });

test('an asset swapped for a FIFO after the walk is refused without blocking on it', async () => {
 const { result, target } = await swapDuringHashing(async (root, target) => { await rm(join(root, target)); mkfifo(join(root, target)); });
 expect(result).toMatchObject({ ok: false, status: 400 });
 expect(result.detail).toContain(`Unsupported filesystem entry: ${target}`);
}, { timeout: 60_000 });

test('an ancestor folder swapped for a symlink out of the root is refused even though the file is unchanged', async () => {
 // The moved folder keeps the same file (same dev and ino), so only the confinement check can refuse it.
 const { result, target } = await swapDuringHashing(async (root, target, outside) => {
  const folder = join(root, target, '..');
  await rename(folder, join(outside, 'images')); await symlink(join(outside, 'images'), folder);
 });
 expect(result).toMatchObject({ ok: false, status: 400 });
 expect(result.detail).toContain(`Symbolic links are unsupported for corpus management: ${target}`);
}, { timeout: 60_000 });
