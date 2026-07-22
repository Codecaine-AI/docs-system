/**
 * Conform 40-block-vocabulary/60-interaction-surface to the six-H2 contract
 * skeleton (Ford's 2026-07-21 interview): lead, Example, then State Schema /
 * Typed Actions / Doc Renderer / Agent Renderer / Theme / Agent Adapter.
 * Deepen each section against the real code: the rebuilt linked-panels doc
 * renderer (InteractionSurfaceDocsBlock.tsx), the agent-view fence grammar,
 * the full --docs-interaction-* token set in theme-folders.ts, and the
 * default-adapter + componentAction story from doc-ops.ts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";

const PATH = "docs/10-system-design/40-block-vocabulary/60-interaction-surface/doc.json";

const doc = JSON.parse(readFileSync(PATH, "utf8"));
const blocks = doc.blocks as Record<string, any>;
const root = blocks[doc.root];

// ---- helpers --------------------------------------------------------------

const docRef = (text: string, path: string) => ({
  insert: text,
  attributes: { reference: { kind: "doc", path } },
});
const srcRef = (path: string) => {
  if (!existsSync(path)) throw new Error(`source path missing: ${path}`);
  return { insert: path, attributes: { code: true, reference: { kind: "source", path } } };
};
const code = (text: string) => ({ insert: text, attributes: { code: true } });
const t = (text: string) => ({ insert: text });

const para = (id: string, text: any[], children: string[] = []) => {
  blocks[id] = { id, type: "paragraph", props: {}, text, children };
};
const li = (id: string, text: any[], children: string[] = []) => {
  blocks[id] = { id, type: "list-item", props: {}, text, children };
};
const h2 = (id: string, text: string) => {
  blocks[id] = { id, type: "heading", props: { level: 2 }, text: [t(text)], children: [] };
};

// ---- lead -----------------------------------------------------------------

para("b-22-interaction-surface-lead-2", [
  t("The interaction-surface component owns one block type, "),
  code("interaction-surface"),
  t(": the operation list of the "),
  docRef("block vocabulary", "10-system-design/40-block-vocabulary"),
  t(". A surface lists the named operations by which a state or system is changed, queried, or observed — operation signatures on a state, not HTTP endpoints. When documenting agentic systems it is one of the three types that carry the whole model: a "),
  docRef("state-shape", "10-system-design/40-block-vocabulary/50-state-shape"),
  t(" block holds the state — shape and example instance side by side — the interaction-surface lists the operations on it, and "),
  docRef("code", "10-system-design/40-block-vocabulary/20-code-block"),
  t(" blocks hold the source evidence. State first, then operations."),
]);

// ---- Example --------------------------------------------------------------

para("b-22-interaction-surface-example-intro", [
  t("A live surface — two of the "),
  docRef("file-tree", "10-system-design/40-block-vocabulary/40-file-tree"),
  t(" block's entry operations. Each operation renders as its own card: signature left, description and param notes right; hovering a note lights the param's signature lines."),
]);

// ---- State Schema ---------------------------------------------------------

blocks["b-22-interaction-surface-state-h-3"].text = [t("State Schema")];

// Generalize render-specific field notes in the state-shape block.
{
  const shape = blocks["b-22-interaction-surface-shape-4"];
  const operations = shape.props.fields.find((f: any) => f.name === "operations");
  for (const field of operations.fields) {
    if (field.name === "description") field.description = "One-line description of what the operation does.";
    if (field.name === "params") field.description = "Shared recursive Field nodes; required: false means optional.";
    if (field.name === "kind") field.description = "Defaults to action; renders mark only query and event.";
  }
}

para("b-22-interaction-surface-state-note-6", [
  t("No text ("),
  code("carriesText: false"),
  t(") — every fact lives in the two props above. The schema is closed ("),
  code("additionalProperties: false"),
  t(" at every level); definitions live in "),
  srcRef("packages/docs-model/src/components/interaction-surface/state.ts"),
  t("."),
]);

li("b-22-is-fam-schema-params-li", [
  code("params"),
  t(" are the shared recursive "),
  code("Field"),
  t(" node — the same node state-shape fields use ("),
  srcRef("packages/docs-model/src/components/shared/field.ts"),
  t("): a name plus optional "),
  code("type"),
  t(", "),
  code("required"),
  t(", "),
  code("description"),
  t(", and nested "),
  code("fields"),
  t(". "),
  code("required: false"),
  t(" means optional; omitted or "),
  code("true"),
  t(" reads as required."),
]);
li("b-22-is-fam-schema-kind-li", [
  code("kind"),
  t(" is a closed vocabulary — "),
  code('"action" | "query" | "event"'),
  t(" — and omitted reads as action."),
]);
li("b-22-is-fam-schema-read-li", [
  t("Model-side reads are tolerant: "),
  code("readInteractionSurfaceOperations"),
  t(" skips malformed entries instead of failing the block, and always returns fresh objects."),
]);

// ---- Typed Actions --------------------------------------------------------

para("b-22-interaction-surface-actions-note-11", [
  t("Three actions maintain the "),
  code("operations"),
  t(" array — one file each in "),
  srcRef("packages/docs-model/src/components/interaction-surface/actions"),
  t(". The surface below documents itself."),
]);

li("b-22-is-fam-act-names-li", [
  t("Operation names are the identity keys: "),
  code("addOperation"),
  t(" refuses a name that already exists, and "),
  code("updateOperation"),
  t(" refuses a rename onto an existing name."),
]);
li("b-22-is-fam-act-params-li", [
  t("Action params are validated against the shared "),
  code("FieldSchema"),
  t(" and cloned to plain JSON with only the defined keys."),
]);
li("b-22-is-fam-act-order-li", [
  t("Operation order is document order — "),
  code("addOperation"),
  t(" appends and "),
  code("updateOperation"),
  t(" patches in place, so curated ordering survives edits."),
]);
li("b-22-is-fam-act-patch-li", [
  t("Every action returns a props patch of the full "),
  code("{ operations }"),
  t(" array."),
]);

// ---- Doc Renderer ---------------------------------------------------------

blocks["b-22-interaction-surface-proj-h-7"].text = [t("Doc Renderer")];

para("b-22-is-fam-docr-intro", [
  t("On the doc surface — reader and editor alike — the block renders through "),
  code("InteractionSurfaceBlock"),
  t(" in "),
  srcRef("packages/docs-viewer/src/components/interaction-surface/InteractionSurfaceDocsBlock.tsx"),
  t(", in the linked-panels family it shares with state-shape and code. The descriptor ("),
  srcRef("packages/docs-viewer/src/components/interaction-surface/descriptor.tsx"),
  t(") reads props strictly: any malformed operation renders the invalid-block placeholder instead of a partial card."),
]);

li("b-22-is-fam-docr-cards-li", [t("One card per operation.")], [
  "b-22-is-fam-docr-cards-1",
  "b-22-is-fam-docr-cards-2",
]);
li("b-22-is-fam-docr-cards-1", [
  t("An optional bold title caption sits above the stack; the block itself has no header bar."),
]);
li("b-22-is-fam-docr-cards-2", [
  t("Each card splits into a signature pane and a notes pane; when no operation carries a description or params, the block collapses to single-column signature cards."),
]);

li("b-22-is-fam-docr-header-li", [t("Operation header band.")], [
  "b-22-is-fam-docr-header-1",
  "b-22-is-fam-docr-header-2",
  "b-22-is-fam-docr-header-3",
]);
li("b-22-is-fam-docr-header-1", [
  t("The humanized name: "),
  code("addOperation"),
  t(' reads "Add Operation".'),
]);
li("b-22-is-fam-docr-header-2", [
  t("The component namespace is stripped when the bare verbs stay unique within the block; a collision falls back to full dotted names. The agent render keeps full names either way."),
]);
li("b-22-is-fam-docr-header-3", [
  code("query"),
  t(" and "),
  code("event"),
  t(" carry a kind badge beside the name; "),
  code("action"),
  t(" is the unbadged default."),
]);

li("b-22-is-fam-docr-sig-li", [t("Signature pane.")], [
  "b-22-is-fam-docr-sig-1",
  "b-22-is-fam-docr-sig-2",
  "b-22-is-fam-docr-sig-3",
]);
li("b-22-is-fam-docr-sig-1", [
  t("Line-numbered, zebra-striped code lines; numbering restarts at 1 per operation."),
]);
li("b-22-is-fam-docr-sig-2", [
  t("The grammar: a "),
  code("name("),
  t(" opening line, one "),
  code("param?: type,"),
  t(" line per param at two spaces per depth ("),
  code("?"),
  t(" marks "),
  code("required: false"),
  t("; an object param opens "),
  code("name: {"),
  t(" and closes "),
  code("},"),
  t("), then a closing "),
  code(") -> returns"),
  t(" line. Zero-param operations stay on one line."),
]);
li("b-22-is-fam-docr-sig-3", [
  t("Token tints are deterministic spans over this grammar — the operation name, param types, and the returns tail each carry their own token color; no highlight.js."),
]);

li("b-22-is-fam-docr-notes-li", [t("Notes pane.")], [
  "b-22-is-fam-docr-notes-1",
  "b-22-is-fam-docr-notes-2",
]);
li("b-22-is-fam-docr-notes-1", [
  t('The operation description under a "Description" band, then one note row per param: bold mono name, muted '),
  code("· type"),
  t(" sub-label, the description beneath where one exists."),
]);
li("b-22-is-fam-docr-notes-2", [
  t("An object param's nested notes group behind a light left rule, one step per depth."),
]);

li("b-22-is-fam-docr-link-li", [t("Linking.")], [
  "b-22-is-fam-docr-link-1",
  "b-22-is-fam-docr-link-2",
]);
li("b-22-is-fam-docr-link-1", [
  t("One link group per operation — line numbering is per-operation, so keys would collide across operations."),
]);
li("b-22-is-fam-docr-link-2", [
  t("Hovering or focusing a note lights the param's signature lines and vice versa; a click pins, Escape clears pins."),
]);

para("b-22-interaction-surface-editor-14", [
  t("In the editor the type is a non-editable atom leaf node ("),
  code("DocInteractionSurface"),
  t(", "),
  srcRef("packages/docs-viewer/src/components/interaction-surface/editor-nodes.ts"),
  t("); the node view calls the same descriptor render, so a surface looks identical in view and edit mode. No slash-menu entry — surfaces enter through agent ops or existing content."),
]);

// ---- Agent Renderer -------------------------------------------------------

h2("b-22-is-fam-agentr-h", "Agent Renderer");

para("b-22-interaction-surface-proj-8", [
  t("The markdown render ("),
  srcRef("packages/docs-model/src/components/interaction-surface/agent-view.ts"),
  t("): an optional "),
  code("**<title>**"),
  t(" bold line, then a bare fence with one signature line per operation, in document order."),
]);

li("b-22-is-fam-agentr-sig-li", [
  t("The signature line: "),
  code("[kind] name(param: type, optional?: type) -> returns  # description"),
  t(" — the "),
  code("[kind]"),
  t(" prefix only for query and event, the "),
  code("-> returns"),
  t(" and "),
  code("# description"),
  t(" tails only when present."),
]);
li("b-22-is-fam-agentr-detail-li", [
  t("A param carrying a description or nested fields adds indented detail lines beneath its signature, in the shared field-line grammar: two-space indent per depth, "),
  code("<name><?>: <type>  # <description>"),
  t("."),
]);
li("b-22-is-fam-agentr-names-li", [
  t("Operation names stay fully dotted — the greppable identity; only the doc renderer strips namespaces."),
]);

// ---- Theme ----------------------------------------------------------------

blocks["b-22-interaction-surface-theming-heading"].text = [t("Theme")];

para("b-22-interaction-surface-theming-para", [
  t("This block's theme file is "),
  code("components/interaction-surface.json"),
  t(" in a theme folder ("),
  code("themes/<id>/"),
  t("; see "),
  docRef("Theming", "20-implementation/40-theming"),
  t("). Every value is one string for both modes or a "),
  code("{ light, dark }"),
  t(" pair, validated against "),
  code("THEME_TOKEN_REGISTRY"),
  t(" ("),
  srcRef("packages/docs-workbench/web/src/theme/theme-folders.ts"),
  t(")."),
]);

blocks["b-22-interaction-surface-theming-table"].props = {
  columns: ["Key", "CSS variable", "Styles"],
  rows: [
    ["border", "--docs-interaction-border", "Card border"],
    ["bg", "--docs-interaction-bg", "Card background"],
    ["rule", "--docs-interaction-rule", "Internal hairlines: row dividers and the column rule"],
    ["headerBg", "--docs-interaction-header-bg", "Section header band background"],
    ["headerFg", "--docs-interaction-header-fg", "Section header band text"],
    ["sigName", "--docs-interaction-sig-name", "Operation name in the signature"],
    ["sigType", "--docs-interaction-sig-type", "Param types and the -> returns tail"],
    ["sigPunct", "--docs-interaction-sig-punct", "Signature punctuation and the ? marker"],
    ["noteName", "--docs-interaction-note-name", "Param note name"],
    ["noteType", "--docs-interaction-note-type", "Param note · type sub-label"],
    ["noteFg", "--docs-interaction-note-fg", "Note text"],
    ["childRule", "--docs-interaction-child-rule", "Left rule grouping an object param's nested notes"],
    ["rowPad", "--docs-interaction-row-pad", "Note row padding (length slider, 4–16px, default 8)"],
    ["opGap", "--docs-interaction-op-gap", "Gap between operation cards (length slider, 6–28px, default 14)"],
  ],
};

para("b-22-is-fam-theme-linking-p", [
  t("The zebra stripe, link wash, and pin accent come from the shared linking file ("),
  code("components/linking.json"),
  t(") — registered once for the linked-panels layer, not per component."),
]);

// ---- Agent Adapter --------------------------------------------------------

h2("b-22-is-fam-adapter-h", "Agent Adapter");

para("b-22-is-fam-adapter-p1", [
  t("The family uses the default adapter: no agent of its own, and nothing forwards to an external authority. The contract is "),
  docRef("Agent adapter", "10-system-design/30-data-model/20-block-design/60-agent-adapter"),
  t("."),
]);
para("b-22-is-fam-adapter-p2", [
  t("Edits arrive as generic doc ops. The three typed actions ride "),
  code("componentAction"),
  t(" — the seventh op beside "),
  code("insertBlock"),
  t(", "),
  code("updateBlock"),
  t(", "),
  code("deleteBlock"),
  t(", "),
  code("moveBlock"),
  t(", "),
  code("splitBlock"),
  t(", and "),
  code("mergeBlocks"),
  t(" (see the "),
  docRef("mutation model", "10-system-design/30-data-model/50-mutation-model"),
  t("). A "),
  code("componentAction"),
  t(" resolves the named action from the registry, validates its params, applies it to the target block, and lands the resulting "),
  code("{ operations }"),
  t(" patch through the "),
  code("updateBlock"),
  t(" code path — the block id is preserved and the inverse is the usual "),
  code("updateBlock"),
  t(" inverse ("),
  srcRef("packages/docs-model/src/doc-ops.ts"),
  t(")."),
]);

// ---- retire the old Agent Notes section -----------------------------------

delete blocks["b-22-interaction-surface-agent-h-15"];
delete blocks["b-22-interaction-surface-agent-1-16"];
delete blocks["b-22-interaction-surface-agent-2-17"];

// ---- root order -----------------------------------------------------------

root.children = [
  "b-22-interaction-surface-lead-2",
  "b-22-interaction-surface-example-h", // ## Example
  "b-22-interaction-surface-example-intro",
  "b-22-interaction-surface-example-block",
  "b-22-interaction-surface-state-h-3", // ## State Schema
  "b-22-interaction-surface-shape-4",
  "b-22-interaction-surface-state-note-6",
  "b-22-is-fam-schema-params-li",
  "b-22-is-fam-schema-kind-li",
  "b-22-is-fam-schema-read-li",
  "b-22-interaction-surface-actions-h-10", // ## Typed Actions
  "b-22-interaction-surface-actions-note-11",
  "b-22-interaction-surface-actions-12",
  "b-22-is-fam-act-names-li",
  "b-22-is-fam-act-params-li",
  "b-22-is-fam-act-order-li",
  "b-22-is-fam-act-patch-li",
  "b-22-interaction-surface-proj-h-7", // ## Doc Renderer
  "b-22-is-fam-docr-intro",
  "b-22-is-fam-docr-cards-li",
  "b-22-is-fam-docr-header-li",
  "b-22-is-fam-docr-sig-li",
  "b-22-is-fam-docr-notes-li",
  "b-22-is-fam-docr-link-li",
  "b-22-interaction-surface-editor-14",
  "b-22-is-fam-agentr-h", // ## Agent Renderer
  "b-22-interaction-surface-proj-8",
  "b-22-is-fam-agentr-sig-li",
  "b-22-is-fam-agentr-detail-li",
  "b-22-is-fam-agentr-names-li",
  "b-22-interaction-surface-proj-example-9",
  "b-22-interaction-surface-theming-heading", // ## Theme
  "b-22-interaction-surface-theming-para",
  "b-22-interaction-surface-theming-table",
  "b-22-is-fam-theme-linking-p",
  "b-22-is-fam-adapter-h", // ## Agent Adapter
  "b-22-is-fam-adapter-p1",
  "b-22-is-fam-adapter-p2",
];

// ---- validate + write -----------------------------------------------------

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
console.log("ok — interaction-surface family page conformed, canonical");
