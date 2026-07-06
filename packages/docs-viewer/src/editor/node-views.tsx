"use client";

import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { Fragment } from "react";
import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import { getDocFlavourDescriptor, type DocFlavourRenderContext } from "../flavour-registry";
import {
  DocAgentContract,
  DocAttachment,
  DocCanvas,
  DocDivider,
  DocFileTree,
  DocImage,
  NODE_TYPE_TO_FLAVOUR,
} from "./schema";
import { useDocEditorNodeViewContext } from "./node-view-context";

/**
 * Atom-node React views for the structured/atomic doc flavours (canvas,
 * image, attachment, divider, file-tree, agent-contract). Rather than
 * reimplementing each flavour's presentation, every view here reconstructs
 * the minimal `DocBlock` the flavour-registry descriptor's `render` expects
 * from the PM node's `blockId`/`blockProps` attrs and calls it directly —
 * the SAME descriptors `DocBlockRenderer` (the read surface) uses, so an
 * atom block looks identical whether the doc is in view or edit mode. Only
 * `renderCanvas`/`resolveAssetSrc` are supplied fresh per node view (via
 * `DocEditorNodeViewContext`, since these blocks have no rich-text children
 * to recurse into, `renderText`/`renderChildren`/`renderMarkdown` are inert
 * stubs).
 */
function AtomFlavourView({ node }: ReactNodeViewProps) {
  const { renderCanvas, resolveAssetSrc } = useDocEditorNodeViewContext();
  const flavour = NODE_TYPE_TO_FLAVOUR[node.type.name];
  const descriptor = flavour ? getDocFlavourDescriptor(flavour) : null;
  if (!descriptor || !flavour) {
    return (
      <NodeViewWrapper as="div" data-doc-node={node.type.name}>
        <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
          Unknown block flavour: {node.type.name}
        </div>
      </NodeViewWrapper>
    );
  }
  const block: DocBlock = {
    id: (node.attrs.blockId as string) ?? "",
    flavour,
    props: (node.attrs.blockProps as Record<string, unknown>) ?? {},
    children: [],
  };
  const ctx: DocFlavourRenderContext = {
    renderText: () => null,
    renderChildren: () => null,
    renderMarkdown: (markdown) => <Fragment>{markdown}</Fragment>,
    renderCanvas,
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
    return ReactNodeViewRenderer(AtomFlavourView);
  },
});

export const DocImageWithView = DocImage.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AtomFlavourView);
  },
});

export const DocAttachmentWithView = DocAttachment.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AtomFlavourView);
  },
});

export const DocCanvasWithView = DocCanvas.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AtomFlavourView);
  },
});

export const DocAgentContractWithView = DocAgentContract.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AtomFlavourView);
  },
});

export const DocFileTreeWithView = DocFileTree.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AtomFlavourView);
  },
});

/** All atom node definitions WITH their NodeView wiring attached — the extension list DocEditor actually registers. */
export const ATOM_BLOCK_NODES_WITH_VIEWS = [
  DocDividerWithView,
  DocImageWithView,
  DocAttachmentWithView,
  DocCanvasWithView,
  DocAgentContractWithView,
  DocFileTreeWithView,
];
