"use client";

import type { ComponentBundle } from "../types";
import { serializeWaterfall } from "./lib";
import { readWaterfallSteps } from "./state";

export const waterfallAgentView: ComponentBundle["agentView"] = (block) => {
  switch (block.type) {
    case "waterfall": {
      // The fence body is the arrow-tree notation serialized from the step tree.
      return "```waterfall\n" + serializeWaterfall(readWaterfallSteps(block)) + "\n```";
    }
    default:
      return null;
  }
};
