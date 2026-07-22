/**
 * Conform 40-block-vocabulary/30-structured-table to the six-H2 contract
 * skeleton (Ford's 2026-07-21 interview): lead → Example → State Schema /
 * Typed Actions / Doc Renderer / Agent Renderer / Theme / Agent Adapter.
 * Reshape + deepen: annotated state-schema excerpt, Typed Actions as lead +
 * bullets, Doc Renderer absorbs the Editing material as an H3, Agent
 * Renderer gets a real projection sample, Theme table gains a Kind column,
 * Agent Adapter documents the default-adapter componentAction flow.
 * Fact fixes vs code: the editor node view is EDITABLE (was "non-editable"),
 * density is accepted-but-ignored by the renderer, the default theme file
 * has FIVE overrides (doc showed three), change-log-voiced tails dropped.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";

const PATH = "docs/10-system-design/40-block-vocabulary/30-structured-table/doc.json";
const CONTRACT = "10-system-design/30-data-model/20-block-design";

// Every source path referenced by the page must exist on disk.
const SOURCE_PATHS = [
  "packages/docs-model/src/components/structured-table/state.ts",
  "packages/docs-model/src/components/structured-table/lib.ts",
  "packages/docs-model/src/components/structured-table/agent-view.ts",
  "packages/docs-model/src/doc-ops.ts",
  "packages/docs-viewer/src/components/structured-table/table-classes.ts",
  "packages/docs-viewer/src/components/structured-table/StructuredTableDocsBlock.tsx",
  "packages/docs-viewer/src/components/structured-table/editor-node-view.tsx",
  "packages/docs-workbench/web/src/theme/theme-folders.ts",
  "themes/default/components/structured-table.json",
];
for (const p of SOURCE_PATHS) {
  if (!existsSync(p)) throw new Error(`source path missing: ${p}`);
}
const src = (path: string) => ({ code: true, reference: { kind: "source", path } });
const docRef = (path: string) => ({ reference: { kind: "doc", path } });

const doc = JSON.parse(readFileSync(PATH, "utf8"));
const blocks = doc.blocks as Record<string, any>;
const root = blocks[doc.root];

// ---------------------------------------------------------------- lead
blocks["b-20-structured-table-lead-2"].text = [
  { insert: "The structured-table family owns one block type, " },
  { insert: "structured-table", attributes: { code: true } },
  {
    insert:
      ": a columns × rows grid of rich-text cells kept in typed props, not prose — each cell is a plain string or a span array carrying inline marks. Use it for index tables, comparison matrices, and anything an agent should edit cell-by-cell instead of re-flowing text. Each section below instantiates one element of the block-design contract for this family.",
  },
];

// ---------------------------------------------------------------- Example
// The default theme file carries FIVE overrides on disk; show all of them.
blocks["b-20-structured-table-example-intro"].text = [
  { insert: "A live instance of the type — the default theme's five structured-table overrides (" },
  { insert: "themes/default/components/structured-table.json", attributes: src("themes/default/components/structured-table.json") },
  { insert: "), with code-marked CSS-variable cells:" },
];
blocks["b-20-structured-table-example-block"].props.rows = [
  ["headerRuleWidth", [{ insert: "--docs-table-header-rule-width", attributes: { code: true } }], "1.5px"],
  ["cellPaddingY", [{ insert: "--docs-table-cell-pad-y", attributes: { code: true } }], "12px"],
  ["rowRuleOpacity", [{ insert: "--docs-table-row-rule-opacity", attributes: { code: true } }], "0.8"],
  ["handleOffset", [{ insert: "--docs-table-handle-offset", attributes: { code: true } }], "16px"],
  ["selectionPadding", [{ insert: "--docs-table-selection-pad", attributes: { code: true } }], "4px"],
];

// ---------------------------------------------------------------- State Schema
blocks["b-20-structured-table-state-h-3"].text = [{ insert: "State Schema" }];

blocks["b-stfam-state-intro"] = {
  id: "b-stfam-state-intro",
  type: "paragraph",
  props: {},
  text: [
    { insert: "All state is four typed props — " },
    { insert: "carriesText: false", attributes: { code: true } },
    { insert: ", no " },
    { insert: "text", attributes: { code: true } },
    { insert: " key. The schema is a closed TypeBox object in " },
    {
      insert: "packages/docs-model/src/components/structured-table/state.ts",
      attributes: src("packages/docs-model/src/components/structured-table/state.ts"),
    },
    { insert: ". The contract is " },
    { insert: "State schema", attributes: docRef(`${CONTRACT}/10-state-schema`) },
    { insert: "." },
  ],
  children: [],
};

blocks["b-stfam-state-code"] = {
  id: "b-stfam-state-code",
  type: "code",
  props: {
    language: "ts",
    annotations: [
      {
        lines: "3",
        label: "Plain title",
        note: "The optional caption is always a plain string — cell marks never apply to it.",
      },
      {
        lines: "4-5",
        label: "Cell union",
        note: "TableCellSchema is a plain string (the canonical unmarked form) or an array of spans whose closed attribute set is bold/italic/strike/code/link — reference is invalid in cells.",
      },
      {
        lines: "14",
        label: "Closed schema",
        note: "additionalProperties: false — unknown props fail validation.",
      },
    ],
  },
  text: [
    {
      insert:
        'export const StructuredTableState = Type.Object(\n  {\n    title: Type.Optional(Type.String()),\n    columns: Type.Array(TableCellSchema),\n    rows: Type.Array(Type.Array(TableCellSchema)),\n    density: Type.Optional(\n      Type.Union([\n        Type.Literal("compact"),\n        Type.Literal("normal"),\n        Type.Literal("relaxed"),\n      ]),\n    ),\n  },\n  { additionalProperties: false },\n);',
    },
  ],
  children: [],
};

// density is schema-accepted but the renderer ignores it (spacing is themed).
blocks["b-20-structured-table-state-4"].props.rows = [
  ["title", "string", "no", "Optional caption above the table. Always a plain string — no marks."],
  [
    "columns",
    "TableCell[]",
    "yes",
    "Header names, in order. A TableCell is a plain string or a DeltaSpan[] carrying inline marks.",
  ],
  [
    "rows",
    "TableCell[][]",
    "yes",
    "One cell array per row; actions normalize each row to the column count. Unmarked cells are stored as the plain string (canonical).",
  ],
  [
    "density",
    '"compact" / "normal" / "relaxed"',
    "no",
    "Accepted by the schema; the renderer ignores it — spacing comes from the theme tokens.",
  ],
];

blocks["b-20-structured-table-state-note-5"].text = [
  {
    insert:
      "Cells — body and header alike — carry the inline mark set: bold, italic, strike, code, and link; the cell attribute schema is closed, so ",
  },
  { insert: "reference", attributes: { code: true } },
  {
    insert:
      " chips are rejected. An unmarked cell is stored as the plain string: a span-array cell with zero attributed spans fails validation (",
  },
  { insert: "checkStructuredTableProps", attributes: { code: true } },
  {
    insert:
      ", the beyond-schema check that runs after the TypeBox schema passes), so an all-plain table has exactly one encoding.",
  },
];

// ---------------------------------------------------------------- Typed Actions
blocks["b-20-structured-table-actions-note-9"].text = [
  {
    insert:
      "Five verbs cover the grid — the family's whole agent write surface for cells. Each action validates, applies against the block's current props, and returns a shallow props patch; rejections come back at ",
  },
  { insert: "$.params.<name>", attributes: { code: true } },
  {
    insert:
      " (an out-of-range index, a duplicate or unknown column name) without touching the document. The contract is ",
  },
  { insert: "Typed actions", attributes: docRef(`${CONTRACT}/20-typed-actions`) },
  { insert: "." },
];

const actionBullets: Array<[string, any[]]> = [
  [
    "b-stfam-action-li-1",
    [
      { insert: "Column addressing takes exactly one of " },
      { insert: "column", attributes: { code: true } },
      { insert: " (by name) or " },
      { insert: "columnIndex", attributes: { code: true } },
      { insert: " (by position); name matching and the duplicate-name check compare the header's plain text." },
    ],
  ],
  [
    "b-stfam-action-li-2",
    [
      { insert: "addColumn", attributes: { code: true } },
      { insert: " rejects a duplicate name and back-fills existing rows with " },
      { insert: "fill", attributes: { code: true } },
      { insert: " (default the empty string); row and column inserts default to the end." },
    ],
  ],
  [
    "b-stfam-action-li-3",
    [
      { insert: "addRow", attributes: { code: true } },
      { insert: " pads or truncates " },
      { insert: "cells", attributes: { code: true } },
      { insert: " to the column count; the column actions re-normalize every row on the way through." },
    ],
  ],
  [
    "b-stfam-action-li-4",
    [
      { insert: "Cell-content params (" },
      { insert: "value", attributes: { code: true } },
      { insert: ", " },
      { insert: "cells", attributes: { code: true } },
      { insert: ", " },
      { insert: "name", attributes: { code: true } },
      { insert: ", " },
      { insert: "fill", attributes: { code: true } },
      { insert: ") are inline markdown, parsed to spans by the shared inline tokenizer (" },
      {
        insert: "parseTableCellInput",
        attributes: src("packages/docs-model/src/components/structured-table/lib.ts"),
      },
      { insert: "); unmarked input stays the plain string." },
    ],
  ],
  [
    "b-stfam-action-li-5",
    [
      { insert: "Links the parser classifies as doc or source references downgrade to plain " },
      { insert: "link", attributes: { code: true } },
      { insert: " marks — " },
      { insert: "href", attributes: { code: true } },
      { insert: " is the path plus a " },
      { insert: "#section", attributes: { code: true } },
      { insert: ", " },
      { insert: "#L<line>", attributes: { code: true } },
      { insert: ", or " },
      { insert: "#<symbol>", attributes: { code: true } },
      { insert: " suffix — because cells forbid " },
      { insert: "reference", attributes: { code: true } },
      { insert: "." },
    ],
  ],
];
for (const [id, text] of actionBullets) {
  blocks[id] = { id, type: "list-item", props: {}, text, children: [] };
}

// ---------------------------------------------------------------- Doc Renderer
blocks["b-20-structured-table-proj-h-6"].text = [{ insert: "Doc Renderer" }];

blocks["b-stfam-docrender-read"] = {
  id: "b-stfam-docrender-read",
  type: "paragraph",
  props: {},
  text: [
    {
      insert:
        "One accent-rule look, shared by the read surface and the editor at rest: an optional title line, a rule under the header tinted by the header-rule tokens, light rules between body rows (none after the last), a row hover wash, and no vertical rules or cell boxes. The class strings live in ",
    },
    {
      insert: "table-classes.ts",
      attributes: src("packages/docs-viewer/src/components/structured-table/table-classes.ts"),
    },
    { insert: " and are imported verbatim by both the read renderer (" },
    {
      insert: "StructuredTableDocsBlock.tsx",
      attributes: src("packages/docs-viewer/src/components/structured-table/StructuredTableDocsBlock.tsx"),
    },
    {
      insert:
        ") and the editor grid, so the two surfaces cannot drift. Header cells keep a 60px minimum width so a freshly added empty column stays visible, and every spacing and rule value routes through the ",
    },
    { insert: "--docs-table-*", attributes: { code: true } },
    {
      insert:
        " theme tokens. A block whose columns are missing or malformed renders the invalid-block placeholder. The contract is ",
    },
    { insert: "Doc renderer", attributes: docRef(`${CONTRACT}/30-doc-renderer`) },
    { insert: "." },
  ],
  children: [],
};

// Fact fix: the node view IS editable (in-place cells), not a static atom.
blocks["b-20-structured-table-editor-12"].text = [
  { insert: "In the editor the block is a ProseMirror atom leaf that swaps in its own editable node view (" },
  {
    insert: "editor-node-view.tsx",
    attributes: src("packages/docs-viewer/src/components/structured-table/editor-node-view.tsx"),
  },
  {
    insert:
      ") — cells edit in place, Notion-style, instead of through the generic static atom views. There is no slash-menu entry; structured tables enter a document through agent ops or existing content.",
  },
];

blocks["b-20-structured-table-editing-heading"].props.level = 3;

// ---------------------------------------------------------------- Agent Renderer
blocks["b-stfam-agentrender-h"] = {
  id: "b-stfam-agentrender-h",
  type: "heading",
  props: { level: 2 },
  text: [{ insert: "Agent Renderer" }],
  children: [],
};

blocks["b-20-structured-table-proj-7"].text = [
  { insert: "The agent-facing markdown projection (" },
  {
    insert: "agent-view.ts",
    attributes: src("packages/docs-model/src/components/structured-table/agent-view.ts"),
  },
  { insert: "): an optional " },
  { insert: "**<title>**", attributes: { code: true } },
  { insert: " bold line, then a markdown pipe table: header row, " },
  { insert: "---", attributes: { code: true } },
  {
    insert:
      " separator row, one line per row. A title-only or table-only block renders just the part it has. Cell marks render as inline markdown — ",
  },
  { insert: "**bold**", attributes: { code: true } },
  { insert: ", " },
  { insert: "*italic*", attributes: { code: true } },
  { insert: ", " },
  { insert: "~~strike~~", attributes: { code: true } },
  { insert: ", " },
  { insert: "`code`", attributes: { code: true } },
  { insert: ", " },
  { insert: "[text](href)", attributes: { code: true } },
  { insert: " — so table reads round-trip with table writes. The contract is " },
  { insert: "Agent renderer", attributes: docRef(`${CONTRACT}/40-agent-renderer`) },
  { insert: ". The Example table above projects as:" },
];

blocks["b-stfam-agentrender-sample"] = {
  id: "b-stfam-agentrender-sample",
  type: "code",
  props: {
    language: "markdown",
    annotations: [
      { lines: "1", label: "Title line", note: "The optional title projects as one bold line above the table." },
      {
        lines: "5-9",
        label: "Cells",
        note: "Plain-string cells pass through verbatim; span cells render their marks as inline markdown — here the code mark's backticks.",
      },
    ],
  },
  text: [
    {
      insert:
        "**Default theme — structured-table overrides**\n\n| Key | CSS variable | Value |\n| --- | --- | --- |\n| headerRuleWidth | `--docs-table-header-rule-width` | 1.5px |\n| cellPaddingY | `--docs-table-cell-pad-y` | 12px |\n| rowRuleOpacity | `--docs-table-row-rule-opacity` | 0.8 |\n| handleOffset | `--docs-table-handle-offset` | 16px |\n| selectionPadding | `--docs-table-selection-pad` | 4px |",
    },
  ],
  children: [],
};

// ---------------------------------------------------------------- Theme
blocks["b-20-structured-table-theming-heading"].text = [{ insert: "Theme" }];

blocks["b-20-structured-table-theming-para"].text = [
  { insert: "This block's theme file is " },
  { insert: "components/structured-table.json", attributes: { code: true } },
  { insert: " in a theme folder (" },
  { insert: "themes/<id>/", attributes: { code: true } },
  { insert: "; the system is " },
  { insert: "Theming", attributes: docRef("20-implementation/40-theming") },
  { insert: "). Every value is one string for both modes or a " },
  { insert: "{ light, dark }", attributes: { code: true } },
  { insert: " pair, validated against " },
  {
    insert: "THEME_TOKEN_REGISTRY",
    attributes: src("packages/docs-workbench/web/src/theme/theme-folders.ts"),
  },
  {
    insert:
      ". The registry is kind-aware: each key declares color, length, or number, so the workbench theme rail renders a color picker or a bounded slider (min/max/step from the registry) per key — lengths carry a px unit, opacities are bare numbers. The contract is ",
  },
  { insert: "Theming", attributes: docRef(`${CONTRACT}/50-theming`) },
  { insert: "." },
];

blocks["b-20-structured-table-theming-table"].props.columns = ["Key", "CSS variable", "Kind", "Notes"];
blocks["b-20-structured-table-theming-table"].props.rows = [
  ["border", "--docs-table-border", "color", "Outer wrapper border (default transparent)"],
  ["headerBg", "--docs-table-header-bg", "color", "Header row background (default transparent)"],
  ["headerFg", "--docs-table-header-fg", "color", "Header text color"],
  ["headerRule", "--docs-table-header-rule", "color", "Header rule color (falls back to headerFg)"],
  ["headerRuleWidth", "--docs-table-header-rule-width", "length", "Header rule thickness (default 1.5px)"],
  ["headerRuleOpacity", "--docs-table-header-rule-opacity", "number", "Header rule opacity (default 0.5)"],
  ["rowRule", "--docs-table-row-rule", "color", "Row rule color (falls back to the UI border color)"],
  ["rowRuleWidth", "--docs-table-row-rule-width", "length", "Row rule thickness (default 1px)"],
  ["rowRuleOpacity", "--docs-table-row-rule-opacity", "number", "Row rule opacity (default 1)"],
  ["cellPaddingY", "--docs-table-cell-pad-y", "length", "Vertical cell padding (default 10px)"],
  ["cellPaddingX", "--docs-table-cell-pad-x", "length", "Column gap (default 16px)"],
  ["fontSize", "--docs-table-font-size", "length", "Cell text size (default 14px; headers render 1px smaller)"],
  ["handleRadius", "--docs-table-handle-radius", "length", "Corner radius of the column/row grab handles (default 3px)"],
  ["handleOffset", "--docs-table-handle-offset", "length", "How far outside the table edge the grab handles sit (default 12px)"],
  ["selectionPadding", "--docs-table-selection-pad", "length", "Outward padding of the column/row selection outline (default 3px)"],
];

// ---------------------------------------------------------------- Agent Adapter
blocks["b-20-structured-table-agent-h-13"].text = [{ insert: "Agent Adapter" }];

blocks["b-stfam-adapter-p"] = {
  id: "b-stfam-adapter-p",
  type: "paragraph",
  props: {},
  text: [
    {
      insert:
        "The family uses the default adapter: no agent of its own, no forwarding authority — all five actions carry a local apply. On the wire an edit is a ",
    },
    { insert: "componentAction", attributes: { code: true } },
    { insert: " op (one of the seven doc ops) naming the block, the action key, and params; the kernel (" },
    { insert: "doc-ops.ts", attributes: src("packages/docs-model/src/doc-ops.ts") },
    {
      insert:
        ") resolves the action from the registry, validates params against the action's schema, runs apply, and executes the returned patch through the standard ",
    },
    { insert: "updateBlock", attributes: { code: true } },
    { insert: " path — the undo inverse is an ordinary " },
    { insert: "updateBlock", attributes: { code: true } },
    {
      insert:
        ". Structural work on the table as a block — insert, move, delete — stays on the generic ops. The contract is ",
    },
    { insert: "Agent adapter", attributes: docRef(`${CONTRACT}/60-agent-adapter`) },
    { insert: "." },
  ],
  children: [],
};

// Keep the hand-patching guidance, but as a paragraph (a one-item list is odd).
blocks["b-20-structured-table-agent-1-14"].type = "paragraph";

// Rejection-path fact moved into the Typed Actions lead.
delete blocks["b-20-structured-table-agent-2-15"];

// ---------------------------------------------------------------- root order
root.children = [
  "b-20-structured-table-lead-2",
  "b-20-structured-table-example-h",
  "b-20-structured-table-example-intro",
  "b-20-structured-table-example-block",
  "b-20-structured-table-state-h-3", // ## State Schema
  "b-stfam-state-intro",
  "b-stfam-state-code",
  "b-20-structured-table-state-4",
  "b-20-structured-table-state-note-5",
  "b-20-structured-table-actions-h-8", // ## Typed Actions
  "b-20-structured-table-actions-note-9",
  "b-stfam-action-li-1",
  "b-stfam-action-li-2",
  "b-stfam-action-li-3",
  "b-stfam-action-li-4",
  "b-stfam-action-li-5",
  "b-20-structured-table-actions-10",
  "b-20-structured-table-proj-h-6", // ## Doc Renderer
  "b-stfam-docrender-read",
  "b-20-structured-table-editor-12",
  "b-20-structured-table-editing-heading", // ### Editing
  "b-20-structured-table-editing-para-1",
  "b-20-structured-table-editing-para-2",
  "b-20-structured-table-editing-para-3",
  "b-stfam-agentrender-h", // ## Agent Renderer
  "b-20-structured-table-proj-7",
  "b-stfam-agentrender-sample",
  "b-20-structured-table-theming-heading", // ## Theme
  "b-20-structured-table-theming-para",
  "b-20-structured-table-theming-table",
  "b-20-structured-table-agent-h-13", // ## Agent Adapter
  "b-stfam-adapter-p",
  "b-20-structured-table-agent-1-14",
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
console.log("ok — structured-table family page conformed, canonical");
