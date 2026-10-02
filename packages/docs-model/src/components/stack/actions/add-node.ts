"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { cloneStackNode, findStackNode, issue, stackResult } from "../lib";
import { readStack, StackNodeSchema, type StackNode } from "../state";

export const addNode = defineComponentAction({
  action: "stack.addNode",
  blockType: "stack",
  description:
    "Insert a node (with any children) at the top level or under the named parent; index defaults to the end. Names must stay unique across the stack.",
  params: Type.Object({
    node: StackNodeSchema,
    parent: Type.Optional(
      Type.String({ minLength: 1, description: "Name of the parent node; omit to insert at the top level." }),
    ),
    index: Type.Optional(
      Type.Integer({ minimum: 0, description: "Insert position among the parent's children; default end." }),
    ),
  }),
  apply(block, params) {
    const { nodes, boundaries } = readStack(block);
    let siblings = nodes;
    if (params.parent !== undefined) {
      const parent = findStackNode(nodes, params.parent);
      if (!parent) return issue("$.params.parent", `No node named "${params.parent}".`);
      parent.node.children ??= [];
      siblings = parent.node.children;
    }
    const index = params.index ?? siblings.length;
    if (index > siblings.length) {
      return issue("$.params.index", `index must be in [0, ${siblings.length}].`);
    }
    siblings.splice(index, 0, cloneStackNode(params.node as StackNode));
    return stackResult(nodes, boundaries, { nodes: true });
  },
});
