"use client";

import { createElement } from "react";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { STRUCTURAL_OPS, blockAttrs, el, stringProp } from "../../render/descriptor-helpers";
import { WIDE_LEFT_BLOCK_LAYOUT } from "../../render/block-layout";
import { atomBlockNode } from "../../editor/core/node-helpers";
import { ImageIcon } from "lucide-react";
import { ExpandableImage } from "./image-viewer";
import {
  MEDIA_HEAD_CLASSES,
  MEDIA_PANEL_CLASS,
  MEDIA_PANEL_FILL,
  MediaHeadContent,
  assetFileName,
} from "./media-panel";

/** `image` — read-surface descriptor + ProseMirror editor node (atom leaf; NodeView attached in editor/views/node-views.tsx). */

export const DocImage = atomBlockNode("docImage");

/*
 * The image is one media panel (media-panel.tsx): the head carries the
 * text-family tile, the caption as its title and the asset file name as mono
 * meta (a bare file name becomes the mono title when there is no caption);
 * the body is the image. Class strings are shared by both surfaces, since the
 * editor's atom node view renders this same descriptor. Every image knob
 * keeps its LIGHT default as the literal fallback: `border` / `borderWidth` /
 * `radius` draw the panel frame (the one hairline: the img itself carries no
 * border, so nothing is framed twice), `caption` / `captionTextSize` set the
 * head title, `captionGap` spaces the head row, `margin` the block.
 */
const IMAGE_FIGURE_CLASSES = `not-prose ${MEDIA_PANEL_CLASS} my-[var(--docs-image-margin,24px)] w-fit max-w-full ${MEDIA_PANEL_FILL} rounded-[var(--docs-image-radius,var(--radius,2px))] border-[length:var(--docs-image-border-width,1px)] border-[color:var(--docs-image-border,#e6e5e3)]`;
const IMAGE_HEAD_CLASSES = `${MEDIA_HEAD_CLASSES} gap-x-[var(--docs-image-caption-gap,8px)] text-[length:var(--docs-image-caption-text-size,13.5px)] font-semibold leading-[1.3] text-[color:var(--docs-image-caption-fg,#1f1f1f)]`;
const IMAGE_CLASSES = "block h-auto max-w-full";
/* A vector brings its own canvas and rounded frame: pad it inside the body
 * so that frame does not butt against the panel's. A raster fills the body. */
const IMAGE_BODY_SVG_CLASSES = "max-w-full p-3";
const IMAGE_BODY_RASTER_CLASSES = "max-w-full";
const IMAGE_MISSING_CLASSES =
  "not-prose my-[var(--docs-image-margin,24px)] rounded-[var(--radius,2px)] border border-dashed border-[color:var(--docs-rule,#e6e5e3)] p-3 text-[13.5px] text-[color:var(--docs-muted,#666562)]";

const isVectorSrc = (src: string) => /\.svg(?:[?#]|$)/i.test(src);

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
    const caption = stringProp(block, "caption");
    if (!src) {
      return el(
        "figure",
        { key: block.id, ...blockAttrs(block), className: IMAGE_MISSING_CLASSES },
        "Image block is missing a src.",
        ctx.renderChildren(block),
      );
    }
    const resolvedSrc = ctx.resolveAssetSrc?.(src) ?? src;
    const fileName = assetFileName(src);
    const vector = isVectorSrc(src);
    return el(
      "figure",
      {
        key: block.id,
        ...blockAttrs(block),
        className: IMAGE_FIGURE_CLASSES,
        "data-src-kind": vector ? "svg" : "raster",
      },
      el(
        "figcaption",
        { className: IMAGE_HEAD_CLASSES },
        caption
          ? createElement(MediaHeadContent, { icon: ImageIcon, title: caption, meta: fileName })
          : createElement(MediaHeadContent, { icon: ImageIcon, title: fileName, titleMono: true }),
      ),
      el(
        "div",
        { className: vector ? IMAGE_BODY_SVG_CLASSES : IMAGE_BODY_RASTER_CLASSES },
        createElement(ExpandableImage, {
          src: resolvedSrc,
          alt: stringProp(block, "alt") ?? caption ?? "",
          title: caption,
          className: IMAGE_CLASSES,
        }),
      ),
      ctx.renderChildren(block),
    );
  },
};
