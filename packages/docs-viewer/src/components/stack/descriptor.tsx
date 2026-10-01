import { createElement } from "react";
import { readStack } from "@codecaine-ai/docs-model";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { WIDE_LEFT_BLOCK_LAYOUT } from "../../render/block-layout";
import { STRUCTURAL_OPS, blockAttrs, el, invalidBlockPlaceholder } from "../../render/descriptor-helpers";
import { STACK_AGENT_DESCRIPTION, STACK_LABEL, StackBlock } from "./StackDocsBlock";

export const descriptors: DocBlockDescriptor[] = [
  {
    type: "stack",
    targetKind: "stack",
    label: STACK_LABEL,
    agentDescription: STACK_AGENT_DESCRIPTION,
    patchOps: STRUCTURAL_OPS,
    // Layer rows carry long mono paths and two-column bodies; like the other
    // flow diagrams they take the wide lane (block-layout.ts).
    layout: WIDE_LEFT_BLOCK_LAYOUT,
    render: (block, ctx) => {
      if (!Array.isArray(block.props.nodes)) return invalidBlockPlaceholder(block, ctx, STACK_LABEL);
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        createElement(StackBlock, readStack(block)),
        ctx.renderChildren(block),
      );
    },
  },
];
