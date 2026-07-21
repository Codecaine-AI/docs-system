/**
 * state-shape lands in the block vocabulary (16 canonical types, 9 bundles):
 * 1. NEW reference page docs/10-system-design/40-block-vocabulary/50-state-shape/
 *    mirroring the 60-interaction-surface section pattern, with a dogfooded
 *    state-shape block describing StateShapeState itself.
 * 2. Parent doc: doctrine quote becomes the shape/example/operations triptych;
 *    every count made truthful to DOC_BLOCK_TYPES + ALL_COMPONENTS/ACTION_REGISTRY.
 * 3. 60-interaction-surface: the two State structured-tables collapse into one
 *    state-shape block; Markdown render / editor / agent notes updated for
 *    recursive Field[] params and their indented detail lines.
 * 4. 20-code-block: old "state as annotated JSON" doctrine sentences rewritten
 *    to the example-instance third of the triptych.
 * Markdown-render example fences are computed from the live agent views, never
 * hand-written. Canonical bytes throughout.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
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

function land(path: string, doc: unknown) {
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${path} validation failed:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeDocDocument(result.document));
  console.log(`landed ${path}`);
}

/** Runs a block through its component agent view and returns the fence interior. */
function fenceInterior(block: DocBlock): string {
  const projected = agentViewFor(block.type)(block, { listDepth: 0, listIndex: 0 });
  if (typeof projected !== "string") {
    console.error(`agent view returned no projection for ${block.type}`);
    process.exit(1);
  }
  const match = projected.match(/```\n([\s\S]*?)\n```/);
  if (!match) {
    console.error(`no fence in projection:\n${projected}`);
    process.exit(1);
  }
  return match[1];
}

// ---------------------------------------------------------------------------
// Real projection output for the two Markdown-render examples.
// ---------------------------------------------------------------------------

// state-shape example — the shape from the bundle's agent-view tests.
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
const shapeExample = fenceInterior(shapeExampleBlock);
const shapeHeader = (
  agentViewFor("state-shape")(shapeExampleBlock, { listDepth: 0, listIndex: 0 }) as string
).split("\n\n")[0];
if (
  shapeHeader !==
  "**StructuredTableState** — packages/docs-model/src/components/structured-table/state.ts#StructuredTableState"
) {
  console.error(`unexpected state-shape header: ${shapeHeader}`);
  process.exit(1);
}

