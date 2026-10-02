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

export const insertLine = defineComponentAction({
  action: "pseudocode.insertLine",
  blockType: "pseudocode",
  description: "Insert one pseudocode line at a 0-based index (index = line count appends).",
  params: Type.Object({
    index: Type.Integer({ minimum: 0, description: "Insert position in [0, line count]." }),
    text: lineTextSchema("Line text without a diff marker; no newlines. Leading spaces indent."),
    marker: Type.Optional(
      markerSchema('Diff marker "+" | "-" | " " (diff blocks only; default " ").'),
    ),
  }),
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const diff = isDiff(block);
    const lines = readPseudocodeLines(block);
    checkLineText(params.text, "text", issues);
    checkMarkerAllowed(params.marker, diff, "marker", issues);
    checkLineIndex(params.index, lines.length, true, issues);
    if (issues.length > 0) return { ok: false, issues };
    const next = [...lines];
    next.splice(params.index, 0, diff ? { text: params.text, marker: params.marker ?? " " } : { text: params.text });
    return { ok: true, props: {}, text: writePseudocodeLines(next, diff) };
  },
});
