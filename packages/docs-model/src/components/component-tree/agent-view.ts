"use client";

import type { ComponentBundle } from "../types";
import { projectOutlineRows } from "../shared/outline-rows";
import { readComponentTree } from "./state";

/** One ```component-tree fence; see projectOutlineRows for the line grammar. */
export const componentTreeAgentView: ComponentBundle["agentView"] = (block) => {
  switch (block.type) {
    case "component-tree":
      return projectOutlineRows("component-tree", readComponentTree(block));
    default:
      return null;
  }
};
