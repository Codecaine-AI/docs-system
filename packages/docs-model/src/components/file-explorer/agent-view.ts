"use client";

import type { ComponentBundle } from "../types";
import { projectFileTree } from "../file-tree/agent-view";

/** The file tree's tree-command listing, led by the title in bold when one is set. */
export const fileExplorerAgentView: ComponentBundle["agentView"] = (block) => {
  switch (block.type) {
    case "file-explorer": {
      const tree = projectFileTree(block);
      const title = typeof block.props.title === "string" ? block.props.title.trim() : "";
      return title ? `**${title}**\n\n${tree}` : tree;
    }
    default:
      return null;
  }
};
