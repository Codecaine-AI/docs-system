"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import type { DocBlockType } from "@codecaine-ai/docs-model/doc-schema";
import {
  CODE_BLOCK_CLASSES,
  HEADING_CLASSES,
  LIST_ITEM_BULLET_CLASSES,
  LIST_ITEM_CLASSES,
  LIST_ITEM_CONTENT_CLASSES,
  PARAGRAPH_CLASSES,
  QUOTE_CLASSES,
  SEMANTIC_CARD_CLASSES,
  CARD_BODY_TEXT_CLASSES,
} from "../../render/block-classes";

/**
 * TipTap/ProseMirror node schema for the M4 full block editor (Checkpoint 8).
 *
 * Design (see convert.ts for the doc.json <-> PM JSON bridge, node-views.tsx
 * for the React rendering of atom nodes):
 *
 * - EVERY PM node that corresponds to a DocBlock carries `blockId` in its
 *   attrs — this is how §8.3 id stability rides through the editor. A block
 *   whose text/props are edited but never removed/recreated keeps exactly
 *   the same PM node identity attr, so `diffToOps` (convert.ts) can recognize
 *   it as the SAME block and emit a single `updateBlock`, never a
 *   delete+insert pair. `blockProps` carries the block type's typed `props`
 *   blob verbatim (level/tone/src/... — whatever doc-schema allows) so
 *   round-tripping through the editor never drops metadata it doesn't
 *   specifically model as its own PM attr (e.g. heading's `level` IS its own
 *   attr for editing ergonomics, but anything else the block's props carried
 *   rides along in `blockProps` untouched).
 *
 * - Text-bearing block types (paragraph, heading, docListItem, codeBlock, quote,
 *   callout) are ProseMirror "block"
 *   group nodes with `content: "docBlockText block*"`. ProseMirror's content
 *   expression parser REJECTS a top-level mix of an inline-group reference
 *   and a block-group reference in the same sequence (confirmed via
 *   prosemirror-model's Schema constructor: "Mixing inline and block
 *   content") — so a node cannot literally say "my own inline text, then
 *   some block children" as `"inline* block*"`. The fix, mirroring
 *   `prosemirror-schema-list`'s own canonical `addListNodes` doc comment
 *   (which prescribes `"paragraph block*"` for exactly this "own content +
 *   nested blocks" shape), is a small mandatory wrapper node — `docBlockText`
 *   — whose OWN content is `"inline*"` (a real, homogeneous, all-inline
 *   expression) and which is itself a `"block"`-group node. Every text-bearing
 *   node's content is then `"docBlockText block*"`: a homogeneous
 *   all-block sequence (the wrapper first, then any nested DocBlock children,
 *   e.g. nested list items from D25's ordered `children` array). The wrapper
 *   is transparent in both directions: `docToPM`/`pmToDoc` (convert.ts) always
 *   emit/consume it as content[0] and never expose it as its own DocBlock.
 *
 * - Structured/atomic block types (divider, image, video, canvas, file-tree,
 *   structured-table, interaction-surface, mermaid) are PM atom leaf
 *   nodes (`atom: true`, no editable inline content). They carry their full `props` blob as
 *   `blockProps` and render through a React NodeView (node-views.tsx) that
 *   DELEGATES to the existing block-registry descriptor's `render` — this
 *   reuses the same renderCanvas/resolveAssetSrc wiring DocBlockRenderer
 *   already established, so canvas embeds/asset resolution behave
 *   identically in and out of edit mode.
 *
 * - The `reference` mark from doc-schema is NOT a PM mark here — spans with
 *   `attributes.reference` become an inline ATOM node (`docReference`,
 *   defined in reference-node.tsx) carrying the full SpectreRef + display
 *   label in attrs, matching upstream BlockSuite's approach (see
 *   reference-node.tsx header) where a reference is an embedded inline
 *   element, not a text decoration — this sidesteps PM's inability to give a
 *   mark its own arbitrary text content independent of the surrounding run.
 */

