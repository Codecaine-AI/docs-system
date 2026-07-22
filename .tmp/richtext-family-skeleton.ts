/**
 * Conform 40-block-vocabulary/10-rich-text to the six-H2 contract skeleton
 * (Ford's 2026-07-21 interview: full conformance, Example stays after the
 * type index, type index links to subpages, all-vocabulary carriers table
 * stays here) and fix fact errors vs code: sequence carriesText is FALSE
 * (only code carries a text payload), state-shape missing from the false
 * row, stale `label` remnants in the delta example + annotations.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";

const PATH = "docs/10-system-design/40-block-vocabulary/10-rich-text/doc.json";
const FAM = "10-system-design/40-block-vocabulary/10-rich-text";

const doc = JSON.parse(readFileSync(PATH, "utf8"));
const blocks = doc.blocks as Record<string, any>;
const root = blocks[doc.root];

// 1. Type index: link each type name to its subpage.
const typeLinks: Array<[string, string, string]> = [
  ["b-rich-text-overview-type-paragraph-4", "paragraph", "10-paragraph"],
  ["b-rich-text-overview-type-heading-5", "heading", "11-heading"],
  ["b-rich-text-overview-type-list-item-6", "list-item", "12-list-item"],
  ["b-rich-text-overview-type-quote-7", "quote", "13-quote"],
  ["b-rich-text-overview-type-callout-8", "callout", "14-callout"],
  ["b-rich-text-overview-type-divider-9", "divider", "15-divider"],
  ["b-rich-text-overview-type-image-10", "image", "16-image"],
  ["b-rich-text-overview-type-video-11", "video", "17-video"],
];
for (const [id, name, dir] of typeLinks) {
  blocks[id].text = [
    { insert: name, attributes: { reference: { kind: "doc", path: `${FAM}/${dir}` } } },
  ];
}

// 2. Heading renames.
blocks["b-rtfam-state-h-20"].text = [{ insert: "State schema" }];
blocks["b-rtfam-renderers-h-34"].text = [{ insert: "Doc renderer" }];
blocks["b-rtfam-theming-h-38"].text = [{ insert: "Theme" }];

// 3. Delta example: drop the stale label line; fix annotation note + range.
const delta = blocks["b-20-rich-text-delta-example-3"];
delta.text = [
  {
    insert:
      '[\n  { "insert": "Read " },\n  { "insert": "doc.json", "attributes": { "code": true } },\n  { "insert": " with " },\n  { "insert": "stable anchors", "attributes": { "bold": true, "italic": true } },\n  { "insert": " and a link", "attributes": { "link": "https://example.com/docs" } },\n  { "insert": " to " },\n  {\n    "insert": "the block vocabulary",\n    "attributes": {\n      "reference": {\n        "kind": "doc",\n        "path": "10-system-design/40-block-vocabulary"\n      }\n    }\n  },\n  { "insert": "." }\n]',
  },
];
delta.props.annotations = delta.props.annotations.map((a: any) =>
  a.label === "Reference chip"
    ? {
        ...a,
        lines: "11-14",
        note: "reference carries the shared SpectreRef identity for doc mentions and canvas links alike: kind is doc or source, path is corpus-relative. The span's insert is the display text.",
      }
    : a,
);

// 4. SpectreRef example: label is not display text anymore.
const refEx = blocks["b-20-rich-text-ref-example-9"];
refEx.props.annotations = refEx.props.annotations.map((a: any) =>
  a.label === "Optional precision"
    ? { ...a, note: "symbol, line, and section narrow the target." }
    : a,
);

// 5. Carriers: sequence does not carry text; state-shape joins the false row.
blocks["b-20-rich-text-carriers-intro-12"].text = [
  { insert: "Whether a type carries delta text is a per-type fact, declared as " },
  { insert: "carriesText", attributes: { code: true } },
  { insert: " in the component state definitions. Text means prose only for the rich-text flow types; for " },
  { insert: "code", attributes: { code: true } },
  { insert: " the delta text is the source payload, and marks are not meaningful there." },
];
blocks["b-20-rich-text-carriers-table-13"].props.rows = [
  ["true", "paragraph, heading, list-item, quote, callout", "Prose: marks, links, and reference chips all apply."],
  ["true", "code", "Source payload: the fenced code body; spans are plain inserts."],
  [
    "false",
    "divider, image, video, structured-table, file-tree, state-shape, interaction-surface, sequence, canvas",
    "No text key; all state lives in typed props.",
  ],
];

// 6. Agent renderer section replaces the bridges H3 + Agent notes H2.
blocks["b-rtfam-agentrender-h-40"] = {
  id: "b-rtfam-agentrender-h-40",
  type: "heading",
  props: { level: 2 },
  text: [{ insert: "Agent renderer" }],
  children: [],
};
blocks["b-rtfam-agent-note-37"].text = [
  { insert: "Per-type agent guidance lives on each type page." },
];
delete blocks["b-20-rich-text-bridges-14"]; // "Markdown bridges" H3
delete blocks["b-rtfam-agent-h-36"]; // "Agent notes" H2

// 7. Theme pointer: link the theming system.
blocks["b-rich-text-overview-theming-note-12"].text = [
  { insert: "Each type has its own theme file — see the Theme section on every type page, and " },
  { insert: "Theming", attributes: { reference: { kind: "doc", path: "20-implementation/40-theming" } } },
  { insert: " for the system." },
];

// 8. Agent adapter section (new, default-adapter statement).
blocks["b-rtfam-adapter-h-41"] = {
  id: "b-rtfam-adapter-h-41",
  type: "heading",
  props: { level: 2 },
  text: [{ insert: "Agent adapter" }],
  children: [],
};
blocks["b-rtfam-adapter-p-42"] = {
  id: "b-rtfam-adapter-p-42",
  type: "paragraph",
  props: {},
  text: [
    { insert: "The family uses the default adapter: no agent of its own. Edits arrive as generic ops over blocks and delta text; nothing forwards to an external authority. The contract is " },
    {
      insert: "Agent adapter",
      attributes: {
        reference: { kind: "doc", path: "10-system-design/30-data-model/20-block-design/60-agent-adapter" },
      },
    },
    { insert: "." },
  ],
  children: [],
};

// 9. Reorder the tail of the page.
const tailStart = root.children.indexOf("b-rtfam-renderers-h-34");
if (tailStart === -1) throw new Error("renderers heading not found in root children");
root.children = [
  ...root.children.slice(0, tailStart),
  "b-rtfam-renderers-h-34", // ## Doc renderer
  "b-rtfam-renderers-doc-35",
  "b-rtfam-agentrender-h-40", // ## Agent renderer
  "b-20-rich-text-bridges-out-15",
  "b-20-rich-text-bridges-in-16",
  "b-rtfam-agent-note-37",
  "b-rtfam-theming-h-38", // ## Theme
  "b-rich-text-overview-theming-note-12",
  "b-rtfam-adapter-h-41", // ## Agent adapter
  "b-rtfam-adapter-p-42",
];

const result = validateDocDocument(doc);
if (!result.ok) {
  console.error(JSON.stringify(result.issues, null, 2));
  process.exit(1);
}
writeFileSync(PATH, serializeDocDocument(result.document));

const bytes = readFileSync(PATH, "utf8");
const revalidated = validateDocDocument(JSON.parse(bytes));
if (!revalidated.ok || serializeDocDocument(revalidated.document) !== bytes) {
  console.error("NOT CANONICAL after write");
  process.exit(1);
}
console.log("ok — rich-text family page conformed, canonical");
