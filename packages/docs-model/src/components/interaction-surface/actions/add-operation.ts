"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { FieldSchema, cloneField } from "../../shared/field";
import type { Field } from "../../shared/field";
import { operationsPatch } from "../lib";
import {
  readInteractionSurfaceOperations,
  type InteractionSurfaceOperation,
} from "../state";

export const ActionOperationParamSchema = FieldSchema;

export const addOperation = defineComponentAction({
  action: "interaction-surface.addOperation",
  blockType: "interaction-surface",
  description:
    "Append an operation signature ({ name, description?, params?, returns?, kind? }) to the surface.",
  params: Type.Object({
    name: Type.String({
      minLength: 1,
      description: 'Operation name, e.g. "file-tree.addEntry" (must not already exist).',
    }),
    description: Type.Optional(
      Type.String({ description: "One-line description of what the operation does." }),
    ),
    params: Type.Optional(
      Type.Array(ActionOperationParamSchema, {
        description:
          "Signature params: [{ name, type?, required?, description?, fields? }] (fields nests recursively).",
      }),
    ),
    returns: Type.Optional(
      Type.String({ description: "What the operation returns/yields." }),
    ),
    kind: Type.Optional(
      Type.Union(
        [Type.Literal("action"), Type.Literal("query"), Type.Literal("event")],
        {
          description:
            'Operation kind: "action" | "query" | "event" (default reading: action).',
        },
      ),
    ),
  }),
  apply(block, params) {
    const operations = readInteractionSurfaceOperations(block);
    if (operations.some((operation) => operation.name === params.name)) {
      return {
        ok: false,
        issues: [
          {
            path: "$.params.name",
            message: `Operation "${params.name}" already exists.`,
          },
        ],
      };
    }

    const operation: InteractionSurfaceOperation = { name: params.name };
    if (params.description !== undefined) operation.description = params.description;
    if (params.params !== undefined) {
      operation.params = (params.params as Field[]).map(cloneField);
    }
    if (params.returns !== undefined) operation.returns = params.returns;
    if (params.kind !== undefined) operation.kind = params.kind;
    return { ok: true, props: operationsPatch([...operations, operation]) };
  },
});