/** Doc-schema block types whose PM representation is an editable text block (`inline* block*` content). */
export const TEXT_BLOCK_TYPES = [
  "paragraph",
  "heading",
  "list-item",
  "code",
  "quote",
  "callout",
] as const satisfies readonly DocBlockType[];

/** Doc-schema block types whose PM representation is a non-editable atom leaf node. */
export const ATOM_BLOCK_TYPES = [
  "divider",
  "image",
  "video",
  "canvas",
  "file-tree",
  "structured-table",
  "interaction-surface",
  "mermaid",
] as const satisfies readonly DocBlockType[];

/** PM node type name -> doc-schema block type. */
export const NODE_TYPE_TO_BLOCK_TYPE: Record<string, DocBlockType> = {
  docParagraph: "paragraph",
  docHeading: "heading",
  docListItem: "list-item",
  docCodeBlock: "code",
  docQuote: "quote",
  docCallout: "callout",
  docDivider: "divider",
  docImage: "image",
  docVideo: "video",
  docCanvas: "canvas",
  docFileTree: "file-tree",
  docStructuredTable: "structured-table",
  docInteractionSurface: "interaction-surface",
  docMermaid: "mermaid",
};

/** Inverse of NODE_TYPE_TO_BLOCK_TYPE — doc-schema block type -> PM node type name. */
export const BLOCK_TYPE_TO_NODE_TYPE: Record<DocBlockType, string> = Object.fromEntries(
  Object.entries(NODE_TYPE_TO_BLOCK_TYPE).map(([nodeType, blockType]) => [blockType, nodeType]),
) as Record<DocBlockType, string>;

/** Shared attrs every block-carrying node needs: the stable id + typed props blob. */
const blockAttrs = {
  // Rendered to the DOM as `data-block-id` — the SAME wrapper attribute the
  // block-registry descriptors emit on the read surface, so host features
  // that LOCATE blocks by id (scroll-to-block, test selectors) work
  // identically over the editor's DOM. Note the SSE change flash cannot ride
  // this alone: hosts must not SET attributes inside the editor (PM's DOM
  // observer strips foreign mutations) — that half goes through the
  // changed-flash.ts decoration instead.
  blockId: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => element.getAttribute("data-block-id"),
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes.blockId ? { "data-block-id": attributes.blockId } : {},
  },
  // Kept out of the DOM entirely: an object attr would stringify to
  // "[object Object]" and the props blob only matters to convert.ts's PM
  // JSON round trip, never to rendering.
  blockProps: { default: {} as Record<string, unknown>, rendered: false },
};

type DomOutputSpec = [string, Record<string, unknown>, number] | [string, Record<string, unknown>];

/**
 * Wrapper node carrying a text-bearing DocBlock's OWN inline content —
 * always content[0] of its parent (see the module doc comment above for why
 * this exists). Never corresponds to its own DocBlock; convert.ts unwraps it
 * transparently. Content is `"inline*"` (zero-or-more, so an empty-text
 * block round-trips as a wrapper with no children, not an absent wrapper —
 * the wrapper itself is always present, per PM's homogeneous-content rule).
 *
 * Deliberately carries NO `group` — every text-bearing node's content
 * expression (`"docBlockText block*"`) references it BY NAME, not via a
 * group, so group membership isn't needed for that to resolve. Giving it
 * `group: "block"` made TipTap's trailing-node behavior treat it as a valid
 * trailing filler node directly under `doc` itself (whose own content is
 * `"block+"`), inserting a stray top-level `docBlockText` sibling that
 * `pmToDoc` then choked on (no doc-schema block type mapping for it).
 */