// interaction-surface example — the existing page example plus a described
// param, so the new indented detail line shows in real output.
const surfaceExampleBlock: DocBlock = {
  id: "tmp-surface",
  type: "interaction-surface",
  props: {
    operations: [
      {
        name: "table.rowCount",
        kind: "query",
        returns: "number",
        description: "How many rows the table has",
      },
      {
        name: "table.addRow",
        description: "Insert a row",
        params: [
          {
            name: "cells",
            type: "string[]",
            required: true,
            description: "One markdown cell per column",
          },
          { name: "index", type: "number", required: false },
        ],
        returns: "props patch",
      },
    ],
  },
  children: [],
};
const surfaceExample = fenceInterior(surfaceExampleBlock);
if (!surfaceExample.includes("\n  cells: string[]  # One markdown cell per column")) {
  console.error(`surface example missing detail line:\n${surfaceExample}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. NEW page: 50-state-shape
// ---------------------------------------------------------------------------
{
  const blocks: Record<string, unknown> = {};
  const children: string[] = [];
  const add = (id: string, block: Record<string, unknown>) => {
    blocks[id] = { id, children: [], ...block };
    children.push(id);
  };

  add("b-25-state-shape-lead-2", {
    type: "paragraph",
    props: {},
    text: [
      t("The object-shape block of the "),
      t("block vocabulary"),
      t(
        ", and one third of its documentation doctrine: a state-shape shows what a structure's state looks like — a recursive field tree of name, type, optionality, and meaning. A ",
      ),
      ref("code", `${VOCAB}/20-code-block`),
      t(" block beneath it holds a real example instance, and an "),
      ref("interaction-surface", `${VOCAB}/60-interaction-surface`),
      t(" lists the operations on that state."),
    ],
  });

  add("b-25-state-shape-state-h-3", {
    type: "heading",
    props: { level: 2 },
    text: [t("State")],
  });

  add("b-25-state-shape-state-4", {
    type: "state-shape",
    props: {
      name: "StateShapeState",
      source: {
        path: "packages/docs-model/src/components/state-shape/state.ts",
        symbol: "StateShapeState",
      },
      fields: [
        {
          name: "name",
          type: "string",
          required: false,
          description: "Bold header-line label; usually the type name.",
        },
        {
          name: "description",
          type: "string",
          required: false,
          description: "Prose summary of the shape; not part of the markdown render.",
        },
        {
          name: "source",
          type: "object",
          required: false,
          description: "Defining source location; renders as an em-dash suffix on the header line.",
          fields: [
            { name: "path", type: "string", description: "Path of the defining source file." },
            {
              name: "symbol",
              type: "string",
              required: false,
              description: "Symbol within that file; renders as a #symbol suffix.",
            },
          ],
        },
        {
          name: "fields",
          type: "Field[]",
          description: "The recursive field tree, in document order.",
          fields: [
            {
              name: "name",
              type: "string",
              description: "Field name; unique among siblings — dot-path addressing depends on it.",
            },
            {
              name: "type",
              type: "string",
              required: false,
              description: "Type text, rendered after a colon.",
            },
            {
              name: "required",
              type: "boolean",
              required: false,
              description: "false = optional and renders a ? suffix; omitted or true reads as required.",
            },
            {
              name: "description",
              type: "string",
              required: false,
              description: "One-liner rendered as a # suffix.",
            },
            {
              name: "fields",
              type: "Field[]",
              required: false,
              description: "Child fields, rendered two spaces deeper; the node recurses.",
            },
          ],
        },
      ],
    },
  });

  add("b-25-state-shape-state-note-5", {
    type: "paragraph",
    props: {},
    text: [t("No text ("), c("carriesText: false"), t(").")],
  });

  add("b-25-state-shape-proj-h-6", {
    type: "heading",
    props: { level: 2 },
    text: [t("Markdown render")],
  });

  add("b-25-state-shape-proj-7", {
    type: "paragraph",
    props: {},
    text: [
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
      t(" at the end of the line:"),
    ],
  });

  add("b-25-state-shape-proj-example-8", {
    type: "code",
    props: {},
    text: [t(shapeExample)],
  });

  add("b-25-state-shape-actions-h-9", {
    type: "heading",
    props: { level: 2 },
    text: [t("Typed actions")],
  });

  add("b-25-state-shape-actions-note-10", {
    type: "paragraph",
    props: {},
    text: [
      t("Three actions maintain the "),
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
      t(" takes the subtree with it."),
    ],
  });

  add("b-25-state-shape-actions-11", {
    type: "interaction-surface",
    props: {
      title: "state-shape — field actions",
      operations: [
        {
          name: "state-shape.addField",
          description:
            "Insert a field ({ name, type?, required?, description?, fields? }) under the parent named by path; index defaults to the end.",
          params: [
            {
              name: "field",
              type: "Field",
              required: true,
              description: "The field to insert.",
              fields: [
                { name: "name", type: "string" },
                { name: "type", type: "string", required: false },
                {
                  name: "required",
                  type: "boolean",
                  required: false,
                  description: "false = optional",
                },
                { name: "description", type: "string", required: false },
                {
                  name: "fields",
                  type: "Field[]",
                  required: false,
                  description: "Nested children — the node recurses",
                },
              ],
            },
            {
              name: "path",
              type: "string",
              required: false,
              description: 'Dot-path of the PARENT field; "" or omitted inserts into the root fields array.',
            },
            {
              name: "index",
              type: "integer",
              required: false,
              description: "Insert position among the parent's fields; default end.",
            },
          ],
          returns: "props patch: { fields }",
        },
        {
          name: "state-shape.updateField",
          description:
            "Patch the field at path (rename via patch.name; null clears type/required/description; patch.fields replaces the subtree, null removes it).",
          params: [
            {
              name: "path",
              type: "string",
              required: true,
              description: 'Dot-path of the field to patch, e.g. "operations.params".',
            },
            {
              name: "patch",
              type: "object",
              required: true,
              description: "Partial field; patch.name renames, null clears.",
              fields: [
                {
                  name: "name",
                  type: "string",
                  required: false,
                  description: "Rename; must stay unique among siblings.",
                },
                { name: "type", type: "string | null", required: false },
                { name: "required", type: "boolean | null", required: false },
                { name: "description", type: "string | null", required: false },
                {
                  name: "fields",
                  type: "Field[] | null",
                  required: false,
                  description: "Replaces the subtree; null removes it.",
                },
              ],
            },
          ],
          returns: "props patch: { fields }",
        },
        {
          name: "state-shape.removeField",
          description: "Remove the field at path, together with its entire subtree.",
          params: [
            {
              name: "path",
              type: "string",
              required: true,
              description: 'Dot-path of the field to remove, e.g. "operations.params".',
            },
          ],
          returns: "props patch: { fields }",
        },
      ],
    },
  });

  add("b-25-state-shape-editor-h-12", {
    type: "heading",
    props: { level: 2 },
    text: [t("In the editor")],
  });

  add("b-25-state-shape-editor-13", {
    type: "paragraph",
    props: {},
    text: [
      t("A non-editable atom leaf node rendered by "),
      c("StateShapeDocsBlock"),
      t(". No slash-menu entry today — shapes enter through agent ops or existing content."),
    ],
  });

  add("b-25-state-shape-agent-h-14", {
    type: "heading",
    props: { level: 2 },
    text: [t("Agent notes")],
  });

  add("b-25-state-shape-agent-1-15", {
    type: "list-item",
    props: {},
    text: [
      t("When documenting a system, lead with one of these, follow with a "),
      ref("code", `${VOCAB}/20-code-block`),
      t(" block holding a real example instance, then an "),
      ref("interaction-surface", `${VOCAB}/60-interaction-surface`),
      t(" for the operations: shape, example, operations."),
    ],
  });

  add("b-25-state-shape-agent-2-16", {
    type: "list-item",
    props: {},
    text: [
      t("Field order is document order — "),
      c("addField"),
      t(" appends by default and inserts at "),
      c("index"),
      t(" when given, so curated ordering survives edits."),
    ],
  });

  add("b-25-state-shape-theming-heading", {
    type: "heading",
    props: { level: 2 },
    text: [t("Theming")],
  });

  add("b-25-state-shape-theming-para", {
    type: "paragraph",
    props: {},
    text: [
      t("This block's theme file is "),
      c("components/state-shape.json"),
      t(" in a theme folder ("),
      c("themes/<id>/"),
      t("; see 20-implementation/40-theming). Every value is one string for both modes or a "),
      c("{ light, dark }"),
      t(" pair, validated against "),
      c("THEME_TOKEN_REGISTRY"),
      t("."),
    ],
  });

  add("b-25-state-shape-theming-table", {
    type: "structured-table",
    props: {
      columns: ["Key", "CSS variable", "Styles"],
      rows: [
        ["border", "--docs-shape-border", "Container border"],
        ["bg", "--docs-shape-bg", "Container background"],
        ["name", "--docs-shape-name", "Shape name in the header line"],
        ["type", "--docs-shape-type", "Field type text"],
        ["muted", "--docs-shape-muted", "Muted detail text — optionality markers and descriptions"],
        ["rule", "--docs-shape-rule", "Rule between the header line and the field tree"],
      ],
    },
  });

  blocks["b-25-state-shape-root"] = {
    id: "b-25-state-shape-root",
    type: "paragraph",
    props: {},
    children,
  };
  land(`${VOCAB_DIR}/50-state-shape/doc.json`, {
    schemaVersion: 1,
    id: "10-system-design-10-block-vocabulary-25-state-shape",
    title: "state-shape",
    root: "b-25-state-shape-root",
    blocks,
  });
}

// ---------------------------------------------------------------------------
// 2. Parent doc: doctrine triptych + truthful counts
// ---------------------------------------------------------------------------
{
  const path = `${VOCAB_DIR}/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));

  // Sixteen-types callout.
  const sixteen = doc.blocks["b-00-vocab-overview-fourteen-3"];
  sixteen.props.title = "Sixteen types and no more";
  sixteen.text = sixteen.text.map((span: DeltaSpan) =>
    typeof span.insert === "string" && span.insert.includes("exactly fourteen type strings")
      ? { ...span, insert: span.insert.replace("exactly fourteen type strings", "exactly sixteen type strings") }
      : span,
  );

  // Doctrine: two types -> three, quote becomes the triptych.
  doc.blocks["b-00-vocab-overview-doctrine-intro-4"].text = [
    t("For documenting agentic systems, three of those types carry the whole model:"),
  ];
  doc.blocks["b-00-vocab-overview-doctrine-5"].text = [
    t(
      "A state-shape block shows the shape of state; a code block holds an example instance; an interaction-surface block lists the operations that change or query it.",
    ),
  ];

  // Coercion callout: 14 -> 16 canonical types.
  const coercion = doc.blocks["b-00-vocab-overview-coercion-7"];
  coercion.text = coercion.text.map((span: DeltaSpan) =>
    typeof span.insert === "string" && span.insert.includes("the 14 canonical types")
      ? { ...span, insert: span.insert.replace("the 14 canonical types", "the 16 canonical types") }
      : span,
  );

  // Groups heading + bundle inventory.
  doc.blocks["b-00-vocab-overview-groups-h-8"].text = [t("Three groups, nine components")];
  doc.blocks["b-00-vocab-overview-groups-model-9"].text = [
    t("The model has no runtime category constant — the grouping lives in two places. First, "),
    c("DOC_BLOCK_TYPES"),
    t(" declares the sixteen types in three commented groups: "),
    { insert: "core text & structure", attributes: { italic: true } },
    t(" (paragraph, heading, list-item, quote, code, callout, divider), "),
    { insert: "structured / engineering", attributes: { italic: true } },
    t(" (structured-table, file-tree, interaction-surface, state-shape), and "),
    { insert: "diagram & media", attributes: { italic: true } },
    t(" (mermaid, canvas, sequence, image, video). Second, nine component bundles in "),
    c("components/<name>/"),
    t(
      " own the sixteen types exactly once: rich-text owns the eight text-flow types (including image and video), while code, mermaid, file-tree, structured-table, interaction-surface, state-shape, canvas, and sequence each own their namesake.",
    ),
  ];

  // Reader-facing page grouping.
  const pages = doc.blocks["b-00-vocab-overview-groups-pages-10"];
  pages.text = pages.text.map((span: DeltaSpan) => {
    if (typeof span.insert !== "string") return span;
    let insert = span.insert;
    insert = insert.replace(
      "typed-props state carriers: the structured / engineering trio plus mermaid and canvas",
      "typed-props state carriers: the structured / engineering four plus mermaid, sequence, and canvas",
    );
    insert = insert.replace("Same fourteen types", "Same sixteen types");
    return insert === span.insert ? span : { ...span, insert };
  });

  // Index heading + table rows.
  doc.blocks["b-00-vocab-overview-index-h-11"].text = [t("The 16 block types")];
  const table = doc.blocks["b-00-vocab-overview-index-12"];
  const rows: string[][] = table.props.rows;
  const isIndex = rows.findIndex((row) => row[0] === "interaction-surface");
  const canvasIndex = rows.findIndex((row) => row[0] === "canvas");
  if (isIndex < 0 || canvasIndex < 0) {
    console.error("index table anchors missing; aborting");
    process.exit(1);
  }
  rows.splice(isIndex + 1, 0, [
    "state-shape",
    "object",
    "state-shape",
    "Recursive field tree ({ name, type?, required?, description?, fields? }) describing the shape of a structure's state; optional source link.",
  ]);
  const canvasAfter = rows.findIndex((row) => row[0] === "canvas");
  rows.splice(canvasAfter + 1, 0, [
    "sequence",
    "object",
    "sequence",
    "UML-style sequence diagram; props.src (or sequenceId) points at a SequenceDocument, optional props.title.",
  ]);

  // Object pages list: structured-table · file-tree · state-shape ·
  // interaction-surface · sequence · canvas (folder order 30..80).
  doc.blocks["b-00-vocab-overview-pages-object-15"].text = [
    { insert: "Object (20s):", attributes: { bold: true } },
    t(" "),
    ref("structured-table", `${VOCAB}/30-structured-table`),
    t(" · "),
    ref("file-tree", `${VOCAB}/40-file-tree`),
    t(" · "),
    ref("state-shape", `${VOCAB}/50-state-shape`),
    t(" · "),
    ref("interaction-surface", `${VOCAB}/60-interaction-surface`),
    t(" · "),
    ref("sequence", `${VOCAB}/70-sequence`),
    t(" · "),
    ref("canvas", `${VOCAB}/80-canvas`),
  ];

  // Typed-actions totals: 5 bundles / 16 native actions + canvas 5 + sequence 3.
  const actions = doc.blocks["b-00-vocab-overview-actions-18"];
  actions.text = actions.text.map((span: DeltaSpan) =>
    typeof span.insert === "string" &&
    span.insert.includes("Four bundles expose 13 typed actions")
      ? {
          ...span,
          insert: span.insert.replace(
            "Four bundles expose 13 typed actions — code (2), structured-table (5), file-tree (3), interaction-surface (3) — and canvas forwards 5 more to the external canvas authority.",
            "Five bundles expose 16 typed actions — code (2), structured-table (5), file-tree (3), interaction-surface (3), state-shape (3) — canvas forwards 5 more to the external canvas authority, and sequence forwards 3 to the sequence engine.",
          ),
        }
      : span,
  );

  land(path, doc);
}

