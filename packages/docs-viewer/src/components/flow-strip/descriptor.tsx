import { createElement } from "react";
import { readFlowStrip } from "@codecaine-ai/docs-model";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { WIDE_LEFT_BLOCK_LAYOUT } from "../../render/block-layout";
import { STRUCTURAL_OPS, blockAttrs, el, invalidBlockPlaceholder } from "../../render/descriptor-helpers";
import { FLOW_STRIP_AGENT_DESCRIPTION, FLOW_STRIP_LABEL, FlowStripBlock } from "./FlowStripBlock";

export const descriptors: DocBlockDescriptor[] = [
  {
    type: "flow-strip",
    targetKind: "flow-strip",
    label: FLOW_STRIP_LABEL,
    agentDescription: FLOW_STRIP_AGENT_DESCRIPTION,
    patchOps: STRUCTURAL_OPS,
    // A row of cards needs more than a prose measure (block-layout.ts).
    layout: WIDE_LEFT_BLOCK_LAYOUT,
    render: (block, ctx) => {
      if (!Array.isArray(block.props.steps)) return invalidBlockPlaceholder(block, ctx, FLOW_STRIP_LABEL);
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        createElement(FlowStripBlock, { id: block.id, ...readFlowStrip(block) }),
        ctx.renderChildren(block),
      );
    },
  },
];
