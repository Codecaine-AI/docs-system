"use client";

import type { DocBlockDescriptor } from "../../render/block-registry";
import { STRUCTURAL_OPS, blockAttrs, el, stringProp } from "../../render/descriptor-helpers";
import { CENTERED_MEDIA_BLOCK_LAYOUT } from "../../render/block-layout";
import { atomBlockNode } from "../../editor/core/node-helpers";

/** `image` — read-surface descriptor + ProseMirror editor node (atom leaf; NodeView attached in editor/views/node-views.tsx). */

export const DocImage = atomBlockNode("docImage");

export const imageDescriptor: DocBlockDescriptor = {
  type: "image",
  targetKind: "image",
  label: "Image",
  agentDescription:
    "An image from the doc bundle's assets/images/ (D30); props: src, alt, caption.",
  patchOps: STRUCTURAL_OPS,
  // Media centers on the page while prose stays on the left rail
  // (block-layout.ts). The lane centers the figure; `mx-auto` on the <img>
  // then centers a picture narrower than the lane inside it.
  layout: CENTERED_MEDIA_BLOCK_LAYOUT,
  render: (block, ctx) => {
    const src = stringProp(block, "src");
    const resolvedSrc = src ? (ctx.resolveAssetSrc?.(src) ?? src) : undefined;
    const caption = stringProp(block, "caption");
    return el(
      "figure",
      { key: block.id, ...blockAttrs(block), className: "not-prose my-4" },
      resolvedSrc
        ? el("img", {
            src: resolvedSrc,
            alt: stringProp(block, "alt") ?? caption ?? "",
            className:
              "mx-auto block max-w-full rounded-md border border-[color:var(--docs-image-border,var(--border))]",
          })
        : el(
            "div",
            {
              className:
                "rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground",
            },
            "Image block is missing a src.",
          ),
      caption
        ? el(
            "figcaption",
            {
              className:
                "mt-1 text-center text-xs text-[color:var(--docs-image-caption-fg,var(--muted-foreground))]",
            },
            caption,
          )
        : null,
      ctx.renderChildren(block),
    );
  },
};
