"use client";

import { Type } from "@sinclair/typebox";
import type { DocValidationIssue } from "../../../doc-schema";
import { defineComponentAction } from "../../define";
import { checkLineIndex, isDiff, readPseudocodeLines, writePseudocodeLines } from "../lib";

export const removeLine = defineComponentAction({
  action: "pseudocode.removeLine",
  blockType: "pseudocode",
  description: "Remove the pseudocode line at a 0-based index.",
  params: Type.Object({
    index: Type.Integer({ minimum: 0, description: "Line index in [0, line count - 1]." }),
  }),
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const lines = readPseudocodeLines(block);
    if (!checkLineIndex(params.index, lines.length, false, issues)) return { ok: false, issues };
    return {
      ok: true,
      props: {},
      text: writePseudocodeLines(lines.filter((_, i) => i !== params.index), isDiff(block)),
    };
  },
});
