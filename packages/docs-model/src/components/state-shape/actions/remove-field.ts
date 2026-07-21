"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { fieldsPatch, resolveField, splitFieldPath } from "../lib";
import { readStateShapeFields } from "../state";

export const removeField = defineComponentAction({
  action: "state-shape.removeField",
  blockType: "state-shape",
  description: "Remove the field at path, together with its entire subtree.",
  params: Type.Object({
    path: Type.String({
      minLength: 1,
      description: 'Dot-path of the field to remove, e.g. "operations.params".',
    }),
  }),
  apply(block, params) {
    const fields = readStateShapeFields(block);
    const resolved = resolveField(fields, splitFieldPath(params.path));
    if (!resolved) {
      return {
        ok: false,
        issues: [
          {
            path: "$.params.path",
            message: `Field path "${params.path}" does not resolve.`,
          },
        ],
      };
    }
    resolved.siblings.splice(resolved.index, 1);
    return { ok: true, props: fieldsPatch(fields) };
  },
});
