"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { findStackNode, issue, stackResult } from "../lib";
import { readStack } from "../state";

export const setBoundary = defineComponentAction({
  action: "stack.setBoundary",
  blockType: "stack",
  description:
    "Draw (or replace) the dashed boundary line beneath the named node, labeled with the rule enforced there. Upserts by `after`.",
  params: Type.Object({
    after: Type.String({ minLength: 1, description: "Name of the node the line sits beneath." }),
    rule: Type.String({ minLength: 1, description: "The rule enforced at this line." }),
  }),
  apply(block, params) {
    const { nodes, boundaries } = readStack(block);
    if (!findStackNode(nodes, params.after)) {
      return issue("$.params.after", `No node named "${params.after}".`);
    }
    const index = boundaries.findIndex((boundary) => boundary.after === params.after);
    const next = { after: params.after, rule: params.rule };
    if (index === -1) boundaries.push(next);
    else boundaries[index] = next;
    return stackResult(nodes, boundaries, { boundaries: true });
  },
});
