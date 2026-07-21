"use client";

import { Type } from "@sinclair/typebox";
import type { DocBlock } from "../../doc-schema";
import { FieldSchema, readFields } from "../shared/field";
import type { Field } from "../shared/field";
import type { BlockStateDefinition } from "../types";

export const INTERACTION_SURFACE_KINDS = ["action", "query", "event"] as const;

export type InteractionSurfaceKind = (typeof INTERACTION_SURFACE_KINDS)[number];

/** Operation params are shared recursive Field nodes (see ../shared/field). */
export type InteractionSurfaceParam = Field;

export type InteractionSurfaceOperation = {
  /** Operation signature name, e.g. "file-tree.addEntry". */
  name: string;
  description?: string;
  params?: InteractionSurfaceParam[];
  returns?: string;
  kind?: InteractionSurfaceKind;
};

export const InteractionSurfaceParamSchema = FieldSchema;

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
      operation.params = readFields(item.params);
    }
    if (typeof item.returns === "string" && item.returns.length > 0) operation.returns = item.returns;
    if (isInteractionSurfaceKind(item.kind)) operation.kind = item.kind;
    operations.push(operation);
  }
  return operations;
}
