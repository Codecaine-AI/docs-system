/**
 * state-shape grows `example` (setExample; 4 actions, registry total 25) and
 * the doctrine shifts: the state-shape block carries shape AND example, the
 * code block is the source-evidence surface.
 * 1. 50-state-shape: dogfooded block gains an example prop (applied through
 *    the real setExample action) + an `example` field row; markdown-render
 *    grammar + example blocks regenerated from the live agent view; setExample
 *    joins the interaction-surface; linking theme paragraph; agent pairing
 *    note rewritten.
 * 2. Parent doc: doctrine quote drops the triptych; totals become
 *    17 typed actions / state-shape (4) (ACTION_REGISTRY total 25).
 * 3. 20-code-block: lead + agent note become source-evidence doctrine.
 * 4. 60-interaction-surface: lead + pairing agent note point at the
 *    shape-and-example state-shape block.
 * Markdown-render example blocks are computed from the live agent view, never
 * hand-written. Canonical bytes throughout.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  ACTION_REGISTRY,
  agentViewFor,
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
  type DocBlock,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const c = (text: string): DeltaSpan => ({ insert: text, attributes: { code: true } });
const ref = (text: string, path: string): DeltaSpan => ({
  insert: text,
  attributes: { reference: { kind: "doc", path } },
});

const VOCAB = "10-system-design/40-block-vocabulary";
const VOCAB_DIR = `docs/${VOCAB}`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function land(path: string, doc: unknown) {
  const result = validateDocDocument(doc);
  if (!result.ok) {
    fail(`${path} validation failed: ${JSON.stringify(result.issues, null, 2)}`);
  }
  writeFileSync(path, serializeDocDocument(result.document));
  console.log(`landed ${path}`);
}

/** Applies a typed action through the real registry entry; hard-fails on rejection. */
function applyAction(block: DocBlock, actionName: string, params: Record<string, unknown>) {
  const action = ACTION_REGISTRY.get(actionName);
  if (!action) fail(`action ${actionName} missing from ACTION_REGISTRY`);
  const result = action.apply(block, params as never);
  if (!result.ok) {
    fail(`${actionName} rejected: ${JSON.stringify(result.issues, null, 2)}`);
  }
  block.props = { ...block.props, ...result.props };
}

// ---------------------------------------------------------------------------
// Real projection output for the Markdown-render example blocks.
// ---------------------------------------------------------------------------

const renderExampleInstance = {
  title: "Latency by route",
  columns: [{ insert: "Route" }, { insert: "p95" }],
  rows: [[{ insert: "/docs" }, { insert: "120 ms" }]],
};

const shapeExampleBlock: DocBlock = {
  id: "tmp-shape",
  type: "state-shape",
  props: {
    name: "StructuredTableState",
    source: {
      path: "packages/docs-model/src/components/structured-table/state.ts",
      symbol: "StructuredTableState",
    },
    fields: [
      { name: "title", type: "string", required: false },
      {
        name: "columns",
        type: "TableCell[]",
        description: "Header cells",
        fields: [
          { name: "insert", type: "string" },
          { name: "attributes", type: "DeltaSpanAttributes", required: false },
        ],
      },
      { name: "rows", type: "TableCell[][]" },
    ],
  },
  children: [],
};
applyAction(shapeExampleBlock, "state-shape.setExample", {
  example: JSON.stringify(renderExampleInstance, null, 2),
});

