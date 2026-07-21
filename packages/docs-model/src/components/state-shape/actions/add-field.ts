"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { FieldSchema, cloneField } from "../../shared/field";
import type { Field } from "../../shared/field";
import { duplicateFieldName, fieldsPatch, resolveChildList, splitFieldPath } from "../lib";
import { readStateShapeFields } from "../state";

export const addField = defineComponentAction({
  action: "state-shape.addField",
  blockType: "state-shape",
  description:
    "Insert a field ({ name, type?, required?, description?, fields? }) under the parent named by path; index defaults to the end.",
  params: Type.Object({
    field: FieldSchema,
    path: Type.Optional(
      Type.String({
        description:
          'Dot-path of the PARENT field, e.g. "operations.params"; "" or omitted inserts into the root fields array.',
      }),
    ),
    index: Type.Optional(
      Type.Integer({
        description: "Insert position among the parent's fields; default end.",
      }),
    ),
  }),
  apply(block, params) {
    const field = cloneField(params.field as Field);
    const duplicate = duplicateFieldName(field.fields ?? []);
    if (duplicate !== undefined) {
      return {
        ok: false,
        issues: [
          {
            path: "$.params.field.fields",
            message: `Duplicate sibling field name "${duplicate}".`,
          },
        ],
      };
    }

    const fields = readStateShapeFields(block);
    const siblings = resolveChildList(fields, splitFieldPath(params.path));
    if (!siblings) {
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
    if (siblings.some((sibling) => sibling.name === field.name)) {
      return {
        ok: false,
        issues: [
          {
            path: "$.params.field.name",
            message: `Field "${field.name}" already exists under "${params.path ?? ""}".`,
          },
        ],
      };
    }

    const index = params.index ?? siblings.length;
    if (index < 0 || index > siblings.length) {
      return {
        ok: false,
        issues: [
          {
            path: "$.params.index",
            message: `"index" must be an integer in [0, ${siblings.length}].`,
          },
        ],
      };
    }

    siblings.splice(index, 0, field);
    return { ok: true, props: fieldsPatch(fields) };
  },
});
