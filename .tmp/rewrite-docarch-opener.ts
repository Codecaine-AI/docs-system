/**
 * Ford's read-through directive (2026-07-20): reframe the doc-architecture
 * overview's OPENING with his intent — docs define what the system should do
 * without the code; hand the docs to a stronger model and get a better
 * system back (code is the output); the structure exists so every change
 * has one canonical home ("this changes here, so it goes like this").
 * Keeps the three-layer list, obligation blocks, and everything from the
 * standards callout down. Canonical bytes; idempotent.
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

const PATH = "docs/10-system-design/10-doc-architecture/doc.json";
const doc = JSON.parse(readFileSync(PATH, "utf8"));
const root = doc.blocks[doc.root];

const KEEP_FROM = "b-m2-define-obligation-12";
const keepIdx = root.children.indexOf(KEEP_FROM);
if (keepIdx < 0) {
  console.error("anchor block not found — doc changed under us; aborting");
  process.exit(1);
}
const removed = root.children.slice(0, keepIdx);

const newDefs: Array<[string, Omit<DocBlock, "id" | "children">]> = [
  ["title", { type: "heading", props: { level: 1 }, text: [t("Docs Define the Function")] } as any],
  [
    "bet",
    {
      type: "paragraph",
      props: {},
      text: [
        t(
          "The docs define what the system should do — without the code. That is the bet this corpus is built on: as models progress, you hand these docs to a stronger one and get a better version of the system back. It understands the intent and writes better code. Code is the output.",
        ),
      ],
    } as any,
  ],
  [
    "home",
    {
      type: "paragraph",
      props: {},
      text: [
        t(
          "For that to hold, the documentation itself has to be set up so every piece of knowledge has one canonical home. This section is that setup. When something changes, the structure should answer the question for you: ",
        ),
        { insert: "this changes here, so it goes like this", attributes: { italic: true } },
        t(
          ". An agent operating on the corpus lands its changes the same way every time — that consistency is what keeps the docs coherent as the system scales.",
        ),
      ],
    } as any,
  ],
  [
    "layers-lead",
    {
      type: "paragraph",
      props: {},
      text: [t("The corpus keeps three layers, ordered by how fast they are allowed to change:")],
    } as any,
  ],
  [
    "layer-foundation",
    { type: "list-item", props: {}, text: [b("Foundation"), t(" holds the intent — what this is and why it exists. Changes slowest.")] } as any,
  ],
  [
    "layer-design",
    { type: "list-item", props: {}, text: [b("System design"), t(" holds the behavior — what the system does, independent of any codebase.")] } as any,
  ],
  [
    "layer-impl",
    { type: "list-item", props: {}, text: [b("Implementation"), t(" describes the current code, and is allowed to churn.")] } as any,
  ],
  [
    "descend",
    { type: "paragraph", props: {}, text: [t("A reader starts at the top and descends only as far as the task requires.")] } as any,
  ],
];

const newIds: string[] = [];
let n = 0;
for (const [slug, block] of newDefs) {
  n += 1;
  const id = `b-da-open-${slug}-${n}`;
  doc.blocks[id] = { id, children: [], ...block };
  newIds.push(id);
}

for (const id of removed) delete doc.blocks[id];
root.children = [...newIds, ...root.children.slice(keepIdx)];

const result = validateDocDocument(doc);
if (!result.ok) {
  console.error("validation failed:", JSON.stringify(result.issues, null, 2));
  process.exit(1);
}
writeFileSync(PATH, serializeDocDocument(result.document));
console.log(`rewrote opener: removed ${removed.length} blocks, added ${newIds.length}`);
