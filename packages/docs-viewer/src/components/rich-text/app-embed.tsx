"use client";

import { createElement } from "react";
import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { STRUCTURAL_OPS, blockAttrs, el, stringProp } from "../../render/descriptor-helpers";
import { WIDE_LEFT_BLOCK_LAYOUT } from "../../render/block-layout";
import { atomBlockNode } from "../../editor/core/node-helpers";
import { APP_EMBED_AGENT_DESCRIPTION, APP_EMBED_LABEL, AppEmbedBlock, type AppEmbedBlockProps } from "./AppEmbedDocsBlock";
import type { AppEmbedHost } from "./app-embed-host";

/** `app-embed` — read-surface descriptor (rendering AppEmbedDocsBlock.tsx) + ProseMirror editor node (atom leaf; NodeView in app-embed-editor-node-view.tsx). */

export const DocAppEmbed = atomBlockNode("docAppEmbed");

/** Block props -> AppEmbedBlock props; both surfaces share it so the read view and the editor agree. */
export function appEmbedBlockProps(
  block: DocBlock,
  host: { appEmbeds?: AppEmbedHost; resolveAssetSrc?: (src: string) => string },
): AppEmbedBlockProps {
  const read = (key: string) => stringProp(block, key);
  const poster = read("poster");
  return {
    id: block.id,
    codebase: read("codebase"),
    app: read("app") ?? "",
    view: read("view"),
    params: read("params"),
    title: read("title"),
    height: typeof block.props.height === "number" ? block.props.height : undefined,
    // Same plumbing as the image and video descriptors: the host decides how a bundle-relative poster resolves.
    poster: poster ? (host.resolveAssetSrc?.(poster) ?? poster) : undefined,
    host: host.appEmbeds,
  };
}

export const appEmbedDescriptor: DocBlockDescriptor = {
  type: "app-embed",
  targetKind: "app-embed",
  label: APP_EMBED_LABEL,
  agentDescription: APP_EMBED_AGENT_DESCRIPTION,
  patchOps: STRUCTURAL_OPS,
  layout: WIDE_LEFT_BLOCK_LAYOUT,
  render: (block, ctx) =>
    el("div", { key: block.id, ...blockAttrs(block) }, createElement(AppEmbedBlock, appEmbedBlockProps(block, ctx)), ctx.renderChildren(block)),
};
