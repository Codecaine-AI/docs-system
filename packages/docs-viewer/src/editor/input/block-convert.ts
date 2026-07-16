"use client";

import { InputRule } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * Input-rule factories aware of the "docBlockText block*" schema shape
 * (editor/core/schema.ts).
 *
 * TipTap's stock textblockTypeInputRule / wrappingInputRule act on the
 * TEXTBLOCK at the cursor — in this schema that is always the docBlockText
 * WRAPPER, and converting or wrapping the wrapper is structurally invalid
 * (every text-bearing node requires it as first child), so those rules
 * silently never fire. These factories convert the wrapper's PARENT block
 * (the docParagraph being typed in) instead, which is the Notion semantic:
 * "## " turns the current paragraph block into a heading block.
 *
 * All factories no-op (return null) unless the match starts at the very
 * beginning of a docParagraph's own text — typing "## " mid-paragraph or
 * inside a heading/list/quote/callout does nothing, matching Notion.
 */

type ParagraphContext = {
  /** The docParagraph node being converted. */
  container: PMNode;
  /** Its absolute position (for setNodeMarkup / replaceWith). */
  containerPos: number;
  /** Offset of the docBlockText's first text position. */
  textStart: number;
};

function paragraphContext(state: EditorState, range: { from: number }): ParagraphContext | null {
  const $start = state.doc.resolve(range.from);
  if ($start.parent.type.name !== "docBlockText") return null;
  // The match must begin at the block's own text start ("^"-anchored finds
  // resolve here whenever the docBlockText is the first thing matched).
  if (range.from !== $start.start()) return null;
  if ($start.depth < 1) return null;
  const container = $start.node(-1);
  if (container.type.name !== "docParagraph") return null;
  return { container, containerPos: $start.before(-1), textStart: $start.start() };
}

type AttrsOption =
  | Record<string, unknown>
  | ((match: RegExpMatchArray) => Record<string, unknown>)
  | undefined;

function resolveAttrs(attrs: AttrsOption, match: RegExpMatchArray): Record<string, unknown> {
  if (typeof attrs === "function") return attrs(match);
  return attrs ?? {};
}

/**
 * Paragraph -> other text-block conversion (heading, list item, quote,
 * callout): same "docBlockText block*" content shape on both sides, so a
 * setNodeMarkup retype keeps the text, any nested children, and the blockId
 * attr in place — diffToOps sees a type change on the same block.
 */
export function textBlockConvertRule(config: {
  find: RegExp;
  typeName: string;
  getAttributes?: AttrsOption;
}): InputRule {
  return new InputRule({
    find: config.find,
    handler: ({ state, range, match }) => {
      const ctx = paragraphContext(state, range);
      if (!ctx) return null;
      const type = state.schema.nodes[config.typeName];
      if (!type) return null;
      state.tr
        .delete(range.from, range.to)
        .setNodeMarkup(ctx.containerPos, type, {
          ...ctx.container.attrs,
          ...resolveAttrs(config.getAttributes, match),
        });
    },
  });
}

/**
 * Paragraph -> docCodeBlock conversion ("```lang" + space/newline). The code
 * block's content is flat `text*` (no docBlockText wrapper), so this is a
 * node REPLACEMENT carrying over any text that followed the fence. Only
 * fires on a paragraph with no nested block children (they have no home in
 * a code block).
 */
export function codeBlockConvertRule(config: {
  find: RegExp;
  typeName?: string;
  getAttributes?: AttrsOption;
}): InputRule {
  return new InputRule({
    find: config.find,
    handler: ({ state, range, match }) => {
      const ctx = paragraphContext(state, range);
      if (!ctx || ctx.container.childCount !== 1) return null;
      const type = state.schema.nodes[config.typeName ?? "docCodeBlock"];
      if (!type) return null;
      const blockText = ctx.container.child(0);
      const textAfter = blockText.textBetween(range.to - ctx.textStart, blockText.content.size);
      const node = type.create(
        { ...ctx.container.attrs, ...resolveAttrs(config.getAttributes, match) },
        textAfter ? state.schema.text(textAfter) : undefined,
      );
      const tr = state.tr.replaceWith(
        ctx.containerPos,
        ctx.containerPos + ctx.container.nodeSize,
        node,
      );
      tr.setSelection(TextSelection.create(tr.doc, ctx.containerPos + 1));
    },
  });
}

/**
 * Paragraph -> atom leaf replacement ("---" -> docDivider). Notion-style:
 * the trigger line is replaced by the atom plus a fresh empty paragraph, and
 * the cursor lands in that paragraph. Only fires when the paragraph holds
 * nothing but the trigger text.
 */
export function atomReplaceRule(config: { find: RegExp; typeName: string }): InputRule {
  return new InputRule({
    find: config.find,
    handler: ({ state, range }) => {
      const ctx = paragraphContext(state, range);
      if (!ctx || ctx.container.childCount !== 1) return null;
      const blockText = ctx.container.child(0);
      if (blockText.content.size !== range.to - ctx.textStart) return null;
      const type = state.schema.nodes[config.typeName];
      if (!type) return null;
      const atom = type.create();
      const paragraph = state.schema.nodes.docParagraph.create(
        undefined,
        state.schema.nodes.docBlockText.create(),
      );
      const tr = state.tr.replaceWith(
        ctx.containerPos,
        ctx.containerPos + ctx.container.nodeSize,
        [atom, paragraph],
      );
      tr.setSelection(TextSelection.create(tr.doc, ctx.containerPos + atom.nodeSize + 2));
    },
  });
}
