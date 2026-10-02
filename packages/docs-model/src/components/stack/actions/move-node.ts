"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { findStackNode, issue, stackResult, subtreeNames } from "../lib";
import { readStack, type StackNode } from "../state";

export const moveNode = defineComponentAction({
  action: "stack.moveNode",
  blockType: "stack",
  description:
    "Move the named node (with its subtree) under another parent or to the top level, at an index resolved after the node is detached. Boundaries move with it.",
  params: Type.Object({
    name: Type.String({ minLength: 1, description: "Name of the node to move." }),
    parent: Type.Optional(
      Type.Union([Type.String({ minLength: 1 }), Type.Null()], {
        description: "New parent's name; null moves to the top level; omit to stay under the current parent.",
      }),
    ),
    index: Type.Optional(
      Type.Integer({
        minimum: 0,
        description: "Insert position among the destination's children after detaching; default end.",
      }),
    ),
  }),
  apply(block, params) {
    const { nodes, boundaries } = readStack(block);
    const found = findStackNode(nodes, params.name);
    if (!found) return issue("$.params.name", `No node named "${params.name}".`);

    const parentName = params.parent === undefined ? found.parent?.name ?? null : params.parent;
    if (parentName !== null && subtreeNames(found.node).includes(parentName)) {
      return issue("$.params.parent", `Cannot move "${params.name}" under itself or its own descendant.`);
    }

    found.siblings.splice(found.index, 1);
    if (found.parent && found.parent.children?.length === 0) delete found.parent.children;

    let siblings: StackNode[] = nodes;
    if (parentName !== null) {
      const parent = findStackNode(nodes, parentName);
      if (!parent) return issue("$.params.parent", `No node named "${parentName}".`);
      parent.node.children ??= [];
      siblings = parent.node.children;
    }
    const index = params.index ?? siblings.length;
    if (index > siblings.length) {
      return issue("$.params.index", `index must be in [0, ${siblings.length}] after detaching the node.`);
    }
    siblings.splice(index, 0, found.node);
    return stackResult(nodes, boundaries, { nodes: true });
  },
});
