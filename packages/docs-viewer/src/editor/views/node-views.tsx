"use client";

import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { Fragment } from "react";
import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import { getDocBlockDescriptor, type DocBlockRenderContext } from "../../render/block-registry";
import {
  DocCanvas,
  DocCodeBlock,
  DocDivider,
  DocFileTree,
  DocImage,
  DocInteractionSurface,
  DocMermaid,
  DocSequence,
  DocStateShape,
  DocStructuredTable,
  DocVideo,
  DocWaterfall,
  NODE_TYPE_TO_BLOCK_TYPE,
} from "../core/schema";
import { CodeBlockNodeView } from "../../components/code/editor-node-view";
import { StructuredTableNodeView } from "../../components/structured-table/editor-node-view";
import { useDocEditorNodeViewContext } from "./node-view-context";

/**
 * Atom-node React views for the structured/atomic block types (divider,
 * image, video, canvas, file-tree, interaction-surface, state-shape,
 * mermaid; the
 * structured table has its own editable view below). Rather than
 * reimplementing each block type's presentation, every view here reconstructs
 * the minimal `DocBlock` the block-registry descriptor's `render` expects
 * from the PM node's `blockId`/`blockProps` attrs and calls it directly —
 * the SAME descriptors `DocBlockRenderer` (the read surface) uses, so an
 * atom block looks identical whether the doc is in view or edit mode. Only
 * `renderCanvas`/`resolveAssetSrc` are supplied fresh per node view (via
 * `DocEditorNodeViewContext`, since these blocks have no rich-text children
 * to recurse into, `renderText`/`renderChildren`/`renderMarkdown` are inert
 * stubs).
 */
function AtomBlockView({ node }: ReactNodeViewProps) {
  const { renderCanvas, renderSequence, resolveAssetSrc } = useDocEditorNodeViewContext();
  const blockType = NODE_TYPE_TO_BLOCK_TYPE[node.type.name];
  const descriptor = blockType ? getDocBlockDescriptor(blockType) : null;
  if (!descriptor || !blockType) {
    return (
      <NodeViewWrapper as="div" data-doc-node={node.type.name}>
        <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
          Unknown block type: {node.type.name}
        </div>
      </NodeViewWrapper>
    );
  }
  // `blockText` rides the atom node as a plain attr (see schema.ts) — thread
  // it back so body-parsing descriptors (mermaid) render their
  // real component in edit mode too, not the invalid-body placeholder.
  const blockText = node.attrs.blockText as DocBlock["text"] | null | undefined;
  const block: DocBlock = {
    id: (node.attrs.blockId as string) ?? "",
    type: blockType,
    props: (node.attrs.blockProps as Record<string, unknown>) ?? {},
    ...(blockText && blockText.length > 0 ? { text: blockText } : {}),
    children: [],
  };
  const ctx: DocBlockRenderContext = {
    renderText: () => null,
    renderChildren: () => null,
    renderMarkdown: (markdown) => <Fragment>{markdown}</Fragment>,
    renderCanvas,
    renderSequence,
    resolveAssetSrc,
  };
  return (
    <NodeViewWrapper as="div" data-doc-node={node.type.name} contentEditable={false}>
      {descriptor.render(block, ctx)}
    </NodeViewWrapper>
  );
}

export const DocDividerWithView = DocDivider.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AtomBlockView);
  },
});

export const DocImageWithView = DocImage.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AtomBlockView);
  },
});

export const DocVideoWithView = DocVideo.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AtomBlockView);
  },
});

export const DocCanvasWithView = DocCanvas.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AtomBlockView);
  },
});

export const DocSequenceWithView = DocSequence.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AtomBlockView);
  },
});

export const DocFileTreeWithView = DocFileTree.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AtomBlockView);
  },
});

// The structured table swaps in its own editable node view (in-place cell
// editing; see components/structured-table/editor-node-view.tsx) instead of
// the read-only AtomBlockView the other atoms share.
export const DocStructuredTableWithView = DocStructuredTable.extend({
  addNodeView() {
    return ReactNodeViewRenderer(StructuredTableNodeView);
  },
});

export const DocInteractionSurfaceWithView = DocInteractionSurface.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AtomBlockView);
  },
});

export const DocStateShapeWithView = DocStateShape.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AtomBlockView);
  },
});

export const DocMermaidWithView = DocMermaid.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AtomBlockView);
  },
});

export const DocWaterfallWithView = DocWaterfall.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AtomBlockView);
  },
});

/** All atom node definitions WITH their NodeView wiring attached — the extension list DocEditor actually registers. */
export const ATOM_BLOCK_NODES_WITH_VIEWS = [
  DocDividerWithView,
  DocImageWithView,
  DocVideoWithView,
  DocCanvasWithView,
  DocSequenceWithView,
  DocFileTreeWithView,
  DocStructuredTableWithView,
  DocInteractionSurfaceWithView,
  DocStateShapeWithView,
  DocMermaidWithView,
  DocWaterfallWithView,
];

/**
 * The one TEXT block with a React view: `docCodeBlock` keeps its editable
 * flat-text content (NodeViewContent) and gains the code component's
 * language picker (components/code/editor-node-view.tsx). DocEditor
 * registers this INSTEAD of the plain DocCodeBlock from TEXT_BLOCK_NODES.
 */
export const DocCodeBlockWithView = DocCodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },
});
