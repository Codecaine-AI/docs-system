/**
 * Reference-page-structure directive, two docs:
 * 1. docs/10-system-design/40-block-vocabulary/doc.json — adds the
 *    "Reference page structure" h2 section (after "The 16 block types")
 *    stating the canonical seven-slot type-page order.
 * 2. docs/10-system-design/40-block-vocabulary/10-rich-text/doc.json —
 *    restructures the family page to the canonical order adapted to a
 *    family page: lead + type roster, Example (live blocks), State
 *    (existing state/marks/links/SpectreRef/carriers content, subheads
 *    demoted to h3), Typed actions, Renderers (doc surface + markdown
 *    bridges), Agent notes, Theming. Existing content moves; new prose
 *    is limited to the Example blocks and mechanical stitching.
 * Canonical serializer bytes; idempotent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DocDocument,
  type DocBlock,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const b = (text: string): DeltaSpan => ({ insert: text, attributes: { bold: true } });
const c = (text: string): DeltaSpan => ({ insert: text, attributes: { code: true } });

function loadDoc(path: string): DocDocument {
  const doc = JSON.parse(readFileSync(path, "utf8")) as DocDocument;
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${path} failed input validation:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  return doc;
}

function saveDoc(path: string, doc: DocDocument): void {
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${path} failed output validation:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  writeFileSync(path, serializeDocDocument(doc));
  console.log(`wrote ${path} (${Object.keys(doc.blocks).length} blocks)`);
}

// ---------------------------------------------------------------------------
// 1. Parent: 40-block-vocabulary/doc.json — "Reference page structure"
// ---------------------------------------------------------------------------
{
  const path = "docs/10-system-design/40-block-vocabulary/doc.json";
  const doc = loadDoc(path);

  const add = (id: string, block: Omit<DocBlock, "id" | "children">): void => {
    doc.blocks[id] = { id, children: [], ...block } as DocBlock;
  };

  add("b-00-vocab-overview-refpage-h-19", {
    type: "heading",
    props: { level: 2 },
    text: [t("Reference page structure")],
  });
  add("b-00-vocab-overview-refpage-intro-20", {
    type: "paragraph",
    props: {},
    text: [t("Every type page follows one section order:")],
  });
  const slots: Array<[string, string, DeltaSpan[]]> = [
    ["lead", "Lead", [t(" — opening paragraphs, no heading: what the block is and its doctrine position.")]],
    ["example", "Example", [t(" — a live block of the documented type.")]],
    ["state", "State", [t(" — the state structure: shape, props, "), c("carriesText"), t(".")]],
    ["actions", "Typed actions", [t(" — the block's action verbs, or one line stating there are none.")]],
    [
      "renderers",
      "Renderers",
      [t(" — the doc renderer first, then the agent markdown projection with its example fence.")],
    ],
    ["agent", "Agent notes", [t(" — authoring guidance for agents.")]],
    ["theming", "Theming", [t(" — the type's theme surface.")]],
  ];
  const slotIds: string[] = [];
  let n = 20;
  for (const [slug, label, tail] of slots) {
    n += 1;
    const id = `b-00-vocab-overview-refpage-${slug}-${n}`;
    slotIds.push(id);
    add(id, { type: "list-item", props: {}, text: [b(label), ...tail] });
  }

  const root = doc.blocks[doc.root];
  const anchor = root.children.indexOf("b-00-vocab-overview-pages-media-16");
  if (anchor === -1) {
    console.error("anchor block b-00-vocab-overview-pages-media-16 not found in root children");
    process.exit(1);
  }
  const inserted = ["b-00-vocab-overview-refpage-h-19", "b-00-vocab-overview-refpage-intro-20", ...slotIds];
  root.children = [
    ...root.children.slice(0, anchor + 1).filter((id) => !inserted.includes(id)),
    ...inserted,
    ...root.children.slice(anchor + 1).filter((id) => !inserted.includes(id)),
  ];

  saveDoc(path, doc);
}

// ---------------------------------------------------------------------------
// 2. Family: 40-block-vocabulary/10-rich-text/doc.json — canonical order
// ---------------------------------------------------------------------------
{
  const path = "docs/10-system-design/40-block-vocabulary/10-rich-text/doc.json";
  const doc = loadDoc(path);

  const add = (id: string, block: Omit<DocBlock, "id" | "children"> & { children?: string[] }): void => {
    doc.blocks[id] = { id, children: [], ...block } as DocBlock;
  };
  const setHeading = (id: string, level: number, text?: string): void => {
    const block = doc.blocks[id];
    if (!block) {
      console.error(`missing heading block ${id}`);
      process.exit(1);
    }
    block.props = { ...block.props, level };
    if (text !== undefined) block.text = [t(text)];
  };

  // "The types" heading merges into the lead: the roster follows the lead
  // paragraph directly.
  delete doc.blocks["b-rich-text-overview-types-heading-3"];

  // State section keeps its heading block, renamed to the canonical slot.
  setHeading("b-rtfam-state-h-20", 2, "State");
  // Former h2 subtopics become h3 under State.
  setHeading("b-20-rich-text-marks-4", 3);
  setHeading("b-20-rich-text-links-6", 3);
  setHeading("b-20-rich-text-spectre-ref-8", 3);
  setHeading("b-20-rich-text-carriers-11", 3);
  // Markdown bridges becomes an h3 under Renderers.
  setHeading("b-20-rich-text-bridges-14", 3);

  // Example section: live instances of the family's core types.
  add("b-rtfam-example-h-23", { type: "heading", props: { level: 2 }, text: [t("Example")] });
  add("b-rtfam-example-intro-24", {
    type: "paragraph",
    props: {},
    text: [t("The blocks below are live instances of the family's core types, rendered the same way as any corpus content.")],
  });
  add("b-rtfam-ex-heading-25", { type: "heading", props: { level: 3 }, text: [t("A level-3 heading")] });
  add("b-rtfam-ex-paragraph-26", {
    type: "paragraph",
    props: {},
    text: [
      t("A paragraph carries "),
      b("bold"),
      t(", "),
      { insert: "italic", attributes: { italic: true } },
      t(", "),
      { insert: "strike", attributes: { strike: true } },
      t(", and "),
      c("code"),
      t(" marks, "),
      { insert: "an outbound link", attributes: { link: "https://example.com" } },
      t(", and a reference chip to "),
      {
        insert: "the block vocabulary",
        attributes: { reference: { kind: "doc", path: "10-system-design/40-block-vocabulary" } },
      },
      t("."),
    ],
  });
  add("b-rtfam-ex-list-27", {
    type: "list-item",
    props: {},
    text: [t("A list item; nesting runs through child list-item blocks.")],
    children: ["b-rtfam-ex-list-nested-28"],
  });
  add("b-rtfam-ex-list-nested-28", {
    type: "list-item",
    props: {},
    text: [t("A nested list item.")],
  });
  add("b-rtfam-ex-quote-29", {
    type: "quote",
    props: {},
    text: [t("A quote sets prose off from the surrounding flow in plain delta text.")],
  });
  add("b-rtfam-ex-callout-30", {
    type: "callout",
    props: { kind: "Example", tone: "info" },
    text: [t("A callout carries a kind chip, a tone, and rich text.")],
  });
  add("b-rtfam-ex-divider-31", { type: "divider", props: {} });

  // Typed actions: the family has none — state the fact.
  add("b-rtfam-actions-h-32", { type: "heading", props: { level: 2 }, text: [t("Typed actions")] });
  add("b-rtfam-actions-note-33", {
    type: "paragraph",
    props: {},
    text: [
      t("The rich-text types expose no typed actions — they edit through the generic op kernel (block ops plus delta text edits), not "),
      c("componentAction"),
      t(" verbs."),
    ],
  });

  // Renderers: doc surface first, then the markdown bridges.
  add("b-rtfam-renderers-h-34", { type: "heading", props: { level: 2 }, text: [t("Renderers")] });
  add("b-rtfam-renderers-doc-35", {
    type: "paragraph",
    props: {},
    text: [
      t("On the doc surface — reader and editor alike — each type renders through its own file in "),
      {
        insert: "packages/docs-viewer/src/components/rich-text/",
        attributes: {
          code: true,
          reference: { kind: "source", path: "packages/docs-viewer/src/components/rich-text" },
        },
      },
      t("."),
    ],
  });

  // Agent notes: family-level pointer.
  add("b-rtfam-agent-h-36", { type: "heading", props: { level: 2 }, text: [t("Agent notes")] });
  add("b-rtfam-agent-note-37", {
    type: "paragraph",
    props: {},
    text: [t("Family-wide agent guidance is the markdown bridge above; per-type agent notes live on each type page.")],
  });

  // Theming: the existing note moves under the canonical heading.
  add("b-rtfam-theming-h-38", { type: "heading", props: { level: 2 }, text: [t("Theming")] });

  doc.blocks[doc.root].children = [
    // Lead + type roster.
    "b-rich-text-overview-intro-2",
    "b-rich-text-overview-type-paragraph-4",
    "b-rich-text-overview-type-heading-5",
    "b-rich-text-overview-type-list-item-6",
    "b-rich-text-overview-type-quote-7",
    "b-rich-text-overview-type-callout-8",
    "b-rich-text-overview-type-divider-9",
    "b-rich-text-overview-type-image-10",
    "b-rich-text-overview-type-video-11",
    // Example.
    "b-rtfam-example-h-23",
    "b-rtfam-example-intro-24",
    "b-rtfam-ex-heading-25",
    "b-rtfam-ex-paragraph-26",
    "b-rtfam-ex-list-27",
    "b-rtfam-ex-quote-29",
    "b-rtfam-ex-callout-30",
    "b-rtfam-ex-divider-31",
    // State.
    "b-rtfam-state-h-20",
    "b-rtfam-state-lead-21",
    "b-20-rich-text-delta-example-3",
    "b-20-rich-text-marks-4",
    "b-rt-mark-bools-19",
    "b-rt-mark-strict-20",
    "b-rt-mark-canonical-21",
    "b-20-rich-text-links-6",
    "b-20-rich-text-link-mark-7",
    "b-20-rich-text-spectre-ref-8",
    "b-20-rich-text-ref-example-9",
    "b-20-rich-text-ref-neutral-home-10",
    "b-rt-ref-display-22",
    "b-20-rich-text-carriers-11",
    "b-20-rich-text-carriers-intro-12",
    "b-20-rich-text-carriers-table-13",
    // Typed actions.
    "b-rtfam-actions-h-32",
    "b-rtfam-actions-note-33",
    // Renderers.
    "b-rtfam-renderers-h-34",
    "b-rtfam-renderers-doc-35",
    "b-20-rich-text-bridges-14",
    "b-20-rich-text-bridges-out-15",
    "b-20-rich-text-bridges-in-16",
    // Agent notes.
    "b-rtfam-agent-h-36",
    "b-rtfam-agent-note-37",
    // Theming.
    "b-rtfam-theming-h-38",
    "b-rich-text-overview-theming-note-12",
  ];

  // Every non-root block must be reachable exactly once; verify.
  const reachable = new Set<string>([doc.root]);
  const walk = (id: string): void => {
    for (const child of doc.blocks[id]?.children ?? []) {
      if (reachable.has(child)) {
        console.error(`block ${child} reached twice`);
        process.exit(1);
      }
      reachable.add(child);
      walk(child);
    }
  };
  walk(doc.root);
  for (const id of Object.keys(doc.blocks)) {
    if (!reachable.has(id)) {
      console.error(`orphan block ${id}`);
      process.exit(1);
    }
  }

  saveDoc(path, doc);
}

console.log("reference-page-structure directive applied");
