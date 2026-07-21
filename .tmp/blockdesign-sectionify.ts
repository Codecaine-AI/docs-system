/**
 * Ford's call (2026-07-21): 20-block-design becomes a SECTION with SIX
 * in-depth children — one per contract element — each grounded in real
 * component code (structured-table / file-tree excerpts). The overview's
 * contract bullets become the child index (parent links down), and a note
 * records the per-family instantiation pattern (each family defines how
 * every element works for it, in its block-vocabulary doc). Corpus 52→58.
 * Canonical bytes.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const b = (text: string): DeltaSpan => ({ insert: text, attributes: { bold: true } });
const c = (text: string): DeltaSpan => ({ insert: text, attributes: { code: true } });
const ref = (text: string, path: string): DeltaSpan => ({
  insert: text,
  attributes: { reference: { kind: "doc", path } },
});

const SEC = "docs/10-system-design/30-data-model/20-block-design";

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
function li(id: string, text: DeltaSpan[], children: string[] = []) {
  return { id, type: "list-item", props: {}, text, children };
}
type Def = [string, Record<string, unknown>];
function makeDoc(id: string, title: string, rootId: string, defs: Def[], subs: Array<[string, DeltaSpan[]]>) {
  const blocks: Record<string, unknown> = {};
  const children: string[] = [];
  for (const [bid, block] of defs) {
    blocks[bid] = { id: bid, children: (block.children as string[]) ?? [], ...block };
    children.push(bid);
  }
  for (const [bid, text] of subs) blocks[bid] = li(bid, text);
  blocks[rootId] = { id: rootId, type: "paragraph", props: {}, children };
  return { schemaVersion: 1, id, title, root: rootId, blocks };
}
const h2 = (text: string) => ({ type: "heading", props: { level: 2 }, text: [t(text)] });
const para = (spans: DeltaSpan[]) => ({ type: "paragraph", props: {}, text: spans });
const lead = (label: string, children: string[]) => ({
  type: "list-item",
  props: {},
  text: [b(label)],
  children,
});

// ------------------------------------------------------------ 10-state-schema
land(
  `${SEC}/10-state-schema/doc.json`,
  makeDoc("dm-block-design-10-state-schema", "State schema", "b-bds-root", [
    ["b-bds-intro-1", para([
      t("Every block type declares a closed schema over its "),
      c("props"),
      t(" — the type's whole state, and the only state it may hold. This page states what a schema owes and what a good one looks like."),
    ])],
    ["b-bds-laidout-h-2", h2("How it's laid out")],
    ["b-bds-code-3", {
      type: "code",
      props: {
        language: "typescript",
        annotations: [
          { lines: "14", label: "Closed", note: "Unknown keys are a validation error — a block cannot hold state its type did not declare." },
          { lines: "19", label: "Per-type fact", note: "carriesText declares whether the type uses the block's delta text field." },
        ],
      },
      text: [t('export const StructuredTableState = Type.Object(\n  {\n    title: Type.Optional(Type.String()),\n    columns: Type.Array(Type.String()),\n    rows: Type.Array(Type.Array(Type.String())),\n    density: Type.Optional(\n      Type.Union([\n        Type.Literal("compact"),\n        Type.Literal("normal"),\n        Type.Literal("relaxed"),\n      ]),\n    ),\n  },\n  { additionalProperties: false },\n);\n\nexport const structuredTableState: BlockStateDefinition = {\n  schema: StructuredTableState,\n  carriesText: false,\n};')],
    }],
    ["b-bds-rule-h-4", h2("The rule")],
    ["b-bds-closed-5", lead("Closed over props", ["b-bds-closed-s1"])],
    ["b-bds-additive-6", lead("Optional means additive", ["b-bds-additive-s1"])],
    ["b-bds-jobs-7", lead("One schema, three jobs", ["b-bds-jobs-s1", "b-bds-jobs-s2", "b-bds-jobs-s3"])],
    ["b-bds-why-h-8", h2("Why")],
    ["b-bds-why-door-9", lead("Corruption is refused at the door", ["b-bds-why-door-s1"])],
    ["b-bds-why-agents-10", lead("Agents read schemas, not code", ["b-bds-why-agents-s1"])],
  ], [
    ["b-bds-closed-s1", [c("additionalProperties: false"), t(" — wrong shapes and unknown keys are rejected at validation, not discovered at render.")]],
    ["b-bds-additive-s1", [t("New capabilities land as optional fields with safe defaults; documents written before the field existed keep validating unchanged.")]],
    ["b-bds-jobs-s1", [t("Validation — every load, save, and action patch checks against it.")]],
    ["b-bds-jobs-s2", [t("Discovery — "), c("GET /api/blocks"), t(" serves it verbatim as JSON Schema.")]],
    ["b-bds-jobs-s3", [t("Editing — the doc renderer trusts it: what validates is exactly what can render.")]],
    ["b-bds-why-door-s1", [t("Every write path converges on the same validator, so a malformed block can never reach disk.")]],
    ["b-bds-why-agents-s1", [t("An agent learns exactly what state is legal from discovery — no source archaeology, no guessing.")]],
  ]),
);

// ----------------------------------------------------------- 20-typed-actions
land(
  `${SEC}/20-typed-actions/doc.json`,
  makeDoc("dm-block-design-20-typed-actions", "Typed actions", "b-bda-root", [
    ["b-bda-intro-1", para([
      t("Every custom state change to a block is a typed action: data, not a method call. This page states the action shape and its obligations."),
    ])],
    ["b-bda-laidout-h-2", h2("How it's laid out")],
    ["b-bda-code-3", {
      type: "code",
      props: {
        language: "typescript",
        annotations: [
          { lines: "3", label: "The key", note: "<type>.<verb> — any surface can list and resolve actions without inspecting code." },
          { lines: "6-9", label: "Params are schema", note: "TypeBox, served verbatim by discovery and validated at apply time." },
          { lines: "10", label: "A patch, not a mutation", note: "apply returns a shallow-merge props patch — which is what makes the inverse, and undo, free." },
        ],
      },
      text: [t('// trimmed from packages/docs-model/src/components/file-tree/actions/add-entry.ts\nexport const addEntry = defineComponentAction({\n  action: "file-tree.addEntry",\n  blockType: "file-tree",\n  description: "Append a path entry to the file tree.",\n  params: Type.Object({\n    path: Type.String({ minLength: 1 }),\n    note: Type.Optional(Type.String()),\n  }),\n  apply: (block, params) => ({ entries: [...readFileTreeEntries(block), toEntry(params)] }),\n});')],
    }],
    ["b-bda-rule-h-4", h2("The rule")],
    ["b-bda-key-5", lead("Keyed and discoverable", ["b-bda-key-s1"])],
    ["b-bda-pure-6", lead("Apply is pure", ["b-bda-pure-s1", "b-bda-pure-s2"])],
    ["b-bda-only-7", lead("The only custom write path", ["b-bda-only-s1"])],
    ["b-bda-why-h-8", h2("Why")],
    ["b-bda-why-travel-9", lead("Data can travel", ["b-bda-why-travel-s1"])],
    ["b-bda-why-undo-10", lead("Undo is free", ["b-bda-why-undo-s1"])],
  ], [
    ["b-bda-key-s1", [t("The "), c("<type>.<verb>"), t(" key plus a params schema is the whole public surface; discovery lists both.")]],
    ["b-bda-pure-s1", [t("Block in, props patch out — no I/O, no side effects.")]],
    ["b-bda-pure-s2", [t("The patch validates against the state schema before anything persists.")]],
    ["b-bda-only-s1", [t("Beyond the generic ops, a block's state changes only through its actions — there is no third path.")]],
    ["b-bda-why-travel-s1", [t("An action invocation serializes: the editor, the CLI, an agent, and a test all speak the same shape.")]],
    ["b-bda-why-undo-s1", [t("A patch plus the prior props is an exact inverse; the "), ref("mutation model", "10-system-design/30-data-model/50-mutation-model"), t(" turns that into undo units.")]],
  ]),
);

// ------------------------------------------------------------ 30-doc-renderer
land(
  `${SEC}/30-doc-renderer/doc.json`,
  makeDoc("dm-block-design-30-doc-renderer", "Doc renderer", "b-bdd-root", [
    ["b-bdd-intro-1", para([
      t("Every type ships the component a human reads and edits. This page states what the doc renderer owes: schema state in, a rich, themable, defensive component out."),
    ])],
    ["b-bdd-laidout-h-2", h2("How it's laid out")],
    ["b-bdd-code-3", {
      type: "code",
      props: {
        language: "typescript",
        annotations: [
          { lines: "4-7", label: "Defensive by contract", note: "The renderer re-checks its data; anything malformed renders the invalid-block placeholder — never a crash, never a guess." },
        ],
      },
      text: [t('// trimmed from packages/docs-viewer/src/components/structured-table/descriptor.tsx\nfunction structuredTableData(block: DocBlock): StructuredTableData | null {\n  const { columns, rows } = block.props;\n  if (!Array.isArray(columns) || columns.length === 0) return null;\n  if (!columns.every((col): col is string => typeof col === "string")) return null;\n  if (!Array.isArray(rows)) return null;\n  // ...null means: render invalidBlockPlaceholder instead\n}')],
    }],
    ["b-bdd-rule-h-4", h2("The rule")],
    ["b-bdd-schema-5", lead("Schema state only", ["b-bdd-schema-s1"])],
    ["b-bdd-modes-6", lead("Read and edit", ["b-bdd-modes-s1", "b-bdd-modes-s2"])],
    ["b-bdd-tokens-7", lead("Themed through tokens", ["b-bdd-tokens-s1"])],
    ["b-bdd-why-h-8", h2("Why")],
    ["b-bdd-why-components-9", lead("The human surface is components, not text", ["b-bdd-why-components-s1"])],
    ["b-bdd-why-survives-10", lead("A bad block never takes the page down", ["b-bdd-why-survives-s1"])],
  ], [
    ["b-bdd-schema-s1", [t("Nothing renders that the state schema does not declare; the renderer adds no state of its own.")]],
    ["b-bdd-modes-s1", [t("A read rendering for every surface, and — where the type edits in place — a node view with the type's own interactions.")]],
    ["b-bdd-modes-s2", [t("Structural behavior (drag, select, delete) comes from the editor for free; the renderer supplies only what is specific to the type.")]],
    ["b-bdd-tokens-s1", [t("Looks come from the component's theme knobs, resolved per theme — see "), ref("theming", "10-system-design/30-data-model/20-block-design/50-theming"), t("."), ]],
    ["b-bdd-why-components-s1", [t("Rich rendering is the human half of the translation layer — the reason a table is a table and not a wall of pipes.")]],
    ["b-bdd-why-survives-s1", [t("Defensive rendering isolates damage to one placeholder block; the document around it stays readable and editable.")]],
  ]),
);

// ---------------------------------------------------------- 40-agent-renderer
land(
  `${SEC}/40-agent-renderer/doc.json`,
  makeDoc("dm-block-design-40-agent-renderer", "Agent renderer", "b-bdg-root", [
    ["b-bdg-intro-1", para([
      t("Every type ships the markdown view an agent reads: the same state, rendered to stable text. This page states the agent renderer's obligations."),
    ])],
    ["b-bdg-laidout-h-2", h2("How it's laid out")],
    ["b-bdg-code-3", {
      type: "code",
      props: {
        language: "typescript",
        annotations: [
          { lines: "2", label: "State in, string out", note: "A pure function of the block — no I/O, no surface knowledge." },
          { lines: "5", label: "Degrade, never throw", note: "Malformed props render best-effort text; the agent surface never crashes on a bad block." },
        ],
      },
      text: [t('// trimmed from packages/docs-model/src/components/structured-table/agent-view.ts\nfunction projectStructuredTable(block: DocBlock): string {\n  const columns = readStringArray(block.props.columns);\n  const rows = readRows(block.props.rows);\n  // emits a GitHub markdown table: header, separator, one line per row\n}')],
    }],
    ["b-bdg-rule-h-4", h2("The rule")],
    ["b-bdg-pure-5", lead("Pure and stable", ["b-bdg-pure-s1", "b-bdg-pure-s2"])],
    ["b-bdg-grep-6", lead("Greppable output", ["b-bdg-grep-s1"])],
    ["b-bdg-why-h-8", h2("Why")],
    ["b-bdg-why-contract-9", lead("The render is a contract", ["b-bdg-why-contract-s1"])],
    ["b-bdg-why-native-10", lead("Text is the agent's native medium", ["b-bdg-why-native-s1"])],
  ], [
    ["b-bdg-pure-s1", [t("Same block, same bytes — every type's render is pinned byte-for-byte by golden tests.")]],
    ["b-bdg-pure-s2", [t("Purity is what makes the pin possible: nothing environmental leaks into the output.")]],
    ["b-bdg-grep-s1", [t("Structure survives as plain text — headers, labels, and values an agent can find with "), c("docs grep"), t(", no parsing required.")]],
    ["b-bdg-why-contract-s1", [t("An agent scripts against the render; a golden diff — not a surprised agent — is where a change shows up first.")]],
    ["b-bdg-why-native-s1", [t("The agent half of the translation layer: the best representation for the reader, not a compromise shared with humans.")]],
  ]),
);

// ---------------------------------------------------------------- 50-theming
land(
  `${SEC}/50-theming/doc.json`,
  makeDoc("dm-block-design-50-theming", "Theming", "b-bdt-root", [
    ["b-bdt-intro-1", para([
      t("Every type ships its style capabilities as theme knobs — never hardcoded looks. This page states the component theme contract."),
    ])],
    ["b-bdt-laidout-h-2", h2("How it's laid out")],
    ["b-bdt-code-3", {
      type: "code",
      props: {
        language: "json",
        annotations: [
          { lines: "1-7", label: "Knobs, not CSS", note: "Each key is a typed knob (color, length, number) the style rail can edit live; the renderer consumes them as tokens." },
        ],
      },
      text: [t('// themes/default/components/structured-table.json\n{\n  "headerRuleWidth": "1.5px",\n  "cellPaddingY": "12px",\n  "rowRuleOpacity": "0.8",\n  "handleOffset": "16px",\n  "selectionPadding": "4px"\n}')],
    }],
    ["b-bdt-rule-h-4", h2("The rule")],
    ["b-bdt-file-5", lead("One theme file per type", ["b-bdt-file-s1"])],
    ["b-bdt-typed-6", lead("Knobs are typed", ["b-bdt-typed-s1"])],
    ["b-bdt-resolve-7", lead("Resolution is layered", ["b-bdt-resolve-s1", "b-bdt-resolve-s2"])],
    ["b-bdt-why-h-8", h2("Why")],
    ["b-bdt-why-state-9", lead("Looks are state, not code", ["b-bdt-why-state-s1"])],
    ["b-bdt-why-rail-10", lead("One rail edits every block", ["b-bdt-why-rail-s1"])],
  ], [
    ["b-bdt-file-s1", [t("The component declares its knobs and their defaults; a theme overrides values, never invents knobs.")]],
    ["b-bdt-typed-s1", [t("Color, length, and number kinds — so the style rail can render the right control for every knob without knowing the component.")]],
    ["b-bdt-resolve-s1", [t("A repo theme folder overrides the compiled-in defaults; the live theme auto-saves edits back into it.")]],
    ["b-bdt-resolve-s2", [t("The renderer consumes resolved tokens only — it cannot tell where a value came from.")]],
    ["b-bdt-why-state-s1", [t("Restyling a block type is a data change, reviewable and revertible like any other.")]],
    ["b-bdt-why-rail-s1", [t("Typed knobs make theming uniform: new block types get rail support the moment they ship a theme file.")]],
  ]),
);

// ------------------------------------------------------------ 60-agent-adapter
land(
  `${SEC}/60-agent-adapter/doc.json`,
  makeDoc("dm-block-design-60-agent-adapter", "Agent adapter", "b-bdaa-root", [
    ["b-bdaa-intro-1", para([
      t("How an agent edits a type when it processes an "),
      ref("annotation", "10-system-design/30-data-model/30-annotations"),
      t(". This is the contract's target-design element: the shape is settled, the wiring lands with annotate mode."),
    ])],
    ["b-bdaa-design-h-2", h2("The design")],
    ["b-bdaa-default-3", lead("Default: generic ops", ["b-bdaa-default-s1"])],
    ["b-bdaa-own-4", lead("Complex types bring their own agent", ["b-bdaa-own-s1", "b-bdaa-own-s2", "b-bdaa-own-s3"])],
    ["b-bdaa-disc-5", lead("Discovery advertises the adapter", ["b-bdaa-disc-s1"])],
    ["b-bdaa-direction-6", {
      type: "callout",
      props: { kind: "Direction", title: "Lands with annotate mode", tone: "warning" },
      text: [
        t("No adapter is implemented yet. The five other contract elements exist today; the adapter is the settled design for the execute step of the annotations lifecycle."),
      ],
    }],
    ["b-bdaa-why-h-7", h2("Why")],
    ["b-bdaa-why-knows-8", lead("Each type knows how it changes", ["b-bdaa-why-knows-s1"])],
    ["b-bdaa-why-queue-9", lead("One queue, many specialists", ["b-bdaa-why-queue-s1"])],
  ], [
    ["b-bdaa-default-s1", [t("Most types need nothing declared: the agent reads the doc render and edits through the generic ops and the type's actions.")]],
    ["b-bdaa-own-s1", [t("Canvas and sequence declare a processing agent of their own.")]],
    ["b-bdaa-own-s2", [t("A context loader assembles what that agent needs — the canvas file, the sequence source — instead of the doc render alone.")]],
    ["b-bdaa-own-s3", [t("Writeback goes through the type's own actions, so validation and undo hold no matter who edits.")]],
    ["b-bdaa-disc-s1", [t("The annotation router learns from the registry which agent handles which type — routing is data, not hardcoded knowledge.")]],
    ["b-bdaa-why-knows-s1", [t("Editing a sequence diagram and editing a paragraph are different crafts; the contract makes that a per-type declaration instead of a special case.")]],
    ["b-bdaa-why-queue-s1", [t("The annotations queue stays uniform while execution specializes — one lifecycle, per-type hands.")]],
  ]),
);

// ------------------------------------------------------------------ overview
{
  const path = `${SEC}/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const links: Array<[string, string, string]> = [
    ["b-bd-state-5", "State schema", "10-state-schema"],
    ["b-bd-actions-8", "Typed actions", "20-typed-actions"],
    ["b-bd-docrender-11", "Doc renderer", "30-doc-renderer"],
    ["b-bd-agentrender-13", "Agent renderer", "40-agent-renderer"],
    ["b-bd-theme-15", "Theming", "50-theming"],
    ["b-bd-adapter-32", "Agent adapter", "60-agent-adapter"],
  ];
  for (const [id, label, slug] of links) {
    const block = doc.blocks[id];
    if (!block) {
      console.error(`overview contract bullet missing: ${id}; aborting`);
      process.exit(1);
    }
    block.text = [ref(label, `10-system-design/30-data-model/20-block-design/${slug}`)];
  }
  // per-family instantiation note after the contract list
  doc.blocks["b-bd-perfamily-36"] = {
    id: "b-bd-perfamily-36",
    type: "paragraph",
    props: {},
    children: [],
    text: [
      t("The contract is generic; the instances are not. Each block family defines how every element works for it in its "),
      ref("block vocabulary", "10-system-design/40-block-vocabulary"),
      t(" doc — inline where short, subpages where a family needs depth."),
    ],
  };
  const root = doc.blocks[doc.root];
  const adapterAt = root.children.indexOf("b-bd-adapter-32");
  if (!root.children.includes("b-bd-perfamily-36")) root.children.splice(adapterAt + 1, 0, "b-bd-perfamily-36");
  land(path, doc);
}

console.log("block-design section complete");
