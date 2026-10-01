"use client";

import { Type } from "@sinclair/typebox";
import type { DocBlock } from "../../doc-schema";
import type { BlockStateDefinition } from "../types";

export type FlowStripStep = { name: string; detail?: string };

export const FlowStripStepSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, description: "Step name on the card; backticks mark code." }),
    detail: Type.Optional(Type.String({ description: "One line under the name." })),
  },
  { additionalProperties: false },
);

export const FlowStripState = Type.Object(
  {
    title: Type.Optional(Type.String({ description: "Short label above the cards." })),
    steps: Type.Array(FlowStripStepSchema),
    caption: Type.Optional(Type.String({ description: "One line under the cards." })),
  },
  { additionalProperties: false },
);

export const flowStripState: BlockStateDefinition = { schema: FlowStripState, carriesText: false };

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Tolerant read: skips malformed steps, drops blank optional text. */
export function readFlowStrip(block: DocBlock): { title?: string; steps: FlowStripStep[]; caption?: string } {
  const raw = Array.isArray(block.props.steps) ? block.props.steps : [];
  const steps: FlowStripStep[] = [];
  for (const item of raw) {
    const name = text((item as { name?: unknown } | null)?.name);
    if (!name) continue;
    const detail = text((item as { detail?: unknown }).detail);
    steps.push(detail ? { name, detail } : { name });
  }
  const out: { title?: string; steps: FlowStripStep[]; caption?: string } = { steps };
  const title = text(block.props.title);
  const caption = text(block.props.caption);
  if (title) out.title = title;
  if (caption) out.caption = caption;
  return out;
}
