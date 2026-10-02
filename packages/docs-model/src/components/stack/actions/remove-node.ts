"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { findStackNode, issue, stackResult, subtreeNames } from "../lib";
import { readStack } from "../state";

export const removeNode = defineComponentAction({
  action: "stack.removeNode",
  blockType: "stack",
  description:
    "Remove the named node with its whole subtree, and every boundary that follows a removed node.",
  params: Type.Object({
    name: Type.String({ minLength: 1, description: "Name of the node to remove." }),
  }),
  apply(block, params) {
    const { nodes, boundaries } = readStack(block);
    const found = findStackNode(nodes, params.name);
    if (!found) return issue("$.params.name", `No node named "${params.name}".`);
    found.siblings.splice(found.index, 1);
    if (found.parent && found.parent.children?.length === 0) delete found.parent.children;
    const removed = new Set(subtreeNames(found.node));
    const kept = boundaries.filter((boundary) => !removed.has(boundary.after));
    return stackResult(
      nodes,
      kept,
      kept.length === boundaries.length ? { nodes: true } : { nodes: true, boundaries: true },
    );
  },
});
