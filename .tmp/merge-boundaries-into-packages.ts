/**
 * Ford's 2026-07-22 call: package boundaries is implementation, not design.
 * Merge docs/10-system-design/50-package-boundaries INTO the packages
 * section overview (docs/20-implementation/10-packages/doc.json): the WHY
 * (boundaries, forced-vs-judgment, open calls, schema authority) leads, the
 * as-built map (inventory, Makefile, enforcement) follows. Also:
 * - coerced mermaid callout replaced by the new canvas embed
 * - externals bullet generalized to canvas + sequence
 * - review callouts get kind "Boundary under review" + short titles
 * - dup H1s dropped; boundaries' as-built pointer dropped (same doc now)
 * - sd-overview loses its Package Boundaries section
 * - impl-overview link retargeted wording + new title "Packages"
 * - old 50-package-boundaries bundle DELETED from disk
 */
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";

const BOUNDARIES = "docs/10-system-design/50-package-boundaries/doc.json";
const PACKAGES = "docs/20-implementation/10-packages/doc.json";
const SD_OVERVIEW = "docs/10-system-design/doc.json";
const IMPL_OVERVIEW = "docs/20-implementation/doc.json";

function landDoc(path: string, doc: any) {
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${path} INVALID: ${JSON.stringify(result.issues, null, 2)}`);
    process.exit(1);
  }
  writeFileSync(path, serializeDocDocument(result.document));
  const bytes = readFileSync(path, "utf8");
  const re = validateDocDocument(JSON.parse(bytes));
  if (!re.ok || serializeDocDocument(re.document) !== bytes) {
    console.error(`${path} NOT CANONICAL`);
    process.exit(1);
  }
  console.log(`ok ${path}`);
}

const src = JSON.parse(readFileSync(BOUNDARIES, "utf8"));
const dst = JSON.parse(readFileSync(PACKAGES, "utf8"));

// --- Blocks carried over from the boundaries doc (verbatim unless noted).
const CARRY = [
  "b-pkgb-lead-2",
  "b-pkgb-why-heading-3",
  "b-pkgb-why-para-4",
  "b-pkgb-chain-heading-5",
  // canvas embed replaces b-pkgb-chain-graph-6 here
  "b-pkgb-chain-para-7",
  "b-pkgb-need-heading-8",
  "b-pkgb-need-para-9",
  "b-pkgb-mental-model-10",
  "b-pkgb-forced-heading-11",
  "b-pkgb-forced-intro-12",
  "b-pkgb-why-model-13",
  "b-pkgb-why-index-14",
  "b-pkgb-why-server-15",
  "b-pkgb-why-viewer-16",
  "b-pkgb-why-workbench-17",
  "b-pkgb-why-cli-18",
  "b-pkgb-why-framework-19",
  "b-pkgb-why-canvas-20",
  "b-pkgb-review-heading-21",
  "b-pkgb-review-index-22",
  "b-pkgb-review-cli-23",
  "b-pkgb-review-framework-24",
  "b-pkgb-authority-heading-25",
  "b-pkgb-authority-para-26",
];
for (const id of CARRY) {
  if (!src.blocks[id]) throw new Error(`missing source block ${id}`);
  dst.blocks[id] = src.blocks[id];
}

// Canvas embed for the dependency chain (asset authored by the canvas worker).
dst.blocks["b-pkgb-chain-canvas"] = {
  id: "b-pkgb-chain-canvas",
  type: "canvas",
  props: {
    src: "./assets/canvases/package-dependency-chain.canvas.json",
    title: "Who depends on whom",
  },
  children: [],
};

// Externals bullet generalized to canvas + sequence.
dst.blocks["b-pkgb-why-canvas-20"] = {
  id: "b-pkgb-why-canvas-20",
  type: "list-item",
  props: {},
  text: [
    { insert: "canvas and sequence — not more packages.", attributes: { bold: true } },
    { insert: " " },
    {
      insert: "external/canvas",
      attributes: { code: true, reference: { kind: "source", path: "external/canvas" } },
    },
    { insert: " and " },
    {
      insert: "external/sequence",
      attributes: { code: true, reference: { kind: "source", path: "external/sequence" } },
    },
    { insert: " are their own projects, vendored under " },
    {
      insert: "external/",
      attributes: { code: true, reference: { kind: "source", path: "external" } },
    },
    { insert: "; only their inner packages join the workspace so embeds resolve. Forced." },
  ],
  children: [],
};

// Review callouts: kind carries the semantic label, titles shortened.
const REVIEW_TITLES: Record<string, string> = {
  "b-pkgb-review-index-22": "Fold docs-index into docs-server",
  "b-pkgb-review-cli-23": "Merge docs-cli and docs-workbench",
  "b-pkgb-review-framework-24": "Unpackage framework",
};
for (const [id, title] of Object.entries(REVIEW_TITLES)) {
  dst.blocks[id].props = { kind: "Boundary under review", title, tone: "decision" };
}

// As-built map lead: its design-lives-elsewhere sentence dies (same doc now).
dst.blocks["b-00-overview-lead-2"].text = [
  {
    insert:
      "The as-built inventory: every workspace package, what it owns today, and the tests that keep the seams honest.",
  },
];

// New section heading for the map half.
dst.blocks["b-pkg-asbuilt-heading"] = {
  id: "b-pkg-asbuilt-heading",
  type: "heading",
  props: { level: 2 },
  text: [{ insert: "The As-Built Map" }],
  children: [],
};

// --- New root order: boundaries (why) first, map (what) second.
dst.blocks[dst.root].children = [
  "b-pkgb-lead-2",
  "b-pkgb-why-heading-3",
  "b-pkgb-why-para-4",
  "b-pkgb-chain-heading-5",
  "b-pkgb-chain-canvas",
  "b-pkgb-chain-para-7",
  "b-pkgb-need-heading-8",
  "b-pkgb-need-para-9",
  "b-pkgb-mental-model-10",
  "b-pkgb-forced-heading-11",
  "b-pkgb-forced-intro-12",
  "b-pkgb-why-model-13",
  "b-pkgb-why-index-14",
  "b-pkgb-why-server-15",
  "b-pkgb-why-viewer-16",
  "b-pkgb-why-workbench-17",
  "b-pkgb-why-cli-18",
  "b-pkgb-why-framework-19",
  "b-pkgb-why-canvas-20",
  "b-pkgb-review-heading-21",
  "b-pkgb-review-index-22",
  "b-pkgb-review-cli-23",
  "b-pkgb-review-framework-24",
  "b-pkgb-authority-heading-25",
  "b-pkgb-authority-para-26",
  "b-pkg-asbuilt-heading",
  "b-00-overview-lead-2",
  "b-00-overview-model-role-5",
  "b-00-overview-index-role-6",
  "b-00-overview-server-role-7",
  "b-00-overview-viewer-role-8",
  "b-00-overview-workbench-role-9",
  "b-00-overview-cli-role-10",
  "b-00-overview-framework-role-11",
  "b-00-overview-canvas-role-12",
  "b-00-overview-makefile-31",
  "b-00-overview-enforcement-28",
  "b-00-overview-import-test-29",
  "b-00-overview-component-mirror-30",
  "b-00-overview-seq-heading-32",
  "b-00-overview-seq-intro-33",
  "b-00-overview-seq-agent-34",
  "b-00-overview-seq-seam-35",
  "b-00-overview-seq-order-36",
];
// Dropped: both dup H1s (b-00-overview-title-1 stays in blocks only if
// referenced — remove it and the old map H1 outright).
delete dst.blocks["b-00-overview-title-1"];

dst.title = "Packages";
dst.id = "20-implementation-10-packages";

landDoc(PACKAGES, dst);

// --- sd-overview: the Package Boundaries section leaves system design.
const sd = JSON.parse(readFileSync(SD_OVERVIEW, "utf8"));
sd.blocks[sd.root].children = sd.blocks[sd.root].children.filter(
  (id: string) => id !== "b-sdov-boundaries-h-116" && id !== "b-sdov-boundaries-p-117",
);
delete sd.blocks["b-sdov-boundaries-h-116"];
delete sd.blocks["b-sdov-boundaries-p-117"];
landDoc(SD_OVERVIEW, sd);

// --- impl overview: link sentence follows the merged doc's new title.
const impl = JSON.parse(readFileSync(IMPL_OVERVIEW, "utf8"));
const layerBlock = impl.blocks["b-00-system-overview-each-layer-only-depends-6"];
layerBlock.text = [
  { insert: "Each layer only depends on the layers above it in this list. " },
  {
    insert: "Packages",
    attributes: { reference: { kind: "doc", path: "20-implementation/10-packages" } },
  },
  { insert: " walks through the boundaries and every package in detail." },
];
landDoc(IMPL_OVERVIEW, impl);

// --- The old bundle leaves the corpus.
rmSync("docs/10-system-design/50-package-boundaries", { recursive: true });
console.log("ok — 10-system-design/50-package-boundaries deleted");