const projected = agentViewFor("state-shape")(shapeExampleBlock, { listDepth: 0, listIndex: 0 });
if (typeof projected !== "string") fail("state-shape agent view returned no projection");
// No fence interior contains a blank line, so the projection splits cleanly
// into header / shape fence / json example fence.
const parts = projected.split("\n\n");
if (parts.length !== 3) fail(`expected header + 2 fences, got ${parts.length} parts:\n${projected}`);
const [header, shapeFence, jsonFence] = parts;
if (
  header !==
  "**StructuredTableState** — packages/docs-model/src/components/structured-table/state.ts#StructuredTableState"
) {
  fail(`unexpected state-shape header: ${header}`);
}
const shapeMatch = shapeFence.match(/^```\n([\s\S]+)\n```$/);
if (!shapeMatch) fail(`shape fence drifted:\n${shapeFence}`);
const shapeInterior = shapeMatch[1];
if (!shapeInterior.startsWith("title?: string\n")) fail(`shape interior drifted:\n${shapeInterior}`);
const jsonMatch = jsonFence.match(/^```json\n([\s\S]+)\n```$/);
if (!jsonMatch) fail(`json example fence drifted:\n${jsonFence}`);
const jsonInterior = jsonMatch[1];
if (!jsonInterior.startsWith('{\n  "title": "Latency by route",')) {
  fail(`json interior drifted:\n${jsonInterior}`);
}

