"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { readCodeAnnotations } from "../state";

export const removeAnnotation = defineComponentAction({
  action: "code.removeAnnotation",
  blockType: "code",
  description: 'Remove the annotation whose "lines" key matches exactly.',
  params: Type.Object(
    { lines: Type.String({ minLength: 1, description: "Line range key of the annotation." }) },
    { additionalProperties: false },
  ),
  apply(block, { lines }) {
    const annotations = readCodeAnnotations(block);
    if (!annotations.some((candidate) => candidate.lines === lines)) {
      return { ok: false, issues: [{ path: "$.params.lines", message: `Code annotation for lines "${lines}" does not exist.` }] };
    }
    return { ok: true, props: { annotations: annotations.filter((candidate) => candidate.lines !== lines) } };
  },
});
