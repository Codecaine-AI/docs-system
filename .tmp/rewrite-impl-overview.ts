/**
 * Rewrite the 20-implementation section overview per Ford's 2026-07-22
 * interview: thin orienting overview — opener, trimmed bundle paragraph,
 * child index in the bullet standard, one-line quick start. Pipeline art,
 * stale type/action counts, and the dead "comment" vocabulary all die
 * (the Packages canvas owns the pipeline picture now). Title
 * "Implementation", dup H1 dropped.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";

const PATH = "docs/20-implementation/doc.json";
const IMPL = "20-implementation";

type Span = { insert: string; attributes?: Record<string, unknown> };
type Block = { id: string; type: string; props: Record<string, unknown>; text?: Span[]; children: string[] };

const blocks: Record<string, Block> = {};
const order: string[] = [];
function add(b: Block, top = true) {
  blocks[b.id] = b;
  if (top) order.push(b.id);
}
function docRef(text: string, path: string): Span {
  return { insert: text, attributes: { reference: { kind: "doc", path } } };
}

add({
  id: "b-impl-ov-opener",
  type: "paragraph",
  props: {},
  text: [
    {
      insert:
        "The implementation is the running system behind the design: the packages that store, index, serve, and render ",
    },
    { insert: "doc.json", attributes: { code: true } },
    {
      insert:
        ", composed into the workbench app that humans and agents both edit through. This section walks the packages and their boundaries, the workbench, the save pipeline, and the theming system.",
    },
  ],
  children: [],
});

add({
  id: "b-impl-ov-bundle",
  type: "paragraph",
  props: {},
  text: [
    { insert: "A document is a bundle: a folder holding " },
    { insert: "doc.json", attributes: { code: true } },
    { insert: " (the block tree), optional " },
    { insert: "annotations.json", attributes: { code: true } },
    { insert: ", and an " },
    { insert: "assets/", attributes: { code: true } },
    {
      insert:
        " folder for images and diagram sidecars. Bundles live in a docs/ tree owned by whichever project the docs are about — this repo's ",
    },
    { insert: "docs/", attributes: { code: true, reference: { kind: "source", path: "docs" } } },
    {
      insert:
        " is the tree you are reading. Markdown is an on-ramp, not the storage format: ",
    },
    { insert: "docs migrate", attributes: { code: true } },
    {
      insert:
        " converts an existing markdown tree into bundles once; from then on every edit goes through typed ops.",
    },
  ],
  children: [],
});

add({
  id: "b-impl-ov-index-h",
  type: "heading",
  props: { level: 2 },
  text: [{ insert: "In This Section" }],
  children: [],
});

const INDEX: Array<[string, string, string, string]> = [
  [
    "b-impl-ov-ix-packages",
    "Packages",
    `${IMPL}/10-packages`,
    "Where the code is allowed to be cut — the boundaries, and the as-built map of every package.",
  ],
  [
    "b-impl-ov-ix-workbench",
    "Using the workbench",
    `${IMPL}/20-workbench`,
    "The app: reading, editing, and annotating docs.",
  ],
  [
    "b-impl-ov-ix-save",
    "The save pipeline: keystroke to disk",
    `${IMPL}/30-save-pipeline`,
    "How an edit becomes validated canonical bytes.",
  ],
  [
    "b-impl-ov-ix-theming",
    "Theming: overview",
    `${IMPL}/40-theming`,
    "Global themes, component themes, fonts, and the system UI.",
  ],
  [
    "b-impl-ov-ix-devloop",
    "Local development loop",
    `${IMPL}/99-appendix/00-local-dev-loop`,
    "Running, testing, and iterating on the tooling itself.",
  ],
];
for (const [id, title, path, gloss] of INDEX) {
  add(
    { id: `${id}-gloss`, type: "list-item", props: {}, text: [{ insert: gloss }], children: [] },
    false,
  );
  add({ id, type: "list-item", props: {}, text: [docRef(title, path)], children: [`${id}-gloss`] });
}

add({
  id: "b-impl-ov-quickstart",
  type: "paragraph",
  props: {},
  text: [
    { insert: "To read these docs live, run " },
    { insert: "bun run docs serve", attributes: { code: true } },
    { insert: " from the repo root — the workbench opens at " },
    { insert: "http://localhost:4800", attributes: { code: true } },
    { insert: ". The full loop is " },
    docRef("Local development loop", `${IMPL}/99-appendix/00-local-dev-loop`),
    { insert: "." },
  ],
  children: [],
});

const existing = JSON.parse(readFileSync(PATH, "utf8"));
const doc = {
  schemaVersion: existing.schemaVersion,
  id: existing.id,
  title: "Implementation",
  root: "b-impl-ov-root",
  blocks: {
    "b-impl-ov-root": { id: "b-impl-ov-root", type: "paragraph", props: {}, children: order },
    ...blocks,
  },
};

const result = validateDocDocument(doc);
if (!result.ok) {
  console.error(JSON.stringify(result.issues, null, 2));
  process.exit(1);
}
writeFileSync(PATH, serializeDocDocument(result.document));
const bytes = readFileSync(PATH, "utf8");
const re = validateDocDocument(JSON.parse(bytes));
if (!re.ok || serializeDocDocument(re.document) !== bytes) {
  console.error("NOT CANONICAL");
  process.exit(1);
}
console.log("ok — implementation overview rewritten, canonical");
