"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { readCodeAnnotations } from "../state";
import type { CodeAnnotation } from "../state";

export const setAnnotation = defineComponentAction({
  action: "code.setAnnotation",
  blockType: "code",
  description: 'Upsert a line annotation keyed by its exact "lines" string (e.g. "4-9").',
  params: Type.Object({
    lines: Type.String({ minLength: 1, description: 'Line range key, e.g. "1" or "4-9".' }),
    note: Type.String({ minLength: 1, description: "Annotation body." }),
    label: Type.Optional(Type.String({ description: "Optional short label." })),
  }),
  apply(block, { lines, note, label }) {
    const annotation: CodeAnnotation = { lines, note };
    if (label !== undefined) annotation.label = label;
    const annotations = readCodeAnnotations(block);
    const index = annotations.findIndex((candidate) => candidate.lines === lines);
    const next = [...annotations];
    if (index === -1) next.push(annotation);
    else next[index] = annotation;
    return { ok: true, props: { annotations: next } };
  },
});
