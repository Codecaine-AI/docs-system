"use client";

import { Type } from "@sinclair/typebox";
import type { DocValidationIssue } from "../../../doc-schema";
import { defineComponentAction } from "../../define";
import {
  checkLineIndex,
  checkLineText,
  checkMarkerAllowed,
  isDiff,
  lineTextSchema,
  markerSchema,
  readPseudocodeLines,
  writePseudocodeLines,
} from "../lib";

export const updateLine = defineComponentAction({
  action: "pseudocode.updateLine",
  blockType: "pseudocode",
  description: "Replace the text and/or diff marker of the line at a 0-based index.",
  params: Type.Object({
    index: Type.Integer({ minimum: 0, description: "Line index in [0, line count - 1]." }),
    text: Type.Optional(lineTextSchema("New line text without a diff marker; no newlines.")),
    marker: Type.Optional(
      Type.Union([markerSchema('Diff marker "+" | "-" | " ".'), Type.Null()], {
        description: 'New diff marker (diff blocks only); null resets it to " " (unchanged line).',
      }),
    ),
  }),
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const diff = isDiff(block);
    const lines = readPseudocodeLines(block);
    if (params.text === undefined && params.marker === undefined) {
      issues.push({ path: "$.params", message: "Pass text, marker, or both." });
    }
    if (params.text !== undefined) checkLineText(params.text, "text", issues);
    checkMarkerAllowed(params.marker, diff, "marker", issues);
    checkLineIndex(params.index, lines.length, false, issues);
    if (issues.length > 0) return { ok: false, issues };
    const next = [...lines];
    const line = { ...next[params.index] };
    if (params.text !== undefined) line.text = params.text;
    if (params.marker !== undefined) line.marker = params.marker ?? " ";
    next[params.index] = line;
    return { ok: true, props: {}, text: writePseudocodeLines(next, diff) };
  },
});
