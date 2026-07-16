"use client";

import { type Editor, type InputRule } from "@tiptap/core";
import { buildCodeInputRules } from "../../components/code/input-rules";
import { buildRichTextInputRules } from "../../components/rich-text/input-rules";

/**
 * Aggregator for markdown-shortcut authoring (TG8.2.2): each component
 * folder owns its own rules (components/<name>/input-rules.ts, built on the
 * schema-shape-aware factories in ./block-convert.ts); this module only
 * composes them. Referenced by DocEditor.tsx through an Extension's
 * addInputRules().
 */
export function buildDocInputRules(editor: Editor): InputRule[] {
  return [...buildRichTextInputRules(editor), ...buildCodeInputRules(editor)];
}
