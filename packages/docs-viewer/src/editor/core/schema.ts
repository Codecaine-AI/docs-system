"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import type { DocBlockType } from "@codecaine-ai/docs-model/doc-schema";
import {
  DocCallout,
  DocDivider,
  DocHeading,
  DocImage,
  DocListItem,
  DocParagraph,
  DocQuote,
  DocVideo,
} from "../../components/rich-text/editor-nodes";
import { DocCodeBlock } from "../../components/code/editor-nodes";
import { DocMermaid } from "../../components/mermaid/editor-nodes";
import { DocFileTree } from "../../components/file-tree/editor-nodes";
import { DocStructuredTable } from "../../components/structured-table/editor-nodes";
import { DocInteractionSurface } from "../../components/interaction-surface/editor-nodes";
import { DocCanvas } from "../../components/canvas/editor-nodes";
import { DocSequence } from "../../components/sequence/editor-nodes";
import { blockAttrs as sharedBlockAttrs } from "./node-helpers";

export {
  DocCallout,
  DocCanvas,
  DocCodeBlock,
  DocDivider,
  DocFileTree,
  DocHeading,
  DocImage,
  DocInteractionSurface,
  DocListItem,
  DocMermaid,
  DocParagraph,
  DocQuote,
  DocSequence,
  DocStructuredTable,
  DocVideo,
};

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
  "sequence",
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
  docSequence: "sequence",
  docFileTree: "file-tree",
  docStructuredTable: "structured-table",
  docInteractionSurface: "interaction-surface",
  docMermaid: "mermaid",
};

/** Inverse of NODE_TYPE_TO_BLOCK_TYPE — doc-schema block type -> PM node type name. */
export const BLOCK_TYPE_TO_NODE_TYPE: Record<DocBlockType, string> = Object.fromEntries(
  Object.entries(NODE_TYPE_TO_BLOCK_TYPE).map(([nodeType, blockType]) => [blockType, nodeType]),
) as Record<DocBlockType, string>;

/** Shared attrs every block-carrying node needs; implemented with the shared factories so component modules stay acyclic. */
export const blockAttrs = sharedBlockAttrs;

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
  DocSequence,
  DocFileTree,
  DocStructuredTable,
  DocInteractionSurface,
  DocMermaid,
];
