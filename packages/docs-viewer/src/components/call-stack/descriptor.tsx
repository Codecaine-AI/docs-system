import { createElement } from "react";
import { readCallStack } from "@codecaine-ai/docs-model";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { WIDE_LEFT_BLOCK_LAYOUT } from "../../render/block-layout";
import { STRUCTURAL_OPS, blockAttrs, el, invalidBlockPlaceholder } from "../../render/descriptor-helpers";
import { OutlineRows } from "../outline-rows/OutlineRows";

const LABEL = "Call Stack";

export const descriptors: DocBlockDescriptor[] = [
  {
    type: "call-stack",
    targetKind: "call-stack",
    label: LABEL,
    agentDescription:
      "A call stack rendered from a typed recursive tree: { frames: { text; kind?: \"call\" | \"branch\"; comment?; change?: \"added\" | \"modified\" | \"removed\"; source?: \"path:line\"; frames? }[] }. Each frame is one code row with tree guides; calls, properties, keywords and literals are coloured by syntax role, a branch row leads with \"?\" and reads muted, comments wrap in one aligned column, source shows as a muted file:line column, and a changed frame gets a +/\u2212/~ gutter glyph and a soft row tint.",
    patchOps: STRUCTURAL_OPS,
    // Code rows with a comment column need more than a prose measure (block-layout.ts).
    layout: WIDE_LEFT_BLOCK_LAYOUT,
    render: (block, ctx) => {
      if (!Array.isArray(block.props.frames)) return invalidBlockPlaceholder(block, ctx, LABEL);
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        createElement(OutlineRows, { id: block.id, blockType: "call-stack", rows: readCallStack(block), flavor: "call-stack" }),
        ctx.renderChildren(block),
      );
    },
  },
];
