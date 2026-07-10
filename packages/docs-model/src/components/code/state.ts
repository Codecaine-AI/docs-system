"use client";

import { Type } from "@sinclair/typebox";
import type { DocBlock } from "../../doc-schema";
import type { BlockStateDefinition } from "../types";

export const CodeAnnotationSchema = Type.Object(
  { lines: Type.String(), label: Type.Optional(Type.String()), note: Type.String() },
  { additionalProperties: false },
);

export const CodeState = Type.Object(
  { language: Type.Optional(Type.String()), annotations: Type.Optional(Type.Array(CodeAnnotationSchema)) },
  { additionalProperties: false },
);

export const codeState: BlockStateDefinition = { schema: CodeState, carriesText: true };

export type CodeAnnotation = { lines: string; label?: string; note: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Tolerant read: skips malformed entries, always returns fresh objects. */
export function readCodeAnnotations(block: DocBlock): CodeAnnotation[] {
  const raw = block.props.annotations;
  if (!Array.isArray(raw)) return [];
  const annotations: CodeAnnotation[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.lines !== "string" || typeof item.note !== "string") continue;
    const annotation: CodeAnnotation = { lines: item.lines, note: item.note };
    if (typeof item.label === "string" && item.label.length > 0) annotation.label = item.label;
    annotations.push(annotation);
  }
  return annotations;
}
