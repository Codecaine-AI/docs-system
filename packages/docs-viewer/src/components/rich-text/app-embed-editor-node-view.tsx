"use client";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useDocEditorNodeViewContext } from "../../editor/views/node-view-context";
import { AppEmbedBlock } from "./AppEmbedDocsBlock";
import { appEmbedBlockProps } from "./app-embed";

/** The editor shows the same panel as the read surface, with the host's app resolver and asset URLs from the node-view context. */
export function AppEmbedEditorNodeView({ node }: ReactNodeViewProps) {
  const { appEmbeds, resolveAssetSrc } = useDocEditorNodeViewContext();
  const block = {
    id: (node.attrs.blockId as string) ?? "",
    type: "app-embed" as const,
    props: (node.attrs.blockProps as Record<string, unknown>) ?? {},
    children: [],
  };
  return <NodeViewWrapper contentEditable={false} data-doc-node="docAppEmbed" data-doc-block-type="app-embed" data-doc-lane="wide" className="w-full">
    <AppEmbedBlock {...appEmbedBlockProps(block, { appEmbeds, resolveAssetSrc })} />
  </NodeViewWrapper>;
}
