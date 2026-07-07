"use client";

import {
  type Editor,
  type InputRule,
  markInputRule,
  nodeInputRule,
  textblockTypeInputRule,
  wrappingInputRule,
} from "@tiptap/core";

/**
 * Input-rule port of markdown-shortcut authoring, TG8.2.2.
 * Referenced by DocEditor.tsx through an Extension's addInputRules().
 */
export function buildDocInputRules(editor: Editor): InputRule[] {
  return [
    markInputRule({
      find: /(?:^|\s)((?:\*\*)((?:[^*]+))(?:\*\*))$/,
      type: editor.schema.marks.bold,
    }),
    markInputRule({
      find: /(?:^|\s)((?:\*)((?:[^*]+))(?:\*))$/,
      type: editor.schema.marks.italic,
    }),
    markInputRule({
      find: /(?:^|\s)((?:~~)((?:[^~]+))(?:~~))$/,
      type: editor.schema.marks.strike,
    }),
    markInputRule({
      find: /(?:^|\s)((?:`)((?:[^`]+))(?:`))$/,
      type: editor.schema.marks.code,
    }),
    textblockTypeInputRule({
      find: /^#\s$/,
      type: editor.schema.nodes.docHeading,
      getAttributes: { level: 1 },
    }),
    textblockTypeInputRule({
      find: /^##\s$/,
      type: editor.schema.nodes.docHeading,
      getAttributes: { level: 2 },
    }),
    textblockTypeInputRule({
      find: /^###\s$/,
      type: editor.schema.nodes.docHeading,
      getAttributes: { level: 3 },
    }),
    wrappingInputRule({
      find: /^\s*([-*])\s$/,
      type: editor.schema.nodes.docListItem,
      getAttributes: { ordered: false },
    }),
    wrappingInputRule({
      find: /^(\d+)\.\s$/,
      type: editor.schema.nodes.docListItem,
      getAttributes: { ordered: true },
    }),
    wrappingInputRule({
      find: /^\s*>\s$/,
      type: editor.schema.nodes.docQuote,
    }),
    textblockTypeInputRule({
      find: /^```([a-z0-9_+-]*)[\s\n]$/,
      type: editor.schema.nodes.docCodeBlock,
      getAttributes: (match) => ({ language: match[1] || null }),
    }),
    nodeInputRule({
      find: /^(?:---)\s$/,
      type: editor.schema.nodes.docDivider,
    }),
  ];
}