export const DocBlockText = Node.create({
  name: "docBlockText",
  content: "inline*",
  parseHTML() {
    return [{ tag: 'span[data-doc-node="docBlockText"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-doc-node": "docBlockText" }), 0];
  },
});

/** Common factory for the "docBlockText block*" text block nodes — same shape, distinguished by node name/block type and (for heading) one extra attr. */
function textBlockNode(
  name: string,
  options: {
    addAttributes?: () => Record<string, { default: unknown }>;
    parseHTML: () => Array<{ tag: string; attrs?: Record<string, unknown> }>;
    renderHTML: (props: {
      node: { attrs: Record<string, unknown> };
      HTMLAttributes: Record<string, unknown>;
    }) => DomOutputSpec;
  },
) {
  return Node.create({
    name,
    group: "block",
    content: "docBlockText block*",
    addAttributes() {
      return { ...blockAttrs, ...(options.addAttributes?.() ?? {}) };
    },
    parseHTML() {
      return options.parseHTML();
    },
    renderHTML({ node, HTMLAttributes }) {
      return options.renderHTML({ node, HTMLAttributes });
    },
  });
}

export const DocParagraph = textBlockNode("docParagraph", {
  parseHTML: () => [{ tag: "p" }],
  renderHTML: ({ HTMLAttributes }) => [
    "p",
    mergeAttributes(HTMLAttributes, { class: PARAGRAPH_CLASSES }),
    0,
  ],
});

export const DocHeading = Node.create({
  name: "docHeading",
  group: "block",
  content: "docBlockText block*",
  addAttributes() {
    // `null` (not `2`) is the "absent in source props" sentinel — convert.ts
    // only promotes/demotes `level` when it was actually present in the
    // DocBlock's `props`, so a heading block that never set `level` doesn't
    // grow a spurious `props.level` on round trip. The renderer/editing UI
    // still treats a null level as level 2 for display purposes.
    return { ...blockAttrs, level: { default: null as number | null } };
  },
  parseHTML() {
    return [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } }));
  },
  renderHTML({ node, HTMLAttributes }) {
    const level = (node.attrs.level as number) ?? 2;
    return [`h${level}`, mergeAttributes(HTMLAttributes, { class: HEADING_CLASSES }), 0];
  },
});

export const DocListItem = Node.create({
  name: "docListItem",
  group: "block",
  content: "docBlockText block*",
  addAttributes() {
    // `null` (not `false`) is the "absent in source props" sentinel — see
    // DocHeading's `level` attr above for why this matters for round-trip
    // losslessness. Rendered/edited as unordered when null.
    return { ...blockAttrs, ordered: { default: null as boolean | null } };
  },
  parseHTML() {
    // The serialized editor `<li>` carries a static bullet `<span>` before
    // its content column (see renderHTML below) — `contentElement` keeps the
    // clipboard round trip from re-parsing that "•" into the item's text.
    // Bare `<li>`s (external paste) have no content column and parse whole.
    return [
      {
        tag: "li",
        contentElement: (element: HTMLElement) =>
          element.querySelector<HTMLElement>(":scope > div[data-doc-list-content]") ?? element,
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    // Mirrors the registry's list-item shape (block-classes.ts): a flex row
    // with a hand-drawn bullet and a content column — `flex` also suppresses
    // the `<li>`'s native marker. The content hole stays the ONLY child of
    // its parent (PM toDOM rule); the bullet is a static, non-editable
    // sibling. `order-first` keeps the bullet ahead of the empty-item
    // placeholder hint, which renders as an `::before` flex item on the
    // `<li>` itself (see decorations/placeholder.ts).
    return [
      "li",
      mergeAttributes(HTMLAttributes, { class: LIST_ITEM_CLASSES }),
      [
        "span",
        {
          class: `${LIST_ITEM_BULLET_CLASSES} order-first`,
          contenteditable: "false",
          "aria-hidden": "true",
        },
        "•",
      ],
      ["div", { class: LIST_ITEM_CONTENT_CLASSES, "data-doc-list-content": "true" }, 0],
    ];
  },
});

export const DocCodeBlock = Node.create({
  name: "docCodeBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  addAttributes() {
    return { ...blockAttrs, language: { default: null as string | null } };
  },
  parseHTML() {
    return [{ tag: "pre", preserveWhitespace: "full" as const }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["pre", mergeAttributes(HTMLAttributes, { class: CODE_BLOCK_CLASSES }), ["code", 0]];
  },
});

export const DocQuote = textBlockNode("docQuote", {
  parseHTML: () => [{ tag: "blockquote" }],
  renderHTML: ({ HTMLAttributes }) => [
    "blockquote",
    mergeAttributes(HTMLAttributes, { class: QUOTE_CLASSES }),
    0,
  ],
});

/**
 * Card-styled text block factory (callout is the only remaining user) —
 * `docBlockText block*` content like every other text block. The DOM carries
 * the read surface's card-container chrome (block-classes.ts) so a card
 * block LOOKS like a card while editing; the badge/label header row the read
 * surface adds is presentation the editor intentionally omits (it would be
 * static non-editable furniture inside a text block).
 */
function semanticNode(name: string, cardClasses: string = SEMANTIC_CARD_CLASSES) {
  return textBlockNode(name, {
    parseHTML: () => [{ tag: `div[data-doc-type="${NODE_TYPE_TO_BLOCK_TYPE[name]}"]` }],
    renderHTML: ({ HTMLAttributes }) => [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-doc-type": NODE_TYPE_TO_BLOCK_TYPE[name],
        class: `${cardClasses} ${CARD_BODY_TEXT_CLASSES}`,
      }),
      0,
    ],
  });
}

