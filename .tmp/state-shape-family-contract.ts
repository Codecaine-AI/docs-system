/**
 * Rewrite 40-block-vocabulary/50-state-shape as the family's
 * contract-instantiation page (Ford's 2026-07-21 skeleton): lead paragraphs,
 * Example, then exactly six H2s — State Schema / Typed Actions / Doc Renderer /
 * Agent Renderer / Theme / Agent Adapter. Facts grounded in
 * packages/docs-model/src/components/state-shape/ (state.ts, actions/,
 * agent-view.ts), packages/docs-viewer/src/components/state-shape/, and the
 * theme-folders.ts "state-shape" registry entry (10 tokens, not the 6 the old
 * page listed). The agent-render example fences are COMPUTED from the page's
 * own live Example block through the real fieldLines/printJsonLines code and
 * asserted against stateShapeAgentView, so they cannot drift.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";
import { fieldLines, readFields } from "../packages/docs-model/src/components/shared/field.ts";
import { printJsonLines } from "../packages/docs-model/src/components/shared/json-lines.ts";
import { stateShapeAgentView } from "../packages/docs-model/src/components/state-shape/index.ts";

const PATH = "docs/10-system-design/40-block-vocabulary/50-state-shape/doc.json";
const CONTRACT = "10-system-design/30-data-model/20-block-design";
const VOCAB = "10-system-design/40-block-vocabulary";

const doc = JSON.parse(readFileSync(PATH, "utf8"));
const blocks = doc.blocks as Record<string, any>;
const root = blocks[doc.root];

// ---- span helpers ---------------------------------------------------------
const t = (insert: string) => ({ insert });
const code = (insert: string) => ({ insert, attributes: { code: true } });
const docRef = (insert: string, path: string) => ({
  insert,
  attributes: { reference: { kind: "doc", path } },
});
const srcRef = (insert: string, path: string) => {
  if (!existsSync(path)) throw new Error(`source ref path missing on disk: ${path}`);
  return { insert, attributes: { code: true, reference: { kind: "source", path } } };
};
const para = (id: string, text: any[]) => {
  blocks[id] = { id, type: "paragraph", props: {}, text, children: [] };
};
const li = (id: string, text: any[], children: string[] = []) => {
  blocks[id] = { id, type: "list-item", props: {}, text, children };
};
const h2 = (id: string, text: string) => {
  blocks[id] = { id, type: "heading", props: { level: 2 }, text: [t(text)], children: [] };
};

// ---- lead -----------------------------------------------------------------
blocks["b-25-state-shape-lead-2"].text = [
  t("The state-shape component owns one block type, "),
  code("state-shape"),
  t(" — the object-shape block of the "),
  docRef("block vocabulary", VOCAB),
  t(
    ". A block carries a recursive field tree — name, type, optionality, meaning — an optional link to the defining source symbol, and an optional JSON example instance rendered beside the tree. Model code lives in ",
  ),
  srcRef(
    "packages/docs-model/src/components/state-shape/",
    "packages/docs-model/src/components/state-shape",
  ),
  t("; the doc renderer in "),
  srcRef(
    "packages/docs-viewer/src/components/state-shape/",
    "packages/docs-viewer/src/components/state-shape",
  ),
  t("."),
];
para("b-25-state-shape-lead-doctrine", [
  t(
    "It is the state carrier of the corpus documentation doctrine: a state-shape block carries the shape of state and an example instance side by side, an ",
  ),
  docRef("interaction-surface", `${VOCAB}/60-interaction-surface`),
  t(" lists the operations that change or query it, and annotated "),
  docRef("code", `${VOCAB}/20-code-block`),
  t(
    " blocks hold the source evidence. State first, then operations; a code block is for material that is not an instance of the shape — a real source listing.",
  ),
]);

// ---- Example (kept live block; intro re-pointed at State Schema) ----------
blocks["b-25-state-shape-example-intro"].text = [
  t(
    "A live instance: a compact theme shape beside its linked JSON example pane. The shape documenting this block's own state sits under State Schema below.",
  ),
];

// ---- State Schema ---------------------------------------------------------
blocks["b-25-state-shape-state-h-3"].text = [t("State Schema")];
para("b-25-state-shape-schema-intro", [
  t("The "),
  docRef("State schema", `${CONTRACT}/10-state-schema`),
  t(" contract element: all state lives in typed props, defined by "),
  code("StateShapeState"),
  t(" in "),
  srcRef(
    "packages/docs-model/src/components/state-shape/state.ts",
    "packages/docs-model/src/components/state-shape/state.ts",
  ),
  t(". The type carries no delta text ("),
  code("carriesText: false"),
  t(")."),
]);
li("b-25-state-shape-schema-b1", [
  code("fields"),
  t(" is the one required key; "),
  code("name"),
  t(", "),
  code("description"),
  t(", "),
  code("source"),
  t(", and "),
  code("example"),
  t(" are optional, and "),
  code("additionalProperties: false"),
  t(" rejects anything else."),
]);
li("b-25-state-shape-schema-b2", [
  code("Field"),
  t(" is the shared recursive node in "),
  srcRef(
    "packages/docs-model/src/components/shared/field.ts",
    "packages/docs-model/src/components/shared/field.ts",
  ),
  t(" — the same node "),
  docRef("interaction-surface", `${VOCAB}/60-interaction-surface`),
  t(" operation params use. "),
  code("required: false"),
  t(" means optional; omitted or "),
  code("true"),
  t(" reads as required."),
]);
li("b-25-state-shape-schema-b3", [
  t(
    "A custom check past the schema enforces sibling-unique field names at every level — dot-path addressing depends on it — and that a present ",
  ),
  code("example"),
  t(" parses as JSON."),
]);
li("b-25-state-shape-schema-b4", [
  t("Reads are tolerant: "),
  code("readStateShapeFields"),
  t(", "),
  code("readStateShapeExample"),
  t(", and "),
  code("readStateShapeSource"),
  t(" skip malformed entries instead of throwing."),
]);

// ---- Typed Actions --------------------------------------------------------
para("b-25-state-shape-actions-intro", [
  t("Four actions instantiate the "),
  docRef("Typed actions", `${CONTRACT}/20-typed-actions`),
  t(" contract element, defined one file each in "),
  srcRef(
    "packages/docs-model/src/components/state-shape/actions/",
    "packages/docs-model/src/components/state-shape/actions",
  ),
  t(". Params validate against each action's TypeBox schema before "),
  code("apply()"),
  t(" runs; every action returns a shallow props patch — "),
  code("{ fields }"),
  t(" from the tree actions, "),
  code("{ example }"),
  t(" from "),
  code("setExample"),
  t("."),
]);
li("b-25-state-shape-actions-b1", [
  t("Dot-path addressing over sibling-unique names: "),
  code('"operations.params"'),
  t(" names the "),
  code("params"),
  t(" field under "),
  code("operations"),
  t("; "),
  code('""'),
  t(" or an omitted path names the root "),
  code("fields"),
  t(" array."),
]);
li("b-25-state-shape-actions-b2", [
  code("state-shape.addField"),
  t(" inserts a field under the parent named by "),
  code("path"),
  t("; "),
  code("index"),
  t(
    " defaults to the end, so document order is curated order and survives edits. Duplicate names — among the target siblings or inside the inserted subtree — are rejected.",
  ),
]);
li("b-25-state-shape-actions-b3", [
  code("state-shape.updateField"),
  t(" patches the field at "),
  code("path"),
  t(": "),
  code("patch.name"),
  t(" renames (uniqueness re-checked), "),
  code("null"),
  t(" clears "),
  code("type"),
  t("/"),
  code("required"),
  t("/"),
  code("description"),
  t(", and "),
  code("patch.fields"),
  t(" replaces the whole subtree — "),
  code("null"),
  t(" removes it."),
]);
li("b-25-state-shape-actions-b4", [
  code("state-shape.removeField"),
  t(" removes the field at "),
  code("path"),
  t(" together with its entire subtree."),
]);
li("b-25-state-shape-actions-b5", [
  code("state-shape.setExample"),
  t(" sets or clears the example; the string must parse as JSON, "),
  code("null"),
  t(" clears it."),
]);

// ---- Doc Renderer ---------------------------------------------------------
blocks["b-25-state-shape-renderers-heading"].text = [t("Doc Renderer")];
para("b-25-state-shape-dr-intro", [
  t("The "),
  docRef("Doc renderer", `${CONTRACT}/30-doc-renderer`),
  t(" contract element: "),
  code("StateShapeBlock"),
  t(" in "),
  srcRef(
    "packages/docs-viewer/src/components/state-shape/StateShapeDocsBlock.tsx",
    "packages/docs-viewer/src/components/state-shape/StateShapeDocsBlock.tsx",
  ),
  t(
    ", wired through the descriptor in the same folder. The render is a quiet bordered two-pane card — no title bar, never a language tag, state is always JSON: the structure tree left and, when ",
  ),
  code("example"),
  t(" parses as JSON, a line-numbered example pane right."),
]);
li("b-25-state-shape-dr-tree", [t("Tree pane")], [
  "b-25-state-shape-dr-tree-1",
  "b-25-state-shape-dr-tree-2",
  "b-25-state-shape-dr-tree-3",
]);
li("b-25-state-shape-dr-tree-1", [
  t("An optional header row: bold mono shape name, muted "),
  code("basename#symbol"),
  t(" source ref (full path in its "),
  code("title"),
  t(" attribute), description beneath."),
]);
li("b-25-state-shape-dr-tree-2", [
  t("Top-level fields render as hairline-divided groups: bold mono name, mono type, a muted "),
  code("?"),
  t(" marking "),
  code("required: false"),
  t(", description as a smaller second line."),
]);
li("b-25-state-shape-dr-tree-3", [
  t("Nested fields sit behind a light left rule — one step per depth — with no dividers of their own."),
]);
li("b-25-state-shape-dr-example", [t("Example pane")], [
  "b-25-state-shape-dr-example-1",
  "b-25-state-shape-dr-example-2",
]);
li("b-25-state-shape-dr-example-1", [
  t("The example pretty-prints through the shared "),
  code("printJsonLines"),
  t(" canon: line numbers, zebra stripes."),
]);
li("b-25-state-shape-dr-example-2", [
  t(
    "JSON token toning is deterministic — a tiny line tokenizer over the canonical print, no highlight.js.",
  ),
]);
li("b-25-state-shape-dr-link", [t("Cross-linking")], [
  "b-25-state-shape-dr-link-1",
  "b-25-state-shape-dr-link-2",
  "b-25-state-shape-dr-link-3",
]);
li("b-25-state-shape-dr-link-1", [
  t(
    "Field rows and example lines link by field dot-path; array indices normalize away, so a field matches its path at every array position.",
  ),
]);
li("b-25-state-shape-dr-link-2", [
  t(
    "Hover or pin paints the field's full extent in both panes; activating an ancestor lights its whole brace-to-brace range.",
  ),
]);
li("b-25-state-shape-dr-link-3", [
  t("Without an example the card is the single-pane tree — nothing linkable."),
]);
li("b-25-state-shape-dr-strict", [t("Props read")], [
  "b-25-state-shape-dr-strict-1",
  "b-25-state-shape-dr-strict-2",
]);
li("b-25-state-shape-dr-strict-1", [
  t("The descriptor reads "),
  code("fields"),
  t(" and "),
  code("source"),
  t(" strictly: any malformed entry renders the invalid-block placeholder."),
]);
li("b-25-state-shape-dr-strict-2", [
  code("example"),
  t(
    " is read tolerantly: present-but-invalid JSON falls back to the single-pane tree; schema validation reports it at authoring time.",
  ),
]);
blocks["b-25-state-shape-editor-13"].text = [
  t("In the editor the block is a ProseMirror atom leaf ("),
  code("docStateShape"),
  t(") rendered read-only through the shared "),
  code("AtomBlockView"),
  t(" — the same "),
  code("StateShapeBlock"),
  t(" output as the reader. No slash-menu entry; instances enter through agent ops or existing content."),
];

// ---- Agent Renderer -------------------------------------------------------
blocks["b-25-state-shape-agent-h-14"].text = [t("Agent Renderer")];
blocks["b-25-state-shape-proj-7"].text = [
  t("The "),
  docRef("Agent renderer", `${CONTRACT}/40-agent-renderer`),
  t(" contract element: a deterministic markdown projection in "),
  srcRef(
    "packages/docs-model/src/components/state-shape/agent-view.ts",
    "packages/docs-model/src/components/state-shape/agent-view.ts",
  ),
  t("."),
];
li("b-25-state-shape-ar-b1", [
  t("Header line: "),
  code("**<name>**"),
  t(", with "),
  code(" — <path>#<symbol>"),
  t(" appended when a source is present; without a name the source stands alone as "),
  code("— <path>"),
  t("."),
]);
li("b-25-state-shape-ar-b2", [
  t(
    "Then a bare fence, one line per field in the shared field-line grammar: two-space indent per nesting depth, ",
  ),
  code("<name><? when required: false>: <type>  # <description>"),
  t("."),
]);
li("b-25-state-shape-ar-b3", [
  t("When a valid "),
  code("example"),
  t(" is present, a blank line and a "),
  code("json"),
  t(" fence follow — pretty-printed through "),
  code("printJsonLines"),
  t("; the tolerant read drops a non-JSON example, so a malformed prop renders no fence rather than crashing."),
]);

// Compute the projection of the page's own live Example block through the
// real code, and pin the two fence bodies to it.
const exampleProps = blocks["b-25-state-shape-example-block"].props;
const exFields = readFields(exampleProps.fields);
const fenceBody = fieldLines(exFields).join("\n");
const jsonBody = printJsonLines(JSON.parse(exampleProps.example)).lines.join("\n");
const projected = stateShapeAgentView({
  id: "x",
  type: "state-shape",
  props: exampleProps,
  children: [],
} as any);
const expected =
  `**${exampleProps.name}**\n\n` +
  "```\n" + fenceBody + "\n```\n\n" +
  "```json\n" + jsonBody + "\n```";
if (projected !== expected) {
  throw new Error(`agent-view drift:\n--- projected ---\n${projected}\n--- composed ---\n${expected}`);
}
para("b-25-state-shape-ar-proj-p1", [
  t("Projected, the live Example above is the header line "),
  code("**TableTheme**"),
  t(" plus this field fence:"),
]);
blocks["b-25-state-shape-proj-example-8"].text = [t(fenceBody)];
para("b-25-state-shape-ar-proj-p2", [t("and this "), code("json"), t(" fence:")]);
blocks["b-25-state-shape-proj-example-json"].text = [t(jsonBody)];

// ---- Theme ----------------------------------------------------------------
blocks["b-25-state-shape-theming-heading"].text = [t("Theme")];
blocks["b-25-state-shape-theming-para"].text = [
  t("The "),
  docRef("Theming", `${CONTRACT}/50-theming`),
  t(" contract element: theme file "),
  code("components/state-shape.json"),
  t(" in a theme folder ("),
  code("themes/<id>/"),
  t("; system docs at "),
  docRef("Theming: overview", "20-implementation/40-theming"),
  t("). Every value is one string for both modes or a "),
  code("{ light, dark }"),
  t(" pair, validated against the "),
  code("state-shape"),
  t(" entry of "),
  code("THEME_TOKEN_REGISTRY"),
  t(" in "),
  srcRef(
    "packages/docs-workbench/web/src/theme/theme-folders.ts",
    "packages/docs-workbench/web/src/theme/theme-folders.ts",
  ),
  t(". Ten tokens — nine colors and one length:"),
];
blocks["b-25-state-shape-theming-table"].props.rows = [
  ["border", "--docs-shape-border", "Card border"],
  ["bg", "--docs-shape-bg", "Card background"],
  ["name", "--docs-shape-name", "Shape name in the header row"],
  ["type", "--docs-shape-type", "Field type text"],
  ["muted", "--docs-shape-muted", "Muted detail text — optionality markers and the source ref"],
  ["rule", "--docs-shape-rule", "Hairlines: header underline, top-level row dividers, pane split"],
  ["headerBg", "--docs-shape-header-bg", "Header row background"],
  ["descFg", "--docs-shape-desc-fg", "Description text — header and field rows"],
  ["childRule", "--docs-shape-child-rule", "Left rule containing nested fields"],
  ["rowPad", "--docs-shape-row-pad", "Top-level row vertical padding; length slider, 4–16 px, default 9 px"],
];
// b-25-state-shape-theming-linking kept as-is (verified against the linking
// registry entry: zebra/highlight/pin → --docs-zebra/--docs-link-bg/--docs-link-pin).

// ---- Agent Adapter --------------------------------------------------------
h2("b-25-state-shape-adapter-h", "Agent Adapter");
para("b-25-state-shape-adapter-p1", [
  t("The type uses the default adapter — no agent of its own; the contract is "),
  docRef("Agent adapter", `${CONTRACT}/60-agent-adapter`),
  t(". The four typed actions ride "),
  code("componentAction"),
  t(" ops in the seven-op doc vocabulary ("),
  srcRef("packages/docs-model/src/doc-ops.ts", "packages/docs-model/src/doc-ops.ts"),
  t(")."),
]);
li("b-25-state-shape-adapter-b1", [
  t("A "),
  code("componentAction"),
  t(" names the registry key ("),
  code('"state-shape.addField"'),
  t("), resolves the action, validates params, and runs "),
  code("apply()"),
  t(" against the target block."),
]);
li("b-25-state-shape-adapter-b2", [
  t("The returned props patch executes through the existing "),
  code("updateBlock"),
  t(
    " path — merge semantics are single-sourced, the block id is preserved, and the inverse is the usual ",
  ),
  code("updateBlock"),
  t(" inverse."),
]);
li("b-25-state-shape-adapter-b3", [
  t("Structural edits ride the generic ops — "),
  code("insertBlock"),
  t(", "),
  code("updateBlock"),
  t(", "),
  code("deleteBlock"),
  t(", "),
  code("moveBlock"),
  t(". "),
  code("splitBlock"),
  t(" and "),
  code("mergeBlocks"),
  t(" never apply: the type carries no text."),
]);

// ---- retire folded blocks -------------------------------------------------
for (const id of [
  "b-25-state-shape-state-note-5",
  "b-25-state-shape-actions-note-10",
  "b-25-state-shape-agent-1-15",
  "b-25-state-shape-agent-2-16",
]) {
  delete blocks[id];
}

// ---- root order -----------------------------------------------------------
root.children = [
  "b-25-state-shape-lead-2",
  "b-25-state-shape-lead-doctrine",
  "b-25-state-shape-example-heading",
  "b-25-state-shape-example-intro",
  "b-25-state-shape-example-block",
  "b-25-state-shape-state-h-3", // ## State Schema
  "b-25-state-shape-schema-intro",
  "b-25-state-shape-state-4",
  "b-25-state-shape-schema-b1",
  "b-25-state-shape-schema-b2",
  "b-25-state-shape-schema-b3",
  "b-25-state-shape-schema-b4",
  "b-25-state-shape-actions-h-9", // ## Typed Actions
  "b-25-state-shape-actions-intro",
  "b-25-state-shape-actions-b1",
  "b-25-state-shape-actions-b2",
  "b-25-state-shape-actions-b3",
  "b-25-state-shape-actions-b4",
  "b-25-state-shape-actions-b5",
  "b-25-state-shape-actions-11",
  "b-25-state-shape-renderers-heading", // ## Doc Renderer
  "b-25-state-shape-dr-intro",
  "b-25-state-shape-dr-tree",
  "b-25-state-shape-dr-example",
  "b-25-state-shape-dr-link",
  "b-25-state-shape-dr-strict",
  "b-25-state-shape-editor-13",
  "b-25-state-shape-agent-h-14", // ## Agent Renderer
  "b-25-state-shape-proj-7",
  "b-25-state-shape-ar-b1",
  "b-25-state-shape-ar-b2",
  "b-25-state-shape-ar-b3",
  "b-25-state-shape-ar-proj-p1",
  "b-25-state-shape-proj-example-8",
  "b-25-state-shape-ar-proj-p2",
  "b-25-state-shape-proj-example-json",
  "b-25-state-shape-theming-heading", // ## Theme
  "b-25-state-shape-theming-para",
  "b-25-state-shape-theming-table",
  "b-25-state-shape-theming-linking",
  "b-25-state-shape-adapter-h", // ## Agent Adapter
  "b-25-state-shape-adapter-p1",
  "b-25-state-shape-adapter-b1",
  "b-25-state-shape-adapter-b2",
  "b-25-state-shape-adapter-b3",
];

// ---- validate + canonical write ------------------------------------------
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
console.log("ok — state-shape family page conformed to the six-H2 contract skeleton, canonical");
