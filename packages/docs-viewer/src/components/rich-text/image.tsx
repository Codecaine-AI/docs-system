"use client";

import { createElement } from "react";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { STRUCTURAL_OPS, blockAttrs, el, stringProp } from "../../render/descriptor-helpers";
import { WIDE_LEFT_BLOCK_LAYOUT } from "../../render/block-layout";
import { atomBlockNode } from "../../editor/core/node-helpers";
import { ExpandableImage } from "./image-viewer";

/** `image` — read-surface descriptor + ProseMirror editor node (atom leaf; NodeView attached in editor/views/node-views.tsx). */

export const DocImage = atomBlockNode("docImage");

/*
 * Class strings for the figure — shared by both surfaces, since the editor's
 * atom node view renders this same descriptor. Every value follows an image
 * token, and each fallback equals its semantic.css default (the old
 * `my-4` / `rounded-md border` / `mt-1 text-xs` utilities), so an unthemed
 * host renders unchanged. The radius default tracks the global `--radius`
 * (8px stock, so 6px), as `rounded-md` did. `leading-[calc(1/0.75)]` is the
 * line height `text-xs` paired with its font size; it is kept explicit
 * because the arbitrary size utility sets the size alone.
 */
const IMAGE_FIGURE_CLASSES = "not-prose my-[var(--docs-image-margin,16px)]";
const IMAGE_FRAME_CLASSES =
  "max-w-full rounded-[var(--docs-image-radius,var(--radius,2px))] border-[length:var(--docs-image-border-width,1px)] border-[color:var(--docs-image-border,var(--border))]";
const IMAGE_CAPTION_CLASSES =
  "mt-[var(--docs-image-caption-gap,4px)] text-[length:var(--docs-image-caption-text-size,12px)] leading-[calc(1/0.75)] text-[color:var(--docs-image-caption-fg,var(--muted-foreground))]";

export const imageDescriptor: DocBlockDescriptor = {
  type: "image",
  targetKind: "image",
  label: "Image",
  agentDescription:
    "An image from the doc bundle's assets/images/ (D30); props: src, alt, caption.",
  patchOps: STRUCTURAL_OPS,
  // Media uses the shared wide-left lane; centering is a theme/rail opt-in
  // (block-layout.ts).
  layout: WIDE_LEFT_BLOCK_LAYOUT,
  render: (block, ctx) => {
    const src = stringProp(block, "src");
    const resolvedSrc = src ? (ctx.resolveAssetSrc?.(src) ?? src) : undefined;
    const caption = stringProp(block, "caption");
    return el(
      "figure",
      { key: block.id, ...blockAttrs(block), className: IMAGE_FIGURE_CLASSES },
      resolvedSrc
        ? createElement(ExpandableImage, {
            src: resolvedSrc,
            alt: stringProp(block, "alt") ?? caption ?? "",
            title: caption,
            className: IMAGE_FRAME_CLASSES,
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
        ? el("figcaption", { className: IMAGE_CAPTION_CLASSES }, caption)
        : null,
      ctx.renderChildren(block),
    );
  },
};
