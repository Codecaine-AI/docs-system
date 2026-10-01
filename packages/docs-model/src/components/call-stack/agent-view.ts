"use client";

import type { ComponentBundle } from "../types";
import { projectOutlineRows } from "../shared/outline-rows";
import { readCallStack } from "./state";

/** One ```call-stack fence; see projectOutlineRows for the line grammar. */
export const callStackAgentView: ComponentBundle["agentView"] = (block) => {
  switch (block.type) {
    case "call-stack":
      return projectOutlineRows("call-stack", readCallStack(block));
    default:
      return null;
  }
};
