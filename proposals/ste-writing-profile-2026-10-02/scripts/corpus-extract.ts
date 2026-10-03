// Extract authored prose from every real docs page (skips .changesets and dot dirs).
// Reuses docs-model's authoredProse() so the corpus matches what the lints see.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const REPO = "/Users/Ford/workspace/codecaine/core/docs-system";
const { authoredProse } = await import(`${REPO}/packages/docs-model/src/writing/prose.ts`);
const { orderedBlocks } = await import(`${REPO}/packages/docs-model/src/lint/engine.ts`);

const DOCS = path.join(REPO, "docs");
async function walk(dir: string, out: string[]) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.name === "doc.json") out.push(p);
  }
}
const files: string[] = [];
await walk(DOCS, files);
files.sort();

type Field = { blockId?: string; blockType?: string; field: string; text: string; paragraph: boolean };
const pages: { page: string; title: string; fields: Field[]; codeLiterals: string[] }[] = [];
for (const f of files) {
  const doc = JSON.parse(await readFile(f, "utf8"));
  const blocks = orderedBlocks(doc);
  const context = { document: doc, blocks };
  const fields: Field[] = authoredProse(context).map((p: any) => ({
    ...p,
    blockType: p.blockId ? doc.blocks[p.blockId]?.type : "title",
  }));
  // Inline code spans in prose-bearing blocks: candidate technical names that prose hides.
  const codeLiterals: string[] = [];
  for (const b of blocks) {
    if (!Array.isArray(b.text)) continue;
    for (const s of b.text) if (s?.attributes?.code && typeof s.insert === "string") codeLiterals.push(s.insert);
  }
  pages.push({
    page: path.relative(DOCS, path.dirname(f)) || ".",
    title: typeof doc.title === "string" ? doc.title : "",
    fields,
    codeLiterals,
  });
}
await writeFile("/tmp/ste-research/raw/corpus-prose.json", JSON.stringify(pages, null, 1));
const nFields = pages.reduce((a, p) => a + p.fields.length, 0);
const nWords = pages.reduce((a, p) => a + p.fields.reduce((b, f) => b + f.text.split(/[\s\u0000]+/).filter(Boolean).length, 0), 0);
console.log(`pages=${pages.length} fields=${nFields} words=${nWords}`);
