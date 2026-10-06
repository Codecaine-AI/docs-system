"use client";

import { createElement, useState } from "react";
import { ImageIcon, Maximize2Icon } from "lucide-react";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { STRUCTURAL_OPS, blockAttrs, el, stringProp } from "../../render/descriptor-helpers";
import { WIDE_LEFT_BLOCK_LAYOUT } from "../../render/block-layout";
import { atomBlockNode } from "../../editor/core/node-helpers";
import { ExpandableImage } from "./image-viewer";
import {
  MEDIA_FOCUS_RING,
  MEDIA_GHOST_BUTTON,
  MEDIA_HEAD_CLASSES,
  MEDIA_PANEL_CLASS,
  MEDIA_PANEL_FILL,
  MediaTile,
} from "./media-panel";

/** `image` — read-surface descriptor + ProseMirror editor node (atom leaf; NodeView attached in editor/views/node-views.tsx). */

export const DocImage = atomBlockNode("docImage");

/*
 * The image is one media panel (media-panel.tsx). The head row is chrome only:
 * the text-family image tile on the left and an icon Expand button on the
 * right, with no title, caption or file name. The body is the image, which
 * opens the same viewer on click. The caption is not drawn; it names the
 * image instead, as the alt fallback and the full-screen viewer's title.
 * Class strings are shared by both surfaces,
 * since the editor's atom node view renders this same descriptor. Every image
 * knob keeps its LIGHT default as the literal fallback: `border` /
 * `borderWidth` / `radius` draw the panel frame (the one hairline: the img
 * itself carries no border, so nothing is framed twice), `margin` the block.
 */
const IMAGE_FIGURE_CLASSES = `not-prose docs-image-block ${MEDIA_PANEL_CLASS} my-[var(--docs-image-margin,24px)] w-fit max-w-full ${MEDIA_PANEL_FILL} rounded-[var(--docs-image-radius,var(--radius,2px))] border-[length:var(--docs-image-border-width,1px)] border-[color:var(--docs-image-border,#e6e5e3)]`;
const IMAGE_HEAD_ROW_CLASSES = `${MEDIA_HEAD_CLASSES} gap-x-2`;
const IMAGE_EXPAND_CLASSES = `ml-auto ${MEDIA_GHOST_BUTTON} ${MEDIA_FOCUS_RING}`;
const IMAGE_CLASSES = "block h-auto max-w-full";
/* A vector brings its own canvas and rounded frame: pad it inside the body
 * so that frame does not butt against the panel's. A raster fills the body. */
const IMAGE_BODY_SVG_CLASSES = "max-w-full p-3";
const IMAGE_BODY_RASTER_CLASSES = "max-w-full";
const IMAGE_MISSING_CLASSES =
  "not-prose my-[var(--docs-image-margin,24px)] rounded-[var(--radius,2px)] border border-dashed border-[color:var(--docs-rule,#e6e5e3)] p-3 text-[length:var(--ds-font-size-ui-md)] text-[color:var(--docs-muted,#666562)]";

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
    const vector = isVectorSrc(src);
    return el(
      "figure",
      {
        key: block.id,
        ...blockAttrs(block),
        className: IMAGE_FIGURE_CLASSES,
        "data-src-kind": vector ? "svg" : "raster",
      },
      createElement(ImagePanelContent, {
        src: resolvedSrc,
        alt: stringProp(block, "alt") ?? caption ?? "",
        title: caption,
        vector,
      }),
      ctx.renderChildren(block),
    );
  },
};

/**
 * Head row + body of the image panel. One open state serves both triggers.
 * The head button also carries the `data-docs-image-expand` attributes, so a
 * statically published page (no hydration) opens the viewer from it too.
 */
function ImagePanelContent({ src, alt, title, vector }: { src: string; alt: string; title?: string; vector: boolean }) {
  const [open, setOpen] = useState(false);
  const label = title || alt || "Image";
  return (
    <>
      <div className={IMAGE_HEAD_ROW_CLASSES} data-media-head="">
        <MediaTile icon={ImageIcon} />
        <button
          type="button"
          className={IMAGE_EXPAND_CLASSES}
          data-docs-image-expand=""
          data-src={src}
          data-alt={alt}
          data-title={label}
          aria-label={`Open ${label} in full-screen viewer`}
          title="Expand"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); setOpen(true); }}
        >
          <Maximize2Icon size={12} strokeWidth={2} aria-hidden />
        </button>
      </div>
      <div className={vector ? IMAGE_BODY_SVG_CLASSES : IMAGE_BODY_RASTER_CLASSES}>
        <ExpandableImage
          src={src}
          alt={alt}
          title={title}
          className={IMAGE_CLASSES}
          open={open}
          onOpenChange={setOpen}
          hint={false}
        />
      </div>
    </>
  );
}
