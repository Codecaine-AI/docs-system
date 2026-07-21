"use client";

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { Fragment, Slice } from "@tiptap/pm/model";
import { canSplit } from "@tiptap/pm/transform";
import { NODE_TYPE_TO_BLOCK_TYPE } from "../core/schema";

/**
 * Block-aware paste (R2-D16). The doc schema gives every text block a
 * `block*` child slot (the "docBlockText block*" shape, schema.ts), so PM's
 * default `replaceSelection` fitting NESTS pasted sibling blocks inside the
 * caret's paragraph — a band-selected run (heading + paragraphs + callout)
 * copied in one doc and pasted in another came back as ONE paragraph whose
 * text swallowed the heading and whose `block*` slot swallowed the rest
 * (Ford's repro: layout gone, everything merged). The clipboard HTML itself
 * was fine — the slice parsed back with every block intact — structure died
 * only at the fit.
 *
 * This plugin intercepts paste for slices that are a RUN OF DOC BLOCKS and
 * inserts them at the TOP LEVEL instead (the same clamping handleDrop in
 * drag-select.ts applies to block drops):
 *
 * - a closed slice of block nodes (band copy via drag-select's
 *   `transformCopied`, a grip NodeSelection copy, cross-page paste of
 *   either), OR an open slice with MULTIPLE block children (a native text
 *   selection spanning blocks, external multi-paragraph HTML) — every child
 *   is a complete PM node, so the run inserts as whole blocks: count, types,
 *   props, and heading levels survive.
 * - anything else (inline text, a partial single-block selection) keeps PM's
 *   default merge-into-the-caret behavior untouched.
 *
 * Insertion point, Notion semantics: an empty caret block is REPLACED by the
 * run; at a block's very start/end the run lands before/after it; mid-text
 * splits the block around the run; a caret nested deeper (callout child,
 * atom/code interior) puts the run after the whole top-level block.
 */

/** The pasted slice's children as a run of complete top-level doc blocks, or null when this paste is not block-shaped (defer to PM). */
export function blockRun(slice: Slice): Fragment | null {
  const { content } = slice;
  if (content.childCount === 0) return null;
  for (let i = 0; i < content.childCount; i++) {
    if (!(content.child(i).type.name in NODE_TYPE_TO_BLOCK_TYPE)) return null;
  }
  // Open single-child slices are partial text selections within one block —
  // PM's text merge is the right paste for those. Multi-child slices carry
  // complete sibling nodes even when open at the ends.
  const closed = slice.openStart === 0 && slice.openEnd === 0;
  return closed || content.childCount > 1 ? content : null;
}

/**
 * The transaction pasting `slice` as whole top-level blocks, or null when
 * the slice is not a block run (caller falls through to PM's default paste).
 * Exported for tests — this is the entire R2-D16 paste semantic.
 */
export function pasteBlocksTr(state: EditorState, slice: Slice): Transaction | null {
  const blocks = blockRun(slice);
  if (!blocks) return null;
  let tr = state.tr;
  if (!state.selection.empty) tr = tr.deleteSelection();
  const $caret = tr.selection.$from;
  let insertPos: number;
  if ($caret.depth === 0) {
    insertPos = $caret.pos;
  } else {
    const blockStart = $caret.before(1);
    const blockEnd = $caret.after(1);
    const topBlock = $caret.node(1);
    const emptyTextBlock =
      topBlock.childCount === 1 &&
      topBlock.child(0).type.name === "docBlockText" &&
      topBlock.child(0).content.size === 0;
    if (emptyTextBlock) {
      // Pasting into an empty block replaces it (Notion).
      tr = tr.replaceWith(blockStart, blockEnd, blocks);
      return tr
        .setSelection(TextSelection.near(tr.doc.resolve(blockStart + blocks.size), -1))
        .scrollIntoView();
    }
    if ($caret.pos <= blockStart + $caret.depth) {
      // Only opening boundaries before the caret: the run goes above.
      insertPos = blockStart;
    } else if ($caret.pos >= blockEnd - $caret.depth) {
      // Only closing boundaries after the caret: the run goes below.
      insertPos = blockEnd;
    } else if ($caret.depth === 2 && $caret.index(1) === 0 && canSplit(tr.doc, $caret.pos, 2)) {
      // Mid-text in the block's own wrapper: split the block around the run.
      tr = tr.split($caret.pos, 2);
      insertPos = tr.selection.$from.before(1);
    } else {
      // Nested caret (callout child, code/atom interior): after the block.
      insertPos = blockEnd;
    }
  }
  tr = tr.insert(insertPos, blocks);
  return tr
    .setSelection(TextSelection.near(tr.doc.resolve(insertPos + blocks.size), -1))
    .scrollIntoView();
}

export const DocBlockPaste = Extension.create({
  name: "docBlockPaste",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("docBlockPaste"),
        props: {
          handlePaste(view, _event, slice) {
            const tr = pasteBlocksTr(view.state, slice);
            if (!tr) return false;
            view.dispatch(tr.setMeta("paste", true).setMeta("uiEvent", "paste"));
            return true;
          },
        },
      }),
    ];
  },
});