// ---------------------------------------------------------------------------
// 3. 60-interaction-surface: state-shape dogfood + recursive params
// ---------------------------------------------------------------------------
{
  const path = `${VOCAB_DIR}/60-interaction-surface/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const root = doc.blocks[doc.root];

  // Lead: one third of the triptych.
  doc.blocks["b-22-interaction-surface-lead-2"].text = [
    t("The operation list of the "),
    t("block vocabulary"),
    t(", and one third of its documentation doctrine: where a "),
    ref("state-shape", `${VOCAB}/50-state-shape`),
    t(" block shows the shape of a system's state and a "),
    ref("code", `${VOCAB}/20-code-block`),
    t(
      " block holds an example instance, an interaction-surface lists the named operations by which that state is changed or queried.",
    ),
  ];

  // State section: the two structured-tables collapse into one state-shape.
  const SHAPE_ID = "b-22-interaction-surface-shape-4";
  doc.blocks[SHAPE_ID] = {
    id: SHAPE_ID,
    type: "state-shape",
    props: {
      name: "InteractionSurfaceState",
      source: {
        path: "packages/docs-model/src/components/interaction-surface/state.ts",
        symbol: "InteractionSurfaceState",
      },
      fields: [
        {
          name: "title",
          type: "string",
          required: false,
          description: "Optional bold caption above the surface.",
        },
        {
          name: "operations",
          type: "Operation[]",
          description: "Operation signatures, in document order.",
          fields: [
            {
              name: "name",
              type: "string",
              description: 'Operation signature name, e.g. "file-tree.addEntry".',
            },
            {
              name: "description",
              type: "string",
              required: false,
              description: "One-liner rendered as a # suffix.",
            },
            {
              name: "params",
              type: "Field[]",
              required: false,
              description: "Recursive field nodes; required: false renders a ? suffix.",
              fields: [
                { name: "name", type: "string" },
                { name: "type", type: "string", required: false },
                {
                  name: "required",
                  type: "boolean",
                  required: false,
                  description: "false = optional",
                },
                { name: "description", type: "string", required: false },
                {
                  name: "fields",
                  type: "Field[]",
                  required: false,
                  description: "Nested params — the node recurses",
                },
              ],
            },
            {
              name: "returns",
              type: "string",
              required: false,
              description: "What the operation returns/yields.",
            },
            {
              name: "kind",
              type: '"action" | "query" | "event"',
              required: false,
              description: "Defaults to action; only query/event render a [kind] prefix.",
            },
          ],
        },
      ],
    },
    children: [],
  };
  const OLD_TABLES = ["b-22-interaction-surface-state-4", "b-22-interaction-surface-op-state-5"];
  const anchor = root.children.indexOf(OLD_TABLES[0]);
  if (anchor < 0) {
    console.error("interaction-surface state anchor missing; aborting");
    process.exit(1);
  }
  root.children = root.children.flatMap((id: string) =>
    id === OLD_TABLES[0] ? [SHAPE_ID] : OLD_TABLES.includes(id) ? [] : [id],
  );
  for (const id of OLD_TABLES) delete doc.blocks[id];

  // Markdown render: describe the indented param detail lines.
  doc.blocks["b-22-interaction-surface-proj-8"].text = [
    t("An optional "),
    c("**<title>**"),
    t(
      " bold line, then a bare fence with one signature line per operation, in document order. A param carrying a description or nested fields adds indented detail lines beneath its signature — two-space indent per depth, ",
    ),
    c("<name><?>: <type>  # <description>"),
    t(":"),
  ];
  doc.blocks["b-22-interaction-surface-proj-example-9"].text = [t(surfaceExample)];

  // Editor: multi-line render, params always visible.
  doc.blocks["b-22-interaction-surface-editor-14"].text = [
    t("A non-editable atom leaf node rendered by "),
    c("InteractionSurfaceDocsBlock"),
    t(
      ": one multi-line entry per operation, params always visible. No slash-menu entry today — surfaces enter through agent ops or existing content.",
    ),
  ];

  // Agent note: pair with state-shape (shape) + code (example).
  doc.blocks["b-22-interaction-surface-agent-1-16"].text = [
    t("When documenting a system, pair one of these with a "),
    ref("state-shape", `${VOCAB}/50-state-shape`),
    t(" block (the shape) and a "),
    ref("code", `${VOCAB}/20-code-block`),
    t(" block (an example instance): state first, then the operations on it."),
  ];

  land(path, doc);
}

// ---------------------------------------------------------------------------
// 4. 20-code-block: annotated-JSON doctrine -> example-instance third
// ---------------------------------------------------------------------------
{
  const path = `${VOCAB_DIR}/20-code-block/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));

  const lead = doc.blocks["b-14-code-lead-2"];
  const leadIndex = lead.text.findIndex(
    (span: DeltaSpan) =>
      typeof span.insert === "string" &&
      span.insert.includes("one half of its documentation doctrine"),
  );
  if (leadIndex < 0) {
    console.error("code-block lead doctrine span missing; aborting");
    process.exit(1);
  }
  lead.text.splice(
    leadIndex,
    1,
    t(
      ", and one third of its documentation doctrine: a real, annotated example instance of the state whose shape a ",
    ),
    ref("state-shape", `${VOCAB}/50-state-shape`),
    t(" block defines. The source lives in the block's "),
  );

  doc.blocks["b-14-code-agent-2-16"].text = [
    t("A "),
    ref("state-shape", `${VOCAB}/50-state-shape`),
    t(" + an annotated JSON example + an "),
    ref("interaction-surface", `${VOCAB}/60-interaction-surface`),
    t(
      " is the house style for documenting a system: the shape, an example instance, then the operations on it.",
    ),
  ];

  land(path, doc);
}

console.log("state-shape vocabulary authoring complete");
