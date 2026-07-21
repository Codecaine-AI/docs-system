/**
 * Ford's data-model interview (2026-07-21): overview reframed as FIVE
 * SHAPES + ONE BEHAVIOR MODEL (mutation model is this section's own child
 * now, not a neighbor); counts pinned to TARGET state (14 types, sequence
 * in / mermaid retiring — retirement noted as in flight); bullet pattern;
 * de-corpus voice. Planned (recorded here, landed as we reach the docs):
 * 60-mutation-model splits into a subsection w/ undo-redo + copy-paste
 * children; 30-block-state becomes the custom-component anatomy guide.
 * Canonical bytes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const c = (text: string): DeltaSpan => ({ insert: text, attributes: { code: true } });
const ref = (text: string, path: string): DeltaSpan => ({
  insert: text,
  attributes: { reference: { kind: "doc", path } },
});
const srcref = (path: string): DeltaSpan => ({
  insert: path,
  attributes: { code: true, reference: { kind: "source", path } },
});

const PATH = "docs/10-system-design/30-data-model/doc.json";
const doc = JSON.parse(readFileSync(PATH, "utf8"));
doc.title = "The data model";

const defs: Array<[string, Record<string, unknown>]> = [
  [
    "b-dm2-opener-1",
    {
      type: "paragraph",
      props: {},
      text: [
        t("The docs system has one on-disk content format: "),
        c("doc.json"),
        t(", a normalized block tree, with a "),
        c("comments.json"),
        t(
          " sidecar per bundle. Five shapes describe the state; one behavior model describes every change. Hold those six things and you can read or write anything in the system.",
        ),
      ],
    },
  ],
  [
    "b-dm2-pure-2",
    {
      type: "paragraph",
      props: {},
      text: [
        t(
          "This section describes shapes and invariants, not transport wiring. Everything here is defined in ",
        ),
        srcref("packages/docs-model"),
        t(" — no rendering, no filesystem, no HTTP — so every claim is testable in isolation."),
      ],
    },
  ],
  ["b-dm2-shapes-h-3", { type: "heading", props: { level: 2 }, text: [t("The five shapes")] }],
  [
    "b-dm2-idx-tree-4",
    {
      type: "list-item",
      props: {},
      text: [
        ref("The document & block tree", "10-system-design/30-data-model/10-document-tree"),
        t(
          " — the envelope, the flat id-keyed blocks map, ordered children arrays, stable anchor ids, and the graph invariants.",
        ),
      ],
    },
  ],
  [
    "b-dm2-idx-rich-5",
    {
      type: "list-item",
      props: {},
      text: [
        ref("Rich text", "10-system-design/30-data-model/20-rich-text"),
        t(" — delta spans, the four boolean marks, links, and the typed reference objects."),
      ],
    },
  ],
  [
    "b-dm2-idx-state-6",
    {
      type: "list-item",
      props: {},
      text: [
        ref("Per-type block state", "10-system-design/30-data-model/30-block-state"),
        t(
          " — the component anatomy: every block type owns its state schema, renderer, and update logic — and the path for adding a custom component.",
        ),
      ],
    },
  ],
  [
    "b-dm2-idx-comments-7",
    {
      type: "list-item",
      props: {},
      text: [
        ref("Comments & targets", "10-system-design/30-data-model/40-comments"),
        t(" — the sidecar: block and canvas-object anchors, intents, agent runs, dangling-target detection."),
      ],
    },
  ],
  [
    "b-dm2-idx-bytes-8",
    {
      type: "list-item",
      props: {},
      text: [
        ref("Canonical bytes", "10-system-design/30-data-model/50-canonical-bytes"),
        t(
          " — the deterministic serializer, the markdown render map, and the content hashes that make write preconditions possible.",
        ),
      ],
    },
  ],
  ["b-dm2-behavior-h-9", { type: "heading", props: { level: 2 }, text: [t("The behavior model")] }],
  [
    "b-dm2-idx-mutation-10",
    {
      type: "list-item",
      props: {},
      text: [
        ref("The mutation model", "10-system-design/30-data-model/60-mutation-model"),
        t(
          " — how the shapes change: the seven-op algebra, inverses, undo and redo, copy and paste, and what a refused write looks like.",
        ),
      ],
    },
  ],
  [
    "b-dm2-callout-11",
    {
      type: "callout",
      props: { kind: "Reading guide", tone: "info" },
      text: [
        t(
          "Shapes first, then behavior. The five shape docs define what exists — document, span, state, comment, bytes. The mutation model defines every way it can change. Nothing else in the system writes state.",
        ),
      ],
    },
  ],
  ["b-dm2-neighbors-h-12", { type: "heading", props: { level: 2 }, text: [t("Neighbors")] }],
  [
    "b-dm2-neighbors-13",
    {
      type: "paragraph",
      props: {},
      text: [
        t("The roster of block types — what each is for, with an example — is the "),
        ref("block vocabulary", "10-system-design/40-block-vocabulary"),
        t("'s subject; type counts live there. How bytes reach disk is the "),
        ref("save pipeline", "20-implementation/30-save-pipeline"),
        t("'s."),
      ],
    },
  ],
  [
    "b-dm2-inflight-14",
    {
      type: "callout",
      props: { kind: "In flight", tone: "warning" },
      text: [
        t(
          "The diagram story is mid-transition: the sequence block replaces mermaid, and mermaid's retirement is landing in a parallel workstream. Docs in this section describe the target state.",
        ),
      ],
    },
  ],
];

const blocks: Record<string, unknown> = {};
const children: string[] = [];
for (const [id, block] of defs) {
  blocks[id] = { id, children: [], ...block };
  children.push(id);
}
const rootId = doc.root;
blocks[rootId] = { id: rootId, type: "paragraph", props: {}, children };

const out = {
  schemaVersion: 1,
  id: doc.id,
  title: doc.title,
  root: rootId,
  blocks,
};
const result = validateDocDocument(out);
if (!result.ok) {
  console.error("validation failed:", JSON.stringify(result.issues, null, 2));
  process.exit(1);
}
writeFileSync(PATH, serializeDocDocument(result.document));
console.log("rewrote data-model overview");
