/**
 * Rewrite the 40-block-vocabulary section overview per Ford's 2026-07-21
 * interview: two-renders opener, target-state vocabulary (15 types, 8
 * families, mermaid gone), doctrine quote kept, family index matching the
 * tree, "Page structure" section describing the six-H2 contract skeleton.
 * Drops: agent-audience lead, naming-history line, coercion callout,
 * three-groups/numbering-axis section, per-type reference-page order,
 * typed-actions paragraph, duplicate H1.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";

const PATH = "docs/10-system-design/40-block-vocabulary/doc.json";
const VOCAB = "10-system-design/40-block-vocabulary";

type Span = { insert: string; attributes?: Record<string, unknown> };
type Block = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  text?: Span[];
  children: string[];
};

const blocks: Record<string, Block> = {};
const rootChildren: string[] = [];

function add(block: Block, topLevel = true): string {
  blocks[block.id] = block;
  if (topLevel) rootChildren.push(block.id);
  return block.id;
}

function docRef(text: string, path: string): Span {
  return { insert: text, attributes: { reference: { kind: "doc", path } } };
}

function bold(text: string): Span {
  return { insert: text, attributes: { bold: true } };
}

// Opener — two-renders framing (Ford's pick).
add({
  id: "b-vocab-ov-opener",
  type: "paragraph",
  props: {},
  text: [
    {
      insert:
        "Every block type defines two forms of itself: a rich component in the workbench and a deterministic, greppable markdown form on the agent surface. The vocabulary is the set of fifteen types both renders speak, grouped into eight component families. These pages are the per-family reference.",
    },
  ],
  children: [],
});

// Decision callout — the vocabulary cap, pinned to target state.
add({
  id: "b-vocab-ov-cap",
  type: "callout",
  props: { kind: "Decision", title: "Fifteen types and no more", tone: "decision" },
  text: [
    { insert: "The source of truth is " },
    { insert: "DOC_BLOCK_TYPES", attributes: { code: true } },
    { insert: " in docs-model's " },
    {
      insert: "doc-schema.ts",
      attributes: {
        code: true,
        reference: { kind: "source", path: "packages/docs-model/src/doc-schema.ts" },
      },
    },
    {
      insert:
        ": exactly fifteen type strings. A small vocabulary keeps the render stable, the editor learnable, and the agent edit surface enumerable.",
    },
  ],
  children: [],
});

// Doctrine — kept per Ford.
add({
  id: "b-vocab-ov-doctrine-intro",
  type: "paragraph",
  props: {},
  text: [{ insert: "For documenting agentic systems, three of those types carry the whole model:" }],
  children: [],
});
add({
  id: "b-vocab-ov-doctrine",
  type: "quote",
  props: {},
  text: [
    {
      insert:
        "A state-shape block carries the shape of state and an example instance side by side; an interaction-surface block lists the operations that change or query it; annotated code blocks hold the source evidence.",
    },
  ],
  children: [],
});

// The fifteen types.
add({
  id: "b-vocab-ov-types-h",
  type: "heading",
  props: { level: 2 },
  text: [{ insert: "The fifteen types" }],
  children: [],
});
add({
  id: "b-vocab-ov-types-table",
  type: "structured-table",
  props: {
    columns: ["type", "family", "purpose"],
    rows: [
      ["paragraph", "rich-text", "Rich text prose (delta spans); the default block."],
      ["heading", "rich-text", "Section heading; props.level picks h1-h6 (default 2)."],
      ["list-item", "rich-text", "Bullet (or ordered) item; nesting via child list-item blocks."],
      ["quote", "rich-text", "A block quote of rich text."],
      [
        "callout",
        "rich-text",
        "Highlighted note; props.tone colors it, free-form props.kind labels the chip.",
      ],
      ["divider", "rich-text", "A horizontal rule separating sections."],
      ["image", "rich-text", "Image from the bundle's assets/images/; props: src, alt, caption."],
      [
        "video",
        "rich-text",
        "Bundle video (src) or external URL (url); YouTube/Vimeo/Loom embed privacy-friendly players.",
      ],
      [
        "code",
        "code",
        "Source code in text; props.language plus optional props.annotations side notes.",
      ],
      [
        "structured-table",
        "structured-table",
        "Typed table from props.columns (string[]) and props.rows (string[][]).",
      ],
      ["file-tree", "file-tree", "Rendered tree of props.entries: { path, note?, change?, from? }."],
      [
        "state-shape",
        "state-shape",
        "Recursive field tree ({ name, type?, required?, description?, fields? }) describing the shape of a structure's state; optional source link.",
      ],
      [
        "interaction-surface",
        "interaction-surface",
        "Operation signatures ({ name, description?, params?, returns?, kind? }) describing how a system is changed or queried.",
      ],
      [
        "sequence",
        "sequence",
        "UML-style sequence diagram; props.src (or sequenceId) points at a SequenceDocument, optional props.title.",
      ],
      [
        "canvas",
        "canvas",
        "Embedded interactive canvas; props.canvasId (or legacy src) plus an optional view crop.",
      ],
    ],
  },
  children: [],
});

// The families — index matching the tree.
add({
  id: "b-vocab-ov-fam-h",
  type: "heading",
  props: { level: 2 },
  text: [{ insert: "The families" }],
  children: [],
});

add(
  {
    id: "b-vocab-ov-fam-rich-types",
    type: "list-item",
    props: {},
    text: [
      { insert: "paragraph · heading · list-item · quote · callout · divider · image · video" },
    ],
    children: [],
  },
  false,
);
add({
  id: "b-vocab-ov-fam-rich",
  type: "list-item",
  props: {},
  text: [docRef("Rich text", `${VOCAB}/10-rich-text`)],
  children: ["b-vocab-ov-fam-rich-types"],
});

const singleFamilies: Array<[string, string, string]> = [
  ["b-vocab-ov-fam-code", "code", "20-code-block"],
  ["b-vocab-ov-fam-table", "structured-table", "30-structured-table"],
  ["b-vocab-ov-fam-tree", "file-tree", "40-file-tree"],
  ["b-vocab-ov-fam-state", "state-shape", "50-state-shape"],
  ["b-vocab-ov-fam-surface", "interaction-surface", "60-interaction-surface"],
  ["b-vocab-ov-fam-sequence", "sequence", "70-sequence"],
  ["b-vocab-ov-fam-canvas", "canvas", "80-canvas"],
];
for (const [id, title, dir] of singleFamilies) {
  add({
    id,
    type: "list-item",
    props: {},
    text: [docRef(title, `${VOCAB}/${dir}`)],
    children: [],
  });
}

// Page structure — the six-H2 contract skeleton, quickly.
add({
  id: "b-vocab-ov-skel-h",
  type: "heading",
  props: { level: 2 },
  text: [{ insert: "Page structure" }],
  children: [],
});
add({
  id: "b-vocab-ov-skel-intro",
  type: "paragraph",
  props: {},
  text: [
    {
      insert:
        "Every family page follows one skeleton; the deep story of how a component operates lives on the family's own page, not here.",
    },
  ],
  children: [],
});

add(
  {
    id: "b-vocab-ov-skel-opener-sub",
    type: "list-item",
    props: {},
    text: [{ insert: "What the family is and which types it owns." }],
    children: [],
  },
  false,
);
add({
  id: "b-vocab-ov-skel-opener",
  type: "list-item",
  props: {},
  text: [bold("Opener")],
  children: ["b-vocab-ov-skel-opener-sub"],
});

add(
  {
    id: "b-vocab-ov-skel-contract-sub1",
    type: "list-item",
    props: {},
    text: [
      { insert: "One H2 per element of the " },
      docRef("Block design", "10-system-design/30-data-model/20-block-design"),
      {
        insert:
          " contract: state schema, typed actions, doc renderer, agent renderer, theme, agent adapter.",
      },
    ],
    children: [],
  },
  false,
);
add(
  {
    id: "b-vocab-ov-skel-contract-sub2",
    type: "list-item",
    props: {},
    text: [{ insert: "Each section states how that element works for this family." }],
    children: [],
  },
  false,
);
add({
  id: "b-vocab-ov-skel-contract",
  type: "list-item",
  props: {},
  text: [bold("Six contract sections")],
  children: ["b-vocab-ov-skel-contract-sub1", "b-vocab-ov-skel-contract-sub2"],
});

add(
  {
    id: "b-vocab-ov-skel-depth-sub1",
    type: "list-item",
    props: {},
    text: [{ insert: "Inline when short; a subpage when deep." }],
    children: [],
  },
  false,
);
add(
  {
    id: "b-vocab-ov-skel-depth-sub2",
    type: "list-item",
    props: {},
    text: [{ insert: "Rich text keeps per-type reference pages as subpages." }],
    children: [],
  },
  false,
);
add({
  id: "b-vocab-ov-skel-depth",
  type: "list-item",
  props: {},
  text: [bold("Depth")],
  children: ["b-vocab-ov-skel-depth-sub1", "b-vocab-ov-skel-depth-sub2"],
});

const existing = JSON.parse(readFileSync(PATH, "utf8"));
const doc = {
  schemaVersion: existing.schemaVersion,
  id: existing.id,
  title: "Block vocabulary",
  root: "b-vocab-ov-root",
  blocks: {
    "b-vocab-ov-root": {
      id: "b-vocab-ov-root",
      type: "paragraph",
      props: {},
      children: rootChildren,
    },
    ...blocks,
  },
};

const result = validateDocDocument(doc);
if (!result.ok) {
  console.error(JSON.stringify(result.issues, null, 2));
  process.exit(1);
}
writeFileSync(PATH, serializeDocDocument(result.document));

// Idempotence check: bytes on disk must be canonical.
const bytes = readFileSync(PATH, "utf8");
const revalidated = validateDocDocument(JSON.parse(bytes));
if (!revalidated.ok || serializeDocDocument(revalidated.document) !== bytes) {
  console.error("NOT CANONICAL after write");
  process.exit(1);
}
console.log("ok — vocab overview rewritten, canonical");
