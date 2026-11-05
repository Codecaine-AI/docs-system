import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const doc = (id: string, blocks: Record<string, unknown> = {}) => JSON.stringify({ schemaVersion: 1, id, title: id, root: 'root', blocks: { root: { id: 'root', type: 'paragraph', props: {}, children: Object.keys(blocks) }, ...blocks } });
const PADDING_FILES = 8, PADDING_BYTES = 128 * 1024 * 1024;

/** A page with an asset and a child, a page that embeds the asset, and `padding` large unrelated files. */
async function fixture(padding: number) {
 const root = await mkdtemp(join(tmpdir(), 'manage-files-move-memory-'));
 const files: Record<string, string> = {
  'page/doc.json': doc('page', { img: { id: 'img', type: 'image', props: { src: './assets/images/a.png' }, children: [] } }),
  'page/assets/images/a.png': 'a', 'page/child/doc.json': doc('child'),
  'reader/doc.json': doc('reader', { img: { id: 'img', type: 'image', props: { src: '../page/assets/images/a.png' }, children: [] } }),
 };
 for (const [p, body] of Object.entries(files)) { await mkdir(join(root, p, '..'), { recursive: true }); await writeFile(join(root, p), body); }
 await mkdir(join(root, 'padding/assets/media'), { recursive: true });
 for (let i = 0; i < padding; i++) {
  const big = join(root, `padding/assets/media/big-${i}.mp4`);
  await writeFile(big, 'head');
  await truncate(big, PADDING_BYTES); // sparse: no real disk cost, but a read buffers every byte
 }
 return root;
}

async function moveInChild(root: string) {
 // A timeout, not AbortSignal: the happy-dom preload replaces the global AbortSignal.
 const child = Bun.spawn(['bun', join(import.meta.dir, 'fixtures/manage-files-move-rss.ts'), root], { stdout: 'pipe', stderr: 'pipe', timeout: 90_000, killSignal: 'SIGKILL' });
 const [out, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
 expect(code).toBe(0);
 const { result, maxRSS } = JSON.parse(out.trim().split('\n').at(-1)!);
 expect(result).toMatchObject({ ok: true, applied: true, rewritten_sources: ['reader/doc.json', 'section/moved/doc.json'] });
 return maxRSS as number;
}

test("a move's peak memory does not grow with the bytes of unrelated corpus files", async () => {
 const small = await fixture(0), padded = await fixture(PADDING_FILES);
 try {
  const smallRSS = await moveInChild(small), paddedRSS = await moveInChild(padded);
  console.log(JSON.stringify({ smallRSS, paddedRSS, paddingBytes: PADDING_FILES * PADDING_BYTES }));
  // Reading the 1 GB of padding would add a gigabyte; the read set never includes it.
  expect(paddedRSS - smallRSS).toBeLessThan(64 * 1024 * 1024);
  expect(paddedRSS).toBeLessThan(300 * 1024 * 1024);
 } finally { await rm(small, { recursive: true, force: true }); await rm(padded, { recursive: true, force: true }); }
}, { timeout: 120_000 });