// ---------------------------------------------------------------------------
// 1. 50-state-shape
// ---------------------------------------------------------------------------
{
  const path = `${VOCAB_DIR}/50-state-shape/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const root = doc.blocks[doc.root];

  // Lead: the block carries shape AND example; code is source evidence.
  doc.blocks["b-25-state-shape-lead-2"].text = [
    t("The object-shape block of the "),
    t("block vocabulary"),
    t(
      ", and the state carrier of its documentation doctrine: a state-shape shows what a structure's state looks like — a recursive field tree of name, type, optionality, and meaning — beside a linked JSON example instance of that shape. An ",
    ),
    ref("interaction-surface", `${VOCAB}/60-interaction-surface`),
    t(" lists the operations on that state; "),
    ref("code", `${VOCAB}/20-code-block`),
    t(" blocks carry annotated source evidence."),
  ];

  // State section: `example` field row + a real example applied via setExample.
  const stateBlock = doc.blocks["b-25-state-shape-state-4"];
  const fields = stateBlock.props.fields as { name: string }[];
  if (fields.some((field) => field.name === "example")) fail("example field row already present");
  fields.push({
    name: "example",
    type: "string",
    required: false,
    description: "JSON text of an example instance of this shape; renders as the linked example pane.",
  });
  const dogfoodExample = {
    name: "StateShapeState",
    source: {
      path: "packages/docs-model/src/components/state-shape/state.ts",
      symbol: "StateShapeState",
    },
    fields: [
      { name: "name", type: "string", required: false, description: "Bold header-line label." },
      {
        name: "source",
        type: "object",
        required: false,
        fields: [
          { name: "path", type: "string" },
          { name: "symbol", type: "string", required: false },
        ],
      },
    ],
  };
  applyAction(stateBlock as DocBlock, "state-shape.setExample", {
    example: JSON.stringify(dogfoodExample, null, 2),
  });

  // Markdown render: grammar covers the ```json example fence.
  doc.blocks["b-25-state-shape-proj-7"].text = [
    t("A "),
    c("**<name>**"),
    t(" bold line — "),
    c(" — <path>#<symbol>"),
    t(
      " suffixed when a source is present — then a bare fence, one field per line in document order: two-space indent per nesting depth, a ",
    ),
    c("?"),
    t(" suffix when "),
    c("required: false"),
    t(", "),
    c(": <type>"),
    t(" after the name, "),
    c("# <description>"),
    t(" at the end of the line. When an "),
    c("example"),
    t(" is present, a blank line and a "),
    c("```json"),
    t(" fence follow, holding the example pretty-printed through the shared "),
    c("printJsonLines"),
    t(" canon:"),
  ];
  doc.blocks["b-25-state-shape-proj-example-8"].text = [t(shapeInterior)];
  const JSON_EXAMPLE_ID = "b-25-state-shape-proj-example-json";
  if (doc.blocks[JSON_EXAMPLE_ID]) fail("json example block already present");
  doc.blocks[JSON_EXAMPLE_ID] = {
    id: JSON_EXAMPLE_ID,
    type: "code",
    props: { language: "json" },
    text: [t(jsonInterior)],
    children: [],
  };
  const projAnchor = root.children.indexOf("b-25-state-shape-proj-example-8");
  if (projAnchor < 0) fail("proj example anchor missing");
  root.children.splice(projAnchor + 1, 0, JSON_EXAMPLE_ID);

  // Typed actions: four actions; setExample sets or clears the example.
  doc.blocks["b-25-state-shape-actions-note-10"].text = [
    t("Four actions: three maintain the "),
    c("fields"),
    t(" tree, addressed by dot-path over sibling-unique field names — "),
    c('"operations.params"'),
    t(" names the "),
    c("params"),
    t(" field under "),
    c("operations"),
    t(", "),
    c('""'),
    t(" (or an omitted path) the root array. "),
    c("addField"),
    t(" rejects a duplicate sibling name; "),
    c("updateField"),
    t(" renames via "),
    c("patch.name"),
    t(", clears "),
    c("type"),
    t("/"),
    c("required"),
    t("/"),
    c("description"),
    t(" with "),
    c("null"),
    t(", and replaces the whole subtree via "),
    c("patch.fields"),
    t(" ("),
    c("null"),
    t(" removes it); "),
    c("removeField"),
    t(" takes the subtree with it. "),
    c("setExample"),
    t(" sets or clears the JSON example — "),
    c("example"),
    t(" must parse as JSON; "),
    c("null"),
    t(" clears it."),
  ];

  const surface = doc.blocks["b-25-state-shape-actions-11"];
  const ops = surface.props.operations as { name: string }[];
  if (ops.some((op) => op.name === "state-shape.setExample")) fail("setExample op already present");
  ops.push({
    name: "state-shape.setExample",
    description:
      "Set the JSON example instance rendered beside the field tree (example must parse as JSON; null clears it).",
    params: [
      {
        name: "example",
        type: "string | null",
        required: true,
        description: "JSON text of an example instance of this shape; null clears the example.",
      },
    ],
    returns: "props patch: { example }",
  });
  surface.props.title = "state-shape — actions";

  // Agent notes: the example lives in the block's own example pane now.
  doc.blocks["b-25-state-shape-agent-1-15"].text = [
    t("When documenting a system, lead with one of these carrying both the shape and a real example instance ("),
    c("setExample"),
    t("), then an "),
    ref("interaction-surface", `${VOCAB}/60-interaction-surface`),
    t(" for the operations: state first, then operations. A "),
    ref("code", `${VOCAB}/20-code-block`),
    t(
      " block below is only for material that is not an instance of the shape — a real source listing, for example.",
    ),
  ];

  // Theming: the shared linking component the example pane draws from.
  const LINKING_ID = "b-25-state-shape-theming-linking";
  if (doc.blocks[LINKING_ID]) fail("linking theming block already present");
  doc.blocks[LINKING_ID] = {
    id: LINKING_ID,
    type: "paragraph",
    props: {},
    text: [
      t("Example-pane and range-chip linking styles come from the shared linking theme component ("),
      c("components/linking.json"),
      t("), registered once for every linked panel: Zebra stripe ("),
      c("zebra"),
      t(" → "),
      c("--docs-zebra"),
      t("), Link highlight ("),
      c("highlight"),
      t(" → "),
      c("--docs-link-bg"),
      t("), Pin & rail ("),
      c("pin"),
      t(" → "),
      c("--docs-link-pin"),
      t(")."),
    ],
    children: [],
  };
  const themingAnchor = root.children.indexOf("b-25-state-shape-theming-table");
  if (themingAnchor < 0) fail("theming table anchor missing");
  root.children.splice(themingAnchor + 1, 0, LINKING_ID);

  land(path, doc);
}

