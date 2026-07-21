/**
 * Ford's data-model reorder (2026-07-21): tree → BLOCK DESIGN → rich text.
 * - 20-block-design (was 30-block-state): FULL REWRITE as the block
 *   contract — state schema, typed actions, doc renderer, agent renderer,
 *   theme — laid out over one real component's files, plus the
 *   add-a-block-type path. Counts avoided (roster = block vocabulary).
 * - 30-rich-text: NARROWED to representation — label-less SpectreRef
 *   example, span-text display note, marks as bullets, carriers para
 *   de-counted (sequence, not mermaid), render-fallback claim updated,
 *   dup H1 + closing nav dropped.
 * - Overview index: reordered + relabeled ("Block design").
 * Canonical bytes.
 */
import { readFileSync, writeFileSync } from "node:fs";
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

const SEC = "docs/10-system-design/30-data-model";

function land(path: string, doc: unknown) {
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${path} validation failed:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  writeFileSync(path, serializeDocDocument(result.document));
  console.log(`landed ${path}`);
}
function li(id: string, text: DeltaSpan[], children: string[] = []) {
  return { id, type: "list-item", props: {}, text, children };
}

// ------------------------------------------------------------ 20-block-design
{
  const blocks: Record<string, unknown> = {};
  const children: string[] = [];
  const add = (id: string, block: Record<string, unknown>) => {
    blocks[id] = { id, children: (block.children as string[]) ?? [], ...block };
    children.push(id);
  };
  const sub = (id: string, text: DeltaSpan[]) => {
    blocks[id] = li(id, text);
  };

  add("b-bd-intro-1", {
    type: "paragraph",
    props: {},
    text: [
      t(
        "A block type is a component with a closed contract: it owns its state schema, its update logic, its renderer on each surface, and its theme. This page states that contract and the path for adding a new block type. What each type is for — with an example — is the ",
      ),
      ref("block vocabulary", "10-system-design/40-block-vocabulary"),
      t("'s story."),
    ],
  });
  add("b-bd-laidout-h-2", { type: "heading", props: { level: 2 }, text: [t("How it's laid out")] });
  add("b-bd-laidout-tree-3", {
    type: "file-tree",
    props: {
      title: "one component, every home (structured-table)",
      entries: [
        {
          path: "packages/docs-model/src/components/structured-table/state.ts",
          note: "the state schema — closed TypeBox props",
        },
        {
          path: "packages/docs-model/src/components/structured-table/actions/",
          note: "typed actions — the update logic, as data",
        },
        {
          path: "packages/docs-model/src/components/structured-table/agent-view.ts",
          note: "the agent renderer — state → markdown",
        },
        {
          path: "packages/docs-viewer/src/components/structured-table/descriptor.tsx",
          note: "the doc renderer — state → the editor component",
        },
        {
          path: "themes/default/components/structured-table.json",
          note: "the theme — the component's style knobs",
        },
      ],
    },
  });
  add("b-bd-contract-h-4", { type: "heading", props: { level: 2 }, text: [t("The contract")] });
  add("b-bd-state-5", {
    type: "list-item",
    props: {},
    text: [b("State schema")],
    children: ["b-bd-state-sub1-6", "b-bd-state-sub2-7"],
  });
  sub("b-bd-state-sub1-6", [
    t("A closed TypeBox schema over "),
    c("props"),
    t(" — unknown keys and wrong shapes are rejected at validation, not discovered at render."),
  ]);
  sub("b-bd-state-sub2-7", [
    t("The schema is the block's whole state; nothing renders that the schema does not declare."),
  ]);
  add("b-bd-actions-8", {
    type: "list-item",
    props: {},
    text: [b("Typed actions")],
    children: ["b-bd-actions-sub1-9", "b-bd-actions-sub2-10"],
  });
  sub("b-bd-actions-sub1-9", [
    t("The update logic: every state change is an action — data, not code calls — keyed "),
    c("<type>.<verb>"),
    t(" so any surface can list and invoke them."),
  ]);
  sub("b-bd-actions-sub2-10", [
    t("An action returns a props patch, which is what makes inverses — and undo — free."),
  ]);
  add("b-bd-docrender-11", {
    type: "list-item",
    props: {},
    text: [b("Doc renderer")],
    children: ["b-bd-docrender-sub1-12"],
  });
  sub("b-bd-docrender-sub1-12", [
    t(
      "The Notion-style component a human reads and edits — including the in-place editing node view where the type supports it.",
    ),
  ]);
  add("b-bd-agentrender-13", {
    type: "list-item",
    props: {},
    text: [b("Agent renderer")],
    children: ["b-bd-agentrender-sub1-14"],
  });
  sub("b-bd-agentrender-sub1-14", [
    t("The markdown view an agent reads — the same state rendered to stable, greppable text."),
  ]);
  add("b-bd-theme-15", {
    type: "list-item",
    props: {},
    text: [b("Theme")],
    children: ["b-bd-theme-sub1-16"],
  });
  sub("b-bd-theme-sub1-16", [
    t(
      "The component ships its style capabilities as theme knobs, resolvable per theme — never hardcoded looks.",
    ),
  ]);
  add("b-bd-adding-h-17", { type: "heading", props: { level: 2 }, text: [t("Adding a block type")] });
  add("b-bd-add-1-18", {
    type: "list-item",
    props: { ordered: true },
    text: [t("Define the state schema and its typed actions.")],
  });
  add("b-bd-add-2-19", {
    type: "list-item",
    props: { ordered: true },
    text: [t("Write the agent renderer: state to markdown.")],
  });
  add("b-bd-add-3-20", {
    type: "list-item",
    props: { ordered: true },
    text: [t("Write the doc renderer, with a node view when the block edits in place.")],
  });
  add("b-bd-add-4-21", {
    type: "list-item",
    props: { ordered: true },
    text: [t("Ship the component's theme file.")],
  });
  add("b-bd-add-5-22", {
    type: "list-item",
    props: { ordered: true },
    text: [
      t("Register the bundle; discovery ("),
      c("GET /api/blocks"),
      t(") serves the new type's schema and actions to every surface."),
    ],
  });
  add("b-bd-closed-23", {
    type: "paragraph",
    props: {},
    text: [
      t(
        "The set stays closed. Both surfaces know every block they will ever meet, and discovery exists so an agent learns the roster — schemas and actions included — without reading code.",
      ),
    ],
  });
  add("b-bd-why-h-24", { type: "heading", props: { level: 2 }, text: [t("Why")] });
  add("b-bd-why-component-25", {
    type: "list-item",
    props: {},
    text: [b("A block is a component, not a snippet")],
    children: ["b-bd-why-component-sub-26"],
  });
  sub("b-bd-why-component-sub-26", [
    t(
      "State, logic, renderers, and theme travel together; adding a type touches one bundle per home, not scattered files.",
    ),
  ]);
  add("b-bd-why-closed-27", {
    type: "list-item",
    props: {},
    text: [b("Closed schemas keep the tree safe")],
    children: ["b-bd-why-closed-sub-28"],
  });
  sub("b-bd-why-closed-sub-28", [
    t("A block cannot hold state its type did not declare; corruption is refused at the door."),
  ]);
  add("b-bd-why-two-29", {
    type: "list-item",
    props: {},
    text: [b("Two renderers by design")],
    children: ["b-bd-why-two-sub-30"],
  });
  sub("b-bd-why-two-sub-30", [
    t("Every type answers both readers from one state — the "),
    ref("translation layer", "10-system-design/20-translation-layer"),
    t("'s promise, kept per block."),
  ]);

  const rootId = "b-bd-root";
  blocks[rootId] = { id: rootId, type: "paragraph", props: {}, children };
  land(`${SEC}/20-block-design/doc.json`, {
    schemaVersion: 1,
    id: "10-system-design-30-data-model-20-block-design",
    title: "Block design",
    root: rootId,
    blocks,
  });
}

