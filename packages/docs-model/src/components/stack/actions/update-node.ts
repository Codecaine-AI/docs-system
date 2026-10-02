"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { findStackNode, issue, stackResult } from "../lib";
import { readStack, STACK_COLORS, type StackColor, type StackNode } from "../state";

export const updateNode = defineComponentAction({
  action: "stack.updateNode",
  blockType: "stack",
  description:
    "Patch the named node's own fields (children untouched). patch.name renames it and repoints any boundary after it; null clears detail/badge/color/uses/columns.",
  params: Type.Object({
    name: Type.String({ minLength: 1, description: "Name of the node to patch." }),
    patch: Type.Object(
      {
        name: Type.Optional(Type.String({ minLength: 1, description: "New name; must stay unique." })),
        detail: Type.Optional(
          Type.Union([Type.String({ minLength: 1 }), Type.Null()], { description: "One line under the name; null clears." }),
        ),
        badge: Type.Optional(
          Type.Union([Type.String({ minLength: 1 }), Type.Null()], { description: "Short tag beside the name; null clears." }),
        ),
        color: Type.Optional(
          Type.Union([...STACK_COLORS.map((color) => Type.Literal(color)), Type.Null()], {
            description: "Container tint or leaf badge color; null clears.",
          }),
        ),
        uses: Type.Optional(
          Type.Union([Type.Literal(true), Type.String({ minLength: 1 }), Type.Null()], {
            description: "true draws an unlabeled arrow to the next sibling, a string labels it, null removes it.",
          }),
        ),
        columns: Type.Optional(
          Type.Union([Type.Literal(2), Type.Null()], { description: "2 lays children in two columns; null clears." }),
        ),
      },
      { additionalProperties: false, description: "Partial node; null clears a field." },
    ),
  }),
  apply(block, params) {
    const { name, patch } = params;
    const { nodes, boundaries } = readStack(block);
    const found = findStackNode(nodes, name);
    if (!found) return issue("$.params.name", `No node named "${name}".`);

    const updated: StackNode = { ...found.node };
    if (patch.detail !== undefined) {
      if (patch.detail === null) delete updated.detail;
      else updated.detail = patch.detail;
    }
    if (patch.badge !== undefined) {
      if (patch.badge === null) delete updated.badge;
      else updated.badge = patch.badge;
    }
    if (patch.color !== undefined) {
      if (patch.color === null) delete updated.color;
      else updated.color = patch.color as StackColor;
    }
    if (patch.uses !== undefined) {
      if (patch.uses === null) delete updated.uses;
      else updated.uses = patch.uses;
    }
    if (patch.columns !== undefined) {
      if (patch.columns === null) delete updated.columns;
      else updated.columns = 2;
    }

    const renamed = patch.name !== undefined && patch.name !== name;
    if (renamed) updated.name = patch.name as string;
    found.siblings[found.index] = updated;

    if (!renamed) return stackResult(nodes, boundaries, { nodes: true });
    const nextBoundaries = boundaries.map((boundary) =>
      boundary.after === name ? { ...boundary, after: updated.name } : boundary,
    );
    const touchesBoundaries = boundaries.some((boundary) => boundary.after === name);
    return stackResult(nodes, nextBoundaries, touchesBoundaries ? { nodes: true, boundaries: true } : { nodes: true });
  },
});
