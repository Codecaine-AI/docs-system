"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { FieldSchema, cloneField } from "../../shared/field";
import type { Field } from "../../shared/field";
import { duplicateFieldName, fieldsPatch, resolveField, splitFieldPath } from "../lib";
import { readStateShapeFields } from "../state";

export const updateField = defineComponentAction({
  action: "state-shape.updateField",
  blockType: "state-shape",
  description:
    "Patch the field at path (rename via patch.name; null clears type/required/description; patch.fields replaces the subtree, null removes it).",
  params: Type.Object({
    path: Type.String({
      minLength: 1,
      description: 'Dot-path of the field to patch, e.g. "operations.params".',
    }),
    patch: Type.Object(
      {
        name: Type.Optional(Type.String({ minLength: 1 })),
        type: Type.Optional(Type.Union([Type.String(), Type.Null()])),
        required: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
        description: Type.Optional(Type.Union([Type.String(), Type.Null()])),
        fields: Type.Optional(Type.Union([Type.Array(FieldSchema), Type.Null()])),
      },
      { description: "Partial field; patch.name renames, null clears." },
    ),
  }),
  apply(block, params) {
    const { path, patch } = params;
    const fields = readStateShapeFields(block);
    const resolved = resolveField(fields, splitFieldPath(path));
    if (!resolved) {
      return {
        ok: false,
        issues: [
          {
            path: "$.params.path",
            message: `Field path "${path}" does not resolve.`,
          },
        ],
      };
    }
    const { siblings, index } = resolved;

    const newName = patch.name;
    if (
      newName !== undefined &&
      siblings.some((sibling, i) => i !== index && sibling.name === newName)
    ) {
      return {
        ok: false,
        issues: [
          {
            path: "$.params.patch.name",
            message: `Field "${newName}" already exists among the siblings of "${path}".`,
          },
        ],
      };
    }

    const nextFields: Field[] | null | undefined =
      patch.fields === undefined || patch.fields === null
        ? patch.fields
        : (patch.fields as Field[]).map(cloneField);
    if (nextFields != null) {
      const duplicate = duplicateFieldName(nextFields);
      if (duplicate !== undefined) {
        return {
          ok: false,
          issues: [
            {
              path: "$.params.patch.fields",
              message: `Duplicate sibling field name "${duplicate}".`,
            },
          ],
        };
      }
    }

    const updated: Field = { ...siblings[index] };
    if (newName !== undefined) updated.name = newName;
    if (patch.type !== undefined) {
      if (patch.type === null) delete updated.type;
      else updated.type = patch.type;
    }
    if (patch.required !== undefined) {
      if (patch.required === null) delete updated.required;
      else updated.required = patch.required;
    }
    if (patch.description !== undefined) {
      if (patch.description === null) delete updated.description;
      else updated.description = patch.description;
    }
    if (nextFields !== undefined) {
      if (nextFields === null) delete updated.fields;
      else updated.fields = nextFields;
    }

    siblings[index] = updated;
    return { ok: true, props: fieldsPatch(fields) };
  },
});