// --------------------------------------------------------------- 30-rich-text
{
  const path = `${SEC}/30-rich-text/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const root = doc.blocks[doc.root];
  doc.title = "Rich text";

  // marks paragraph -> three fact bullets
  const MARKS = ["b-rt-mark-bools-19", "b-rt-mark-strict-20", "b-rt-mark-canonical-21"];
  doc.blocks[MARKS[0]] = li(MARKS[0], [
    t("The boolean marks are "),
    c("bold"),
    t(", "),
    c("italic"),
    t(", "),
    c("strike"),
    t(", and "),
    c("code"),
    t("."),
  ]);
  doc.blocks[MARKS[1]] = li(MARKS[1], [
    t("A mark is the literal "),
    c("true"),
    t(" when present; "),
    c("false"),
    t(" is a validation error, not a no-op."),
  ]);
  doc.blocks[MARKS[2]] = li(MARKS[2], [
    t(
      "An attributes object left empty after validation is dropped — unmarked text has exactly one encoding.",
    ),
  ]);

  // label-less reference example + display-text note
  doc.blocks["b-20-rich-text-ref-example-9"].text = [
    t(
      '{\n  "kind": "source",\n  "path": "packages/docs-model/src/doc-schema.ts",\n  "symbol": "validateDocDocument",\n  "line": 194\n}',
    ),
  ];
  doc.blocks["b-rt-ref-display-22"] = {
    id: "b-rt-ref-display-22",
    type: "paragraph",
    props: {},
    children: [],
    text: [
      t(
        "The object carries no display text. A reference span's insert is the display — for a doc reference, the target's name. When and how to link is ",
      ),
      ref("cross-doc linking", "10-system-design/10-doc-standards/30-cross-doc-linking"),
      t("'s subject."),
    ],
  };

  // carriers intro: de-counted, target-state types
  doc.blocks["b-20-rich-text-carriers-intro-12"].text = [
    t("Whether a type carries delta text is a per-type fact, declared as "),
    c("carriesText"),
    t(
      " in the component state definitions. Text means prose only for the rich-text flow types; for ",
    ),
    c("code"),
    t(" and "),
    c("sequence"),
    t(" the delta text is the source payload, and marks are not meaningful there."),
  ];

  // carriers table: mermaid -> sequence (target state)
  const table = doc.blocks["b-20-rich-text-carriers-table-13"];
  table.props.rows = table.props.rows.map((row: string[]) =>
    row.map((cell) => cell.replace(/\bmermaid\b/g, "sequence")),
  );

  // bridges: render fallback claim updated to span-text-first
  const out = doc.blocks["b-20-rich-text-bridges-out-15"];
  out.text = [
    t("Outbound, spans render to inline markdown for the agent surface. A reference renders as its span text — the target's name — falling back to the reference path; no link syntax, because the render is a greppable terminal artifact."),
  ];

  const DROP = ["b-20-rich-text-title-1", "b-20-rich-text-divider-17", "b-20-rich-text-closing-18", "b-20-rich-text-marks-rules-5"];
  root.children = root.children.flatMap((id: string) => {
    if (DROP.includes(id)) return [];
    if (id === "b-20-rich-text-marks-4") return [id, ...MARKS];
    if (id === "b-20-rich-text-ref-neutral-home-10") return [id, "b-rt-ref-display-22"];
    return [id];
  });
  for (const id of DROP) delete doc.blocks[id];
  land(path, doc);
}

// ------------------------------------------------------------------- overview
{
  const path = `${SEC}/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const root = doc.blocks[doc.root];
  // relabel the block-design index bullet (path already rewritten by move)
  const stateIdx = doc.blocks["b-dm2-idx-state-6"];
  stateIdx.text = [ref("Block design", "10-system-design/30-data-model/20-block-design")];
  const stateGloss = doc.blocks["b-dm2-idx-state-6-gloss"];
  stateGloss.text = [
    t(
      "The block contract: every type owns its state schema, typed actions, doc renderer, agent renderer, and theme — and the path for adding a custom component.",
    ),
  ];
  // reorder: tree, block design, rich text
  const a = root.children.indexOf("b-dm2-idx-rich-5");
  const bIdx = root.children.indexOf("b-dm2-idx-state-6");
  if (a < 0 || bIdx < 0) {
    console.error("overview index bullets missing; aborting");
    process.exit(1);
  }
  [root.children[a], root.children[bIdx]] = [root.children[bIdx], root.children[a]];
  // reading-guide callout order mention
  const callout = doc.blocks["b-dm2-callout-11"];
  callout.text = [
    t(
      "Shapes first, then behavior. The five shape docs define what exists — document, block, span, comment, bytes. The mutation model defines every way it can change. Nothing else in the system writes state.",
    ),
  ];
  land(path, doc);
}

console.log("block-design + rich-text reorder complete");
