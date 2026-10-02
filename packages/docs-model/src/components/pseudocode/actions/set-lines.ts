"use client";

import { Type } from "@sinclair/typebox";
import type { DocValidationIssue } from "../../../doc-schema";
import { defineComponentAction } from "../../define";
import {
  checkLineText,
  checkMarkerAllowed,
  isDiff,
  lineTextSchema,
  markerSchema,
  writePseudocodeLines,
} from "../lib";
import type { PseudocodeLine } from "../lib";

export const setLines = defineComponentAction({
  action: "pseudocode.setLines",
  blockType: "pseudocode",
  description: "Bulk replace: swap every pseudocode line, optionally turning the diff gutter on or off.",
  params: Type.Object({
    lines: Type.Array(
      Type.Object(
        {
          text: lineTextSchema("Line text without a diff marker; no newlines."),
          marker: Type.Optional(markerSchema('Diff marker "+" | "-" | " " (diff blocks only; default " ").')),
        },
        { additionalProperties: false },
      ),
      { description: "Complete replacement lines in order; an empty array clears the pseudocode." },
    ),
    diff: Type.Optional(
      Type.Boolean({ description: "Set the diff gutter on or off in the same edit; omit to keep it." }),
    ),
  }),
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const diff = params.diff ?? isDiff(block);
    params.lines.forEach((line, i) => {
      checkLineText(line.text, `lines[${i}].text`, issues);
      checkMarkerAllowed(line.marker, diff, `lines[${i}].marker`, issues);
    });
    if (issues.length > 0) return { ok: false, issues };
    const lines: PseudocodeLine[] = params.lines.map((line) =>
      diff ? { text: line.text, marker: line.marker ?? " " } : { text: line.text },
    );
    const props: Record<string, unknown> = {};
    if (params.diff !== undefined) props.diff = params.diff ? true : undefined;
    return { ok: true, props, text: writePseudocodeLines(lines, diff) };
  },
});
