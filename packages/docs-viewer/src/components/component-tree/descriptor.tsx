import { createElement } from "react";
import { readComponentTree } from "@codecaine-ai/docs-model";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { WIDE_LEFT_BLOCK_LAYOUT } from "../../render/block-layout";
import { STRUCTURAL_OPS, blockAttrs, el, invalidBlockPlaceholder } from "../../render/descriptor-helpers";
import { OutlineRows } from "../outline-rows/OutlineRows";

const LABEL = "Component Tree";

export const descriptors: DocBlockDescriptor[] = [
  {
    type: "component-tree",
    targetKind: "component-tree",
    label: LABEL,
    agentDescription:
      "A component render tree from a typed recursive tree: { nodes: { text; kind?: \"component\" | \"hook\" | \"branch\"; comment?; change?: \"added\" | \"modified\" | \"removed\"; source?: \"path:line\"; nodes? }[] }. Each node is one code row with tree guides; components, intrinsic tags, props, hook calls and strings are coloured by syntax role, a branch row leads with \"?\" and reads muted, comments wrap in one aligned column, source shows as a muted file:line column, and a changed node gets a +/\u2212/~ gutter glyph and a soft row tint.",
    patchOps: STRUCTURAL_OPS,
    // Code rows with a comment column need more than a prose measure (block-layout.ts).
    layout: WIDE_LEFT_BLOCK_LAYOUT,
    render: (block, ctx) => {
      if (!Array.isArray(block.props.nodes)) return invalidBlockPlaceholder(block, ctx, LABEL);
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        createElement(OutlineRows, { id: block.id, blockType: "component-tree", rows: readComponentTree(block), flavor: "component" }),
        ctx.renderChildren(block),
      );
    },
  },
];