// ---------------------------------------------------------------------------
// 2. Parent doc: doctrine quote + truthful action totals
// ---------------------------------------------------------------------------
{
  const path = `${VOCAB_DIR}/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));

  const quote = doc.blocks["b-00-vocab-overview-doctrine-5"];
  if (quote.type !== "quote") fail("doctrine block is not a quote");
  quote.text = [
    t(
      "A state-shape block carries the shape of state and an example instance side by side; an interaction-surface block lists the operations that change or query it; annotated code blocks hold the source evidence.",
    ),
  ];

  // Totals against the live registry.
  const expectedTotal = ACTION_REGISTRY.size;
  if (expectedTotal !== 25) fail(`ACTION_REGISTRY total is ${expectedTotal}, expected 25`);
  const stateShapeCount = [...ACTION_REGISTRY.values()].filter(
    (action) => action.blockType === "state-shape",
  ).length;
  if (stateShapeCount !== 4) fail(`state-shape action count is ${stateShapeCount}, expected 4`);
  const OLD_TOTALS =
    "Five bundles expose 16 typed actions — code (2), structured-table (5), file-tree (3), interaction-surface (3), state-shape (3) — canvas forwards 5 more";
  const NEW_TOTALS =
    "Five bundles expose 17 typed actions — code (2), structured-table (5), file-tree (3), interaction-surface (3), state-shape (4) — canvas forwards 5 more";
  const actions = doc.blocks["b-00-vocab-overview-actions-18"];
  let replaced = false;
  actions.text = actions.text.map((span: DeltaSpan) => {
    if (typeof span.insert !== "string" || !span.insert.includes(OLD_TOTALS)) return span;
    replaced = true;
    return { ...span, insert: span.insert.replace(OLD_TOTALS, NEW_TOTALS) };
  });
  if (!replaced) fail("typed-actions totals sentence not found");

  land(path, doc);
}

// ---------------------------------------------------------------------------
// 3. 20-code-block: source-evidence doctrine
// ---------------------------------------------------------------------------
{
  const path = `${VOCAB_DIR}/20-code-block/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));

  const lead = doc.blocks["b-14-code-lead-2"];
  const doctrineIndex = lead.text.findIndex(
    (span: DeltaSpan) =>
      typeof span.insert === "string" &&
      span.insert.includes("one third of its documentation doctrine"),
  );
  if (doctrineIndex < 0) fail("code-block lead doctrine span missing");
  const tail = lead.text[doctrineIndex + 2];
  if (typeof tail?.insert !== "string" || !tail.insert.startsWith(" block defines.")) {
    fail("code-block lead tail span drifted");
  }
  lead.text.splice(
    doctrineIndex,
    3,
    t(
      ", and the source-evidence surface of its documentation doctrine: the language-tagged block for real, annotated source listings. State examples live inside ",
    ),
    ref("state-shape", `${VOCAB}/50-state-shape`),
    t(" blocks; code carries the evidence. The source lives in the block's "),
  );

  doc.blocks["b-14-code-agent-2-16"].text = [
    t("The house style for documenting a system: a "),
    ref("state-shape", `${VOCAB}/50-state-shape`),
    t(" carrying both the shape and an example instance, then an "),
    ref("interaction-surface", `${VOCAB}/60-interaction-surface`),
    t(
      " for the operations. Code blocks enter as source evidence — annotated listings of the defining source, not state examples.",
    ),
  ];

  land(path, doc);
}

// ---------------------------------------------------------------------------
// 4. 60-interaction-surface: pair with the shape-and-example block
// ---------------------------------------------------------------------------
{
  const path = `${VOCAB_DIR}/60-interaction-surface/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));

  doc.blocks["b-22-interaction-surface-lead-2"].text = [
    t("The operation list of the "),
    t("block vocabulary"),
    t(", and the operations surface of its documentation doctrine: where a "),
    ref("state-shape", `${VOCAB}/50-state-shape`),
    t(
      " block carries a system's state — shape and example instance side by side — an interaction-surface lists the named operations by which that state is changed or queried; ",
    ),
    ref("code", `${VOCAB}/20-code-block`),
    t(" blocks carry the source evidence."),
  ];

  doc.blocks["b-22-interaction-surface-agent-1-16"].text = [
    t("When documenting a system, pair one of these with a "),
    ref("state-shape", `${VOCAB}/50-state-shape`),
    t(
      " block carrying both the shape and an example instance: state first, then the operations on it.",
    ),
  ];

  land(path, doc);
}

console.log("state-shape example + doctrine sweep complete");
