/**
 * Repairs the "Solution staircase" (2026-07-17): grip drops near a block's
 * interior nested blocks INTO the previous block's children slot instead of
 * reordering top-level (PM dropPoint + the schema's `block*` child slots),
 * leaving a diagonal chain of paragraphs under the "The Solution" heading in
 * 00-interaction-surfaces. Flattens the chain back to top-level siblings
 * right after the heading, in reading order; revalidates; rewrites
 * canonical bytes. The drop-side fix (top-level clamping) lives in
 * docs-viewer editor/views/drag-select.ts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";

const path = "docs/10-system-design/00-interaction-surfaces/doc.json";
const raw = JSON.parse(readFileSync(path, "utf8")) as {
  root: string;
  blocks: Record<
    string,
    { id: string; type: string; children?: string[]; text?: Array<{ insert?: string }> }
  >;
};
const blocks = raw.blocks;
const textOf = (b: { text?: Array<{ insert?: string }> }): string =>
  (b.text ?? []).map((s) => s.insert ?? "").join("");

const heading = Object.values(blocks).find(
  (b) => b.type === "heading" && textOf(b).trim() === "The Solution",
);
if (!heading) {
  console.error("heading 'The Solution' not found — nothing to repair");
  process.exit(1);
}
if (!heading.children?.length) {
  console.log("heading has no nested children — already flat, nothing to do");
  process.exit(0);
}

// Depth-first reading order matches the visual order of the staircase.
const collected: string[] = [];
const collect = (ids: string[]) => {
  for (const id of ids) {
    collected.push(id);
    collect(blocks[id].children ?? []);
    blocks[id].children = [];
  }
};
collect(heading.children);
heading.children = [];

const root = blocks[raw.root];
const at = (root.children ?? []).indexOf(heading.id);
if (at === -1) {
  console.error("heading is not a top-level block — unexpected shape, aborting");
  process.exit(1);
}
root.children!.splice(at + 1, 0, ...collected);

for (const id of collected) {
  console.log(`un-nested ${id}: "${textOf(blocks[id]).slice(0, 50)}"`);
}

const result = validateDocDocument(raw);
if (!result.ok) {
  console.error("STILL INVALID after repair:", JSON.stringify(result.issues));
  process.exit(1);
}
writeFileSync(path, serializeDocDocument(result.document));
console.log(`${path} repaired (${collected.length} block(s) un-nested), canonical bytes rewritten`);
