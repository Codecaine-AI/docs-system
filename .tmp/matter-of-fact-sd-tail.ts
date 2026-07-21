/**
 * Ford (2026-07-20): match the remaining system-design overview sections to
 * his matter-of-fact register (see his hand-edited Docs Architecture
 * section). Splices ONLY the blocks from the Interaction-surfaces H2 down;
 * Ford's own blocks above are untouched. Canonical bytes; idempotent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DocBlock,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const b = (text: string): DeltaSpan => ({ insert: text, attributes: { bold: true } });
const r = (label: string, path: string): DeltaSpan => ({
  insert: label,
  attributes: { reference: { kind: "doc", path, label } },
});

type BlockInput = Omit<DocBlock, "id" | "children">;
const h2 = (text: string): BlockInput => ({ type: "heading", props: { level: 2 }, text: [t(text)] } as any);
const p = (...spans: DeltaSpan[]): BlockInput => ({ type: "paragraph", props: {}, text: spans } as any);
const li = (...spans: DeltaSpan[]): BlockInput => ({ type: "list-item", props: {}, text: spans } as any);

const PATH = "docs/10-system-design/doc.json";
const doc = JSON.parse(readFileSync(PATH, "utf8"));
const root = doc.blocks[doc.root];

const CUT_AT = "b-sdov-surfaces-h-8";
const cutIdx = root.children.indexOf(CUT_AT);
if (cutIdx < 0) {
  console.error("anchor block not found — doc changed under us; aborting");
  process.exit(1);
}
const removed = root.children.slice(cutIdx);

const defs: Array<[string, BlockInput]> = [
  ["surfaces-h", h2("Interaction surfaces")],
  [
    "surfaces-p",
    p(
      t("Each doc is a canonical JSON object with two rendering surfaces, one per reader type. "),
      r("Interaction surfaces", "10-system-design/20-interaction-surfaces"),
      t(" defines both."),
    ),
  ],
  ["surfaces-li-human", li(b("Humans"), t(" — a Notion-style editor in the workbench."))],
  ["surfaces-li-agent", li(b("Agents"), t(" — rendered markdown and typed operations through the CLI."))],
  ["surfaces-li-contract", li(t("Neither reader edits the bytes. Every change lands as a typed operation against the same state."))],

  ["datamodel-h", h2("Data model")],
  [
    "datamodel-p",
    p(
      t("The "),
      r("data model", "10-system-design/30-data-model"),
      t(" is the actual data structure under the hood."),
    ),
  ],
  ["datamodel-li-tree", li(t("A document is a tree of blocks; rich text is attributed spans inside them."))],
  ["datamodel-li-state", li(t("Blocks carry typed state; comments anchor to blocks and spans."))],
  ["datamodel-li-bytes", li(t("Canonical bytes: the same state always serializes to the same file."))],
  ["datamodel-li-mutation", li(t("State changes only through typed operations, validated before anything persists."))],

  ["vocab-h", h2("Block vocabulary")],
  [
    "vocab-p",
    p(
      t("The "),
      r("block vocabulary", "10-system-design/40-block-vocabulary"),
      t(" explains all fourteen block types, with an example of each."),
    ),
  ],
  ["vocab-li-closed", li(t("The set is closed: both surfaces know every block they will ever meet."))],
  ["vocab-li-docs", li(t("Each type's doc lists its props and typed actions, and shows the block in use."))],

  ["boundaries-h", h2("Package boundaries")],
  [
    "boundaries-p",
    p(
      t("The implementation is cut into seven packages. "),
      r("Package boundaries", "10-system-design/50-package-boundaries"),
      t(" records which seams are forced by runtimes and which are judgment calls."),
    ),
  ],
];

const newIds: string[] = [];
let n = 100;
for (const [slug, block] of defs) {
  n += 1;
  const id = `b-sdov-${slug}-${n}`;
  doc.blocks[id] = { id, children: [], ...block };
  newIds.push(id);
}

for (const id of removed) delete doc.blocks[id];
root.children = [...root.children.slice(0, cutIdx), ...newIds];

const result = validateDocDocument(doc);
if (!result.ok) {
  console.error("validation failed:", JSON.stringify(result.issues, null, 2));
  process.exit(1);
}
writeFileSync(PATH, serializeDocDocument(result.document));
console.log(`spliced tail: removed ${removed.length} blocks, added ${newIds.length}`);
