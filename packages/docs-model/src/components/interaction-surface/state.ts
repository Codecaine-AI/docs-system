"use client";

import { Type } from "@sinclair/typebox";
import type { DocBlock } from "../../doc-schema";
import type { BlockStateDefinition } from "../types";

export const INTERACTION_SURFACE_KINDS = ["action", "query", "event"] as const;

export type InteractionSurfaceKind = (typeof INTERACTION_SURFACE_KINDS)[number];

export type InteractionSurfaceParam = {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
};

export type InteractionSurfaceOperation = {
  /** Operation signature name, e.g. "file-tree.addEntry". */
  name: string;
  description?: string;
  params?: InteractionSurfaceParam[];
  returns?: string;
  kind?: InteractionSurfaceKind;
};

export const InteractionSurfaceParamSchema = Type.Object(
  {
    name: Type.String(),
    type: Type.Optional(Type.String()),
    required: Type.Optional(Type.Boolean()),
    description: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const InteractionSurfaceOperationSchema = Type.Object(
  {
    name: Type.String(),
    description: Type.Optional(Type.String()),
    params: Type.Optional(Type.Array(InteractionSurfaceParamSchema)),
    returns: Type.Optional(Type.String()),
    kind: Type.Optional(
      Type.Union([
        Type.Literal("action"),
        Type.Literal("query"),
        Type.Literal("event"),
      ]),
    ),
  },
  { additionalProperties: false },
);

export const InteractionSurfaceState = Type.Object(
  {
    title: Type.Optional(Type.String()),
    operations: Type.Array(InteractionSurfaceOperationSchema),
  },
  { additionalProperties: false },
);

export const interactionSurfaceState: BlockStateDefinition = {
  schema: InteractionSurfaceState,
  carriesText: false,
};

function isInteractionSurfaceKind(value: unknown): value is InteractionSurfaceKind {
  return (
    typeof value === "string" &&
    (INTERACTION_SURFACE_KINDS as readonly string[]).includes(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Tolerant read: skips malformed entries, always returns fresh objects. */
export function readInteractionSurfaceOperations(block: DocBlock): InteractionSurfaceOperation[] {
  const raw = block.props.operations;
  if (!Array.isArray(raw)) return [];
  const operations: InteractionSurfaceOperation[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.name !== "string" || item.name.length === 0) continue;
    const operation: InteractionSurfaceOperation = { name: item.name };
    if (typeof item.description === "string" && item.description.length > 0) {
      operation.description = item.description;
    }
    if (Array.isArray(item.params)) {
      const params: InteractionSurfaceParam[] = [];
      for (const rawParam of item.params) {
        if (!isRecord(rawParam) || typeof rawParam.name !== "string" || rawParam.name.length === 0) continue;
        const param: InteractionSurfaceParam = { name: rawParam.name };
        if (typeof rawParam.type === "string") param.type = rawParam.type;
        if (typeof rawParam.required === "boolean") param.required = rawParam.required;
        if (typeof rawParam.description === "string") param.description = rawParam.description;
        params.push(param);
      }
      operation.params = params;
    }
    if (typeof item.returns === "string" && item.returns.length > 0) operation.returns = item.returns;
    if (isInteractionSurfaceKind(item.kind)) operation.kind = item.kind;
    operations.push(operation);
  }
  return operations;
}
