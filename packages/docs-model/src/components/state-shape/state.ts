"use client";

import { Type } from "@sinclair/typebox";
import type { DocBlock, DocValidationIssue } from "../../doc-schema";
import { FieldSchema, readFields } from "../shared/field";
import type { Field } from "../shared/field";
import type { BlockStateDefinition } from "../types";

export type StateShapeSource = {
  /** Path of the defining source file, e.g. "packages/docs-model/src/doc-schema.ts". */
  path: string;
  /** Symbol within that file, e.g. "DocBlock". */
  symbol?: string;
};

export const StateShapeSourceSchema = Type.Object(
  {
    path: Type.String({ minLength: 1 }),
    symbol: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const StateShapeState = Type.Object(
  {
    name: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
    source: Type.Optional(StateShapeSourceSchema),
    fields: Type.Array(FieldSchema),
    /** JSON text of an example INSTANCE of the shape (validity enforced by the custom check). */
    example: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

/**
 * Dot-path addressing (state-shape.<verb> actions) requires field names to be
 * unique among siblings at every level; runs only after the schema passes.
 */
function checkSiblingNames(
  fields: readonly Field[],
  basePath: string,
  issues: DocValidationIssue[],
): void {
  const seen = new Set<string>();
  fields.forEach((field, index) => {
    if (seen.has(field.name)) {
      issues.push({
        path: `${basePath}[${index}].name`,
        message: `Duplicate sibling field name "${field.name}".`,
      });
    }
    seen.add(field.name);
    if (field.fields) checkSiblingNames(field.fields, `${basePath}[${index}].fields`, issues);
  });
}

export const stateShapeState: BlockStateDefinition = {
  schema: StateShapeState,
  carriesText: false,
  check(props, basePath) {
    const issues: DocValidationIssue[] = [];
    checkSiblingNames((props.fields ?? []) as Field[], `${basePath}.fields`, issues);
    // `example` must be JSON text of an example instance; runs after the
    // schema passes, so a present example is already a non-empty string.
    if (typeof props.example === "string" && !parsesAsJson(props.example)) {
      issues.push({
        path: `${basePath}.example`,
        message: "example does not parse as JSON.",
      });
    }
    return issues;
  },
};

function parsesAsJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Tolerant read: skips malformed entries, always returns fresh objects. */
export function readStateShapeFields(block: DocBlock): Field[] {
  return readFields(block.props.fields);
}

/** Tolerant read: undefined unless `example` is a non-empty string of valid JSON. */
export function readStateShapeExample(block: DocBlock): string | undefined {
  const raw = block.props.example;
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  try {
    JSON.parse(raw);
  } catch {
    return undefined;
  }
  return raw;
}

/** Tolerant read: undefined unless `source` carries a non-empty string path. */
export function readStateShapeSource(block: DocBlock): StateShapeSource | undefined {
  const raw = block.props.source;
  if (!isRecord(raw) || typeof raw.path !== "string" || raw.path.length === 0) return undefined;
  const source: StateShapeSource = { path: raw.path };
  if (typeof raw.symbol === "string" && raw.symbol.length > 0) source.symbol = raw.symbol;
  return source;
}
