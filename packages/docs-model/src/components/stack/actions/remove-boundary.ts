"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { issue, stackResult } from "../lib";
import { readStack } from "../state";

export const removeBoundary = defineComponentAction({
  action: "stack.removeBoundary",
  blockType: "stack",
  description: "Remove the boundary line beneath the named node.",
  params: Type.Object({
    after: Type.String({ minLength: 1, description: "Name of the node whose boundary line to remove." }),
  }),
  apply(block, params) {
    const { nodes, boundaries } = readStack(block);
    const kept = boundaries.filter((boundary) => boundary.after !== params.after);
    if (kept.length === boundaries.length) {
      return issue("$.params.after", `No boundary follows "${params.after}".`);
    }
    return stackResult(nodes, kept, { boundaries: true });
  },
});
