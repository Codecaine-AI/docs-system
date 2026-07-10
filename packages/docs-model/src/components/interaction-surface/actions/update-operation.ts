"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { operationsPatch } from "../lib";
import {
  readInteractionSurfaceOperations,
  type InteractionSurfaceParam,
  type InteractionSurfaceOperation,
} from "../state";
import { ActionOperationParamSchema } from "./add-operation";

export const updateOperation = defineComponentAction({
  action: "interaction-surface.updateOperation",
  blockType: "interaction-surface",
  description:
    "Patch an operation (rename via patch.name; null clears description/params/returns/kind).",
  params: Type.Object(
    {
      name: Type.String({ minLength: 1, description: "Current operation name." }),
      patch: Type.Object(
        {
          name: Type.Optional(Type.String({ minLength: 1 })),
          description: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          params: Type.Optional(
            Type.Union([Type.Array(ActionOperationParamSchema), Type.Null()]),
          ),
          returns: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          kind: Type.Optional(
            Type.Union([
              Type.Literal("action"),
              Type.Literal("query"),
              Type.Literal("event"),
              Type.Null(),
            ]),
          ),
        },
        {
          description: "Partial operation; patch.name renames, null clears.",
        },
      ),
    },
  ),
  apply(block, params) {
    const { name, patch } = params;
    const newName = patch.name;
    const description = patch.description;
    const operationParams: InteractionSurfaceParam[] | null | undefined =
      patch.params === undefined || patch.params === null
        ? patch.params
        : patch.params.map((rawParam) => {
            const param: InteractionSurfaceParam = { name: rawParam.name };
            if (rawParam.type !== undefined) param.type = rawParam.type;
            if (rawParam.required !== undefined) param.required = rawParam.required;
            if (rawParam.description !== undefined) param.description = rawParam.description;
            return param;
          });
    const returns = patch.returns;
    const kind = patch.kind;

    const operations = readInteractionSurfaceOperations(block);
    const index = operations.findIndex((operation) => operation.name === name);
    if (index === -1) {
      return {
        ok: false,
        issues: [
          {
            path: "$.params.name",
            message: `Operation "${name}" does not exist.`,
          },
        ],
      };
    }
    if (
      newName !== undefined &&
      newName !== name &&
      operations.some((operation, i) => i !== index && operation.name === newName)
    ) {
      return {
        ok: false,
        issues: [
          {
            path: "$.params.patch.name",
            message: `Operation "${newName}" already exists.`,
          },
        ],
      };
    }

    const updated: InteractionSurfaceOperation = { ...operations[index] };
    if (newName !== undefined) updated.name = newName;
    if (description !== undefined) {
      if (description === null) delete updated.description;
      else updated.description = description;
    }
    if (operationParams !== undefined) {
      if (operationParams === null) delete updated.params;
      else updated.params = operationParams;
    }
    if (returns !== undefined) {
      if (returns === null) delete updated.returns;
      else updated.returns = returns;
    }
    if (kind !== undefined) {
      if (kind === null) delete updated.kind;
      else updated.kind = kind;
    }

    const next = [...operations];
    next[index] = updated;
    return { ok: true, props: operationsPatch(next) };
  },
});
