"use client";

import { type Editor, type InputRule } from "@tiptap/core";
import { codeBlockConvertRule } from "../../editor/input/block-convert";

/**
 * Markdown-shortcut input rules owned by the code component: the ``` fence
 * converting the current paragraph into a docCodeBlock the moment the
 * THIRD backtick lands (like Notion — no trailing space, no typed language
 * tag; the language comes from the block's picker or auto-detection).
 * Aggregated into the editor by editor/input/input-rules.ts.
 */
export function buildCodeInputRules(_editor: Editor): InputRule[] {
  return [
    codeBlockConvertRule({
      find: /^```$/,
      getAttributes: { language: null },
    }),
  ];
}
