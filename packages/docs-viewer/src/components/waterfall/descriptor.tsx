import { createElement } from "react";
import { readWaterfallSteps } from "@codecaine-ai/docs-model";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { STRUCTURAL_OPS, blockAttrs, el } from "../../render/descriptor-helpers";
import { AGENT_DESCRIPTION, LABEL, WaterfallDocsBlock } from "./WaterfallDocsBlock";

export const descriptors: DocBlockDescriptor[] = [
  {
    type: "waterfall",
    targetKind: "waterfall",
    label: LABEL,
    agentDescription: AGENT_DESCRIPTION,
    patchOps: STRUCTURAL_OPS,
    render: (block, ctx) =>
      el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        createElement(WaterfallDocsBlock, {
          id: block.id,
          steps: readWaterfallSteps(block),
        }),
        ctx.renderChildren(block),
      ),
  },
];