export const DocCallout = semanticNode("docCallout");

/** Factory for the atom (non-editable) leaf block nodes; NodeView wiring (`addNodeView`) is attached in node-views.tsx via `.extend()` to keep this module React-free. */
function atomBlockNode(name: string) {
  return Node.create({
    name,
    group: "block",
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
      // Atom block types have no PM inline content slot, but doc-schema allows
      // ANY block (including atoms like mermaid, whose body
      // grammar lives in `text`) to carry a `text` DeltaSpan[]. `blockText`
      // rides that verbatim as a plain attr (never rendered as editable PM
      // content) so convert.ts's atom-node path stays lossless.
      return { ...blockAttrs, blockText: { default: null as unknown } };
    },
    parseHTML() {
      return [{ tag: `div[data-doc-node="${name}"]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-doc-node": name })];
    },
  });
}

export const DocDivider = atomBlockNode("docDivider");
export const DocImage = atomBlockNode("docImage");
export const DocVideo = atomBlockNode("docVideo");
export const DocCanvas = atomBlockNode("docCanvas");
export const DocFileTree = atomBlockNode("docFileTree");
export const DocStructuredTable = atomBlockNode("docStructuredTable");
export const DocInteractionSurface = atomBlockNode("docInteractionSurface");
export const DocMermaid = atomBlockNode("docMermaid");

/** All text-block node definitions (used to build the editor's extension list). `DocBlockText` must be registered too — every text-bearing node above references it in its content expression — but it is NOT itself a doc-schema block type (see NODE_TYPE_TO_BLOCK_TYPE: it has no entry) and convert.ts never treats it as its own DocBlock. */
export const TEXT_BLOCK_NODES = [
  DocBlockText,
  DocParagraph,
  DocHeading,
  DocListItem,
  DocCodeBlock,
  DocQuote,
  DocCallout,
];

/** All atom (base, un-node-viewed) node definitions — node-views.tsx re-exports NodeView-attached versions of these under the same names. */
export const ATOM_BLOCK_NODES = [
  DocDivider,
  DocImage,
  DocVideo,
  DocCanvas,
  DocFileTree,
  DocStructuredTable,
  DocInteractionSurface,
  DocMermaid,
];
