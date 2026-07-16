"use client";

import { type Editor, type InputRule, markInputRule } from "@tiptap/core";
import { atomReplaceRule, textBlockConvertRule } from "../../editor/input/block-convert";

/**
 * Markdown-shortcut input rules owned by the rich-text component: the two
 * inline marks Ford wants as typing shortcuts (bold + inline code — italic
 * and strike are deliberately NOT auto-converted; dogfood review
 * 2026-07-16), every paragraph->rich-text-block conversion (heading, list
 * item, quote), and the `---` divider (fires the moment the third hyphen
 * lands, like Notion — no trailing space). Aggregated into the editor by
 * editor/input/input-rules.ts.
 */
export function buildRichTextInputRules(editor: Editor): InputRule[] {
  return [
    markInputRule({
      find: /(?:^|\s)((?:\*\*)((?:[^*]+))(?:\*\*))$/,
      type: editor.schema.marks.bold,
    }),
    markInputRule({
      find: /(?:^|\s)((?:`)((?:[^`]+))(?:`))$/,
      type: editor.schema.marks.code,
    }),
    textBlockConvertRule({
      find: /^#\s$/,
      typeName: "docHeading",
      getAttributes: { level: 1 },
    }),
    textBlockConvertRule({
      find: /^##\s$/,
      typeName: "docHeading",
      getAttributes: { level: 2 },
    }),
    textBlockConvertRule({
      find: /^###\s$/,
      typeName: "docHeading",
      getAttributes: { level: 3 },
    }),
    // `ordered` stays null (the "absent in source props" sentinel — see
    // DocListItem's attr comment) so a typed bullet doesn't grow a spurious
    // props.ordered on save; null renders as unordered.
    textBlockConvertRule({
      find: /^\s*([-*])\s$/,
      typeName: "docListItem",
    }),
    textBlockConvertRule({
      find: /^(\d+)\.\s$/,
      typeName: "docListItem",
      getAttributes: { ordered: true },
    }),
    textBlockConvertRule({
      find: /^\s*>\s$/,
      typeName: "docQuote",
    }),
    atomReplaceRule({
      find: /^---$/,
      typeName: "docDivider",
    }),
  ];
}
