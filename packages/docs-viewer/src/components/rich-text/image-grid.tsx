"use client";

import { createElement, type CSSProperties } from "react";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { STRUCTURAL_OPS, blockAttrs, el } from "../../render/descriptor-helpers";
import { WIDE_LEFT_BLOCK_LAYOUT } from "../../render/block-layout";
import { atomBlockNode } from "../../editor/core/node-helpers";

export type ImageGridItem = { src: string; heading?: string; alt?: string; caption?: string };
export type ImageGridProps = { images: ImageGridItem[]; columns?: "auto" | number };
export const DocImageGrid = atomBlockNode("docImageGrid");

/** Ordered image comparisons. CSS handles wrapping without client JavaScript. */
export function ImageGrid({ images, columns = "auto", resolveAssetSrc }: ImageGridProps & { resolveAssetSrc?: (src: string) => string }) {
  return <div className="docs-image-grid" style={{ "--docs-grid-columns": columns === "auto" ? 4 : columns } as CSSProperties}>
    {images.map((image, index) => <figure className="docs-image-grid-item" key={index}>
      {image.heading && <div className="docs-image-grid-heading">{image.heading}</div>}
      <img src={resolveAssetSrc?.(image.src) ?? image.src} alt={image.alt ?? image.heading ?? image.caption ?? ""} loading="lazy" decoding="async" />
      {image.caption && <figcaption>{image.caption}</figcaption>}
    </figure>)}
  </div>;
}

export const imageGridDescriptor: DocBlockDescriptor = {
  type: "image-grid", targetKind: "image-grid", label: "Image Grid",
  agentDescription: "An ordered image-only comparison grid. Props: images [{src, heading?, alt?, caption?}], columns? (auto or integer 1 to 4). Rows grow automatically; narrow containers reduce columns. Preserve original proportions. Use a heading above each image to identify the step or variant. Edit through typed insert/update block operations. No arbitrary text columns.",
  patchOps: STRUCTURAL_OPS, layout: WIDE_LEFT_BLOCK_LAYOUT,
  render: (block, ctx) => el("div", { key: block.id, ...blockAttrs(block) }, createElement(ImageGrid, {
    images: (block.props.images ?? []) as ImageGridItem[],
    columns: block.props.columns as ImageGridProps["columns"], resolveAssetSrc: ctx.resolveAssetSrc,
  }), ctx.renderChildren(block)),
};
