"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { operationsPatch } from "../lib";
import { readInteractionSurfaceOperations } from "../state";

export const removeOperation = defineComponentAction({
  action: "interaction-surface.removeOperation",
  blockType: "interaction-surface",
  description: "Remove the operation with the given name from the surface.",
  params: Type.Object(
    {
      name: Type.String({
        minLength: 1,
        description: "Exact name of the operation to remove.",
      }),
    },
    { additionalProperties: false },
  ),
  apply(block, params) {
    const operations = readInteractionSurfaceOperations(block);
    if (!operations.some((operation) => operation.name === params.name)) {
      return {
        ok: false,
        issues: [
          {
            path: "$.params.name",
            message: `Operation "${params.name}" does not exist.`,
          },
        ],
      };
    }
    return {
      ok: true,
      props: operationsPatch(
        operations.filter((operation) => operation.name !== params.name),
      ),
    };
  },
});
