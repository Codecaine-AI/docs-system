/**
 * R2 read-through directive (Ford, 2026-07-20), v3: the system-design
 * overview as a clean PRIMER — H2 per piece, bullet points, short paragraphs.
 * Landed at the NEW folder-level home (docs/10-system-design/doc.json, id
 * 10-system-design) after the parallel session's section-overview
 * restructure; refs point at folder-level bundles; no in-doc H1 (page-title
 * furniture carries it — Ford deleted the H1 live). Canonical bytes;
 * idempotent.
 */
import { writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DocDocument,
  type DocBlock,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const b = (text: string): DeltaSpan => ({ insert: text, attributes: { bold: true } });
const r = (label: string, path: string): DeltaSpan => ({
  insert: label,
  attributes: { reference: { kind: "doc", path, label } },
});

type BlockInput = Omit<DocBlock, "id" | "children"> & { children?: string[] };

const h2 = (text: string): BlockInput => ({ type: "heading", props: { level: 2 }, text: [t(text)] });
const p = (...spans: DeltaSpan[]): BlockInput => ({ type: "paragraph", props: {}, text: spans });
const li = (...spans: DeltaSpan[]): BlockInput => ({ type: "list-item", props: {}, text: spans });

const defs: Array<[string, BlockInput]> = [
  [
    "opener",
    p(
      t(
        "This section is the design of the system — the shared language everything else is written against. Each piece below has its own child doc: read this page for the shape, then go deeper where you need it.",
      ),
    ),
  ],

  ["docarch-h", h2("Doc architecture")],
  [
    "docarch-p",
    p(
      t(
        "It comes first because the docs define what everything should do — without the code. The corpus is set up so every new piece of knowledge has one clear home, and an agent making a change lands it where it belongs instead of scattering sloppy docs. ",
      ),
      r("Doc architecture", "10-system-design/10-doc-architecture"),
      t(" holds the structure and the standards that keep it that way."),
    ),
  ],
  ["docarch-li-foundation", li(b("Foundation"), t(" — why the system exists. Changes slowest."))],
  ["docarch-li-design", li(b("Design"), t(" — what the system does. This section."))],
  ["docarch-li-impl", li(b("Implementation"), t(" — how the code delivers it today. Changes fastest."))],
  [
    "docarch-standards-p",
    p(
      t(
        "The standards — directory structure, numbering, titles and openings, linking, writing — are child docs there, each rule paired with its rationale.",
      ),
    ),
  ],

  ["surfaces-h", h2("Interaction surfaces")],
  [
    "surfaces-p",
    p(
      t("One canonical document state, met by two readers through two rendered surfaces — defined in "),
      r("Interaction surfaces", "10-system-design/20-interaction-surfaces"),
      t("."),
    ),
  ],
  ["surfaces-li-human", li(b("Humans"), t(" — a Notion-style editor in the workbench: direct manipulation, live rendering."))],
  ["surfaces-li-agent", li(b("Agents"), t(" — deterministically rendered markdown and typed operations through the CLI."))],
  [
    "surfaces-li-contract",
    li(
      t(
        "Neither reader edits the bytes. Every change — a keystroke or a CLI call — lands as a typed operation against the same state.",
      ),
    ),
  ],

  ["datamodel-h", h2("Data model")],
  [
    "datamodel-p",
    p(
      t("How a document itself is represented — fixed by the "),
      r("data model", "10-system-design/30-data-model"),
      t("."),
    ),
  ],
  ["datamodel-li-tree", li(t("A document is a tree of blocks; rich text is attributed spans inside them."))],
  ["datamodel-li-state", li(t("Blocks carry typed state; comments anchor to blocks and spans."))],
  ["datamodel-li-bytes", li(t("Canonical bytes: the same state always serializes to the same file."))],
  [
    "datamodel-li-mutation",
    li(
      t(
        "The mutation model is the only way state changes — typed operations, validated before anything persists.",
      ),
    ),
  ],

  ["vocab-h", h2("Block vocabulary")],
  [
    "vocab-p",
    p(
      t("Every block comes from a closed vocabulary of fourteen types — the "),
      r("block vocabulary", "10-system-design/40-block-vocabulary"),
      t(" gives each one its own doc."),
    ),
  ],
  ["vocab-li-closed", li(t("Closed on purpose: both surfaces can rely on knowing every block they will ever meet."))],
  ["vocab-li-docs", li(t("Each type's doc carries its props, its typed actions, and the block itself in use."))],

  ["boundaries-h", h2("Package boundaries")],
  [
    "boundaries-p",
    p(
      t("The implementation is cut into seven packages. "),
      r("Package boundaries", "10-system-design/50-package-boundaries"),
      t(
        " records where the cuts fall — which seams are forced by runtimes, and which are judgment calls still open to change.",
      ),
    ),
  ],
];

const blocks: Record<string, DocBlock> = {};
const rootChildren: string[] = [];
let n = 0;
for (const [slug, block] of defs) {
  n += 1;
  const id = `b-sdov-${slug}-${n}`;
  blocks[id] = { id, children: [], ...block } as DocBlock;
  rootChildren.push(id);
}

const rootId = "b-sd-overview-root";
blocks[rootId] = { id: rootId, type: "paragraph", props: {}, children: rootChildren };

const doc: DocDocument = {
  schemaVersion: 1,
  id: "10-system-design",
  title: "System design — overview",
  root: rootId,
  blocks,
};

const result = validateDocDocument(doc);
if (!result.ok) {
  console.error("validation failed:", JSON.stringify(result.issues, null, 2));
  process.exit(1);
}
writeFileSync("docs/10-system-design/doc.json", serializeDocDocument(doc));
console.log(`wrote docs/10-system-design/doc.json (${Object.keys(blocks).length} blocks)`);
