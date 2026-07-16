import type { DocBlockDescriptor } from "../../render/block-registry";
import {
  STRUCTURAL_OPS,
  blockAttrs,
  el,
  stringProp,
} from "../../render/descriptor-helpers";

export const descriptors: DocBlockDescriptor[] = [
  {
    type: "canvas",
    targetKind: "canvas",
    label: "Canvas",
    agentDescription:
      "An embedded interactive canvas; props: canvasId (central canvas id) or src (legacy sidecar path), view (optional container id crop, D4).",
    patchOps: STRUCTURAL_OPS,
    render: (block, ctx) => {
      const canvasId = stringProp(block, "canvasId");
      const src = stringProp(block, "src");
      const view = stringProp(block, "view");
      const title = stringProp(block, "title");
      const embed =
        (canvasId || src) && ctx.renderCanvas
          ? ctx.renderCanvas({ id: block.id, canvasId, src, view, title })
          : el(
              "div",
              {
                className:
                  "rounded-md border border-dashed border-[color:var(--docs-canvas-border,var(--border))] bg-muted/30 p-3 text-xs text-muted-foreground",
              },
              canvasId || src
                ? `Canvas embed: ${canvasId ?? src}`
                : "Canvas block is missing a canvasId or src.",
            );
      return el(
        "div",
        {
          key: block.id,
          ...blockAttrs(block),
          "data-canvas-id": canvasId,
          "data-canvas-src": src,
          "data-canvas-view": view,
          className: "not-prose my-4",
        },
        embed,
        ctx.renderChildren(block),
      );
    },
  },
];
