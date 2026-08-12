import { createElement } from "react";
import { readProcessOutlineSteps } from "@codecaine-ai/docs-model";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { WIDE_DATA_BLOCK_LAYOUT } from "../../render/block-layout";
import { STRUCTURAL_OPS, blockAttrs, el } from "../../render/descriptor-helpers";
import { AGENT_DESCRIPTION, LABEL, ProcessOutlineDocsBlock } from "./ProcessOutlineDocsBlock";

export const descriptors: DocBlockDescriptor[] = [
  {
    type: "process-outline",
    targetKind: "process-outline",
    label: LABEL,
    agentDescription: AGENT_DESCRIPTION,
    patchOps: STRUCTURAL_OPS,
    // Wide-data block: the step rail + note cards need more than a prose
    // measure (block-layout.ts).
    layout: WIDE_DATA_BLOCK_LAYOUT,
    render: (block, ctx) =>
      el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        createElement(ProcessOutlineDocsBlock, {
          id: block.id,
          steps: readProcessOutlineSteps(block),
        }),
        ctx.renderChildren(block),
      ),
  },
];
