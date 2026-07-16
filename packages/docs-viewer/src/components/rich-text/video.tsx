"use client";

import { createElement } from "react";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { STRUCTURAL_OPS, blockAttrs, el, stringProp } from "../../render/descriptor-helpers";
import { atomBlockNode } from "../../editor/core/node-helpers";
import { VIDEO_AGENT_DESCRIPTION, VIDEO_LABEL, VideoBlock } from "./VideoDocsBlock";

/** `video` — read-surface descriptor (rendering VideoDocsBlock.tsx) + ProseMirror editor node (atom leaf; NodeView attached in editor/views/node-views.tsx). */

export const DocVideo = atomBlockNode("docVideo");

export const videoDescriptor: DocBlockDescriptor = {
  type: "video",
  targetKind: "video",
  label: VIDEO_LABEL,
  agentDescription: VIDEO_AGENT_DESCRIPTION,
  patchOps: STRUCTURAL_OPS,
  render: (block, ctx) => {
    const src = stringProp(block, "src");
    return el(
      "div",
      { key: block.id, ...blockAttrs(block) },
      createElement(VideoBlock, {
        id: block.id,
        src,
        // Same optional plumbing as the image descriptor: the host decides
        // HOW a bundle-relative src resolves; raw src otherwise.
        resolvedSrc: src ? (ctx.resolveAssetSrc?.(src) ?? src) : undefined,
        url: stringProp(block, "url"),
        title: stringProp(block, "title"),
        caption: stringProp(block, "caption"),
      }),
      ctx.renderChildren(block),
    );
  },
};
