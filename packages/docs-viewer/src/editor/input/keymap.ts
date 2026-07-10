"use client";

import { Extension, type Editor } from "@tiptap/core";
import { TextSelection, type Selection, type Transaction } from "@tiptap/pm/state";
import { canSplit } from "@tiptap/pm/transform";
import type { Attrs, NodeType, Schema } from "@tiptap/pm/model";
import { BLOCK_TYPE_TO_NODE_TYPE, TEXT_BLOCK_TYPES } from "../core/schema";
import { slashMenuPluginKey } from "../menus/SlashMenu";
import { referenceMentionPluginKey } from "../menus/reference-node";

/**
 * Notion-style Enter/Backspace handling for the block editor (keyboard feel).
 *
 * Why this exists: every text-bearing block's content is
 * `"docBlockText block*"` (see schema.ts) — the inline text lives in a
 * mandatory wrapper textblock and the `block*` tail is the block's NESTED
 * children. ProseMirror's default `splitBlock` (TipTap's core Keymap Enter)
 * has no idea the `block*` slot means "children": pressing Enter at the end
 * of a heading happily creates the new paragraph INSIDE the heading's child
 * slot, so the new line renders inside the `<h1>` and persists as a nested
 * child block. And where the default split does stay sibling-level, the tail
 * inherits the head's node type, so typing after an H1 continues as H1.
 *
 * This extension takes over Enter/Backspace ONLY for selections it
 * understands and returns `false` everywhere else, so ProseMirror/TipTap
 * defaults (join-backward, node-selection handling, etc.) still apply — it
 * must never swallow keys it didn't handle.
 *
 * Behaviors (all Notion-modeled):
 * - Enter at the END of a text block inserts a plain sibling `docParagraph`
 *   AFTER the block (never into its `block*` child slot).
 * - Enter MID-text splits the block into two same-type siblings; the head
 *   keeps the original `blockId`, the tail gets `blockId: null` so a fresh
 *   id is minted on save (convert.ts's Enter-split contract — pmToDoc keeps
 *   the id on the first occurrence and mints for duplicates anyway; nulling
 *   the tail makes that explicit). Nested children ride with the tail.
 * - Enter at the START of a non-empty block inserts an empty paragraph
 *   ABOVE and leaves the original block (id, type, text) untouched.
 * - Enter in an EMPTY `docListItem` converts it to a paragraph in place
 *   (exit-list); a non-empty list item splits into a sibling list item
 *   carrying the same `ordered` attr.
 * - Enter inside `docCodeBlock` inserts a newline; Mod-Enter exits to a new
 *   paragraph sibling after the code block.
 * - Enter on a RANGED text selection deletes the range first, then applies
 *   the cursor rules above at the collapse point, all in ONE transaction
 *   (select-then-Enter replaces the selection with a block boundary, never
 *   nests — without this, PM's default range-split descends into the
 *   `block*` child slot exactly like the plain-Enter bug). A cross-block
 *   range collapses into the head block (PM's delete joins the compatible
 *   wrapper remainders), so the rules run there; if the collapse point is
 *   not a context we handle, the whole transaction is DISCARDED and the
 *   defaults see the original selection untouched.
 * - Backspace at the very start of a non-paragraph text block converts it
 *   to a paragraph in place, PRESERVING blockId/text/marks (Notion strips
 *   the block format before it ever deletes/joins).
 */

/** Node type names whose content is `"docBlockText block*"` (all text-bearing block types except code, which is a flat `text*` block). */
const WRAPPED_TEXT_NODE_NAMES: ReadonlySet<string> = new Set(
  TEXT_BLOCK_TYPES.filter((blockType) => blockType !== "code").map(
    (blockType) => BLOCK_TYPE_TO_NODE_TYPE[blockType],
  ),
);

/** Blocks Backspace-at-start converts to a paragraph (everything wrapped except the paragraph itself). */
const BACKSPACE_CONVERTIBLE_NODE_NAMES: ReadonlySet<string> = new Set(
  [...WRAPPED_TEXT_NODE_NAMES].filter((name) => name !== "docParagraph"),
);

/**
 * Resolves a selection's wrapper/block context, or null when it is not a
 * plain cursor inside a `docBlockText` wrapper of a known text block.
 */
function resolveWrapperCursor(selection: Selection) {
  if (!selection.empty || !(selection instanceof TextSelection)) return null;
  const { $from } = selection;
  if ($from.parent.type.name !== "docBlockText") return null;
  const blockDepth = $from.depth - 1;
  if (blockDepth < 1) return null; // defensive: a wrapper should never sit directly under `doc`
  const block = $from.node(blockDepth);
  if (!WRAPPED_TEXT_NODE_NAMES.has(block.type.name)) return null;
  return { $from, block, blockDepth };
}

/**
 * Appends to `tr` a split of the block holding `tr.selection`'s cursor into
 * two same-type siblings via `tr.split` with explicit `typesAfter`
 * (outermost first: the block, then its mandatory `docBlockText` wrapper).
 * The head keeps the original attrs (including `blockId`); the tail gets
 * `tailAttrs`. Trailing inline text — and any nested `block*` children,
 * which sit after the cursor within the block — move into the tail.
 */
function splitIntoSibling(
  tr: Transaction,
  schema: Schema,
  blockType: NodeType,
  tailAttrs: Attrs,
): boolean {
  const { $from } = tr.selection;
  const typesAfter = [
    { type: blockType, attrs: tailAttrs },
    { type: schema.nodes.docBlockText },
  ];
  if (!canSplit(tr.doc, $from.pos, 2, typesAfter)) return false;
  // Map the cursor through the split step ONLY (`slice` past any steps
  // already on the tr, e.g. a ranged-Enter's preceding delete) — bias
  // forward → start of the tail's wrapper.
  const stepsBefore = tr.steps.length;
  tr.split($from.pos, 2, typesAfter);
  tr.setSelection(
    TextSelection.near(tr.doc.resolve(tr.mapping.slice(stepsBefore).map($from.pos))),
  );
  return true;
}

/** Appends to `tr` an empty `docParagraph` (with its mandatory wrapper) at `pos`; cursor moves inside it when `focusInside` (otherwise the existing selection maps through the insert untouched). */
function insertEmptyParagraph(
  tr: Transaction,
  schema: Schema,
  pos: number,
  focusInside: boolean,
): boolean {
  const paragraph = schema.nodes.docParagraph.createAndFill({
    blockId: null,
    blockProps: {},
  });
  if (!paragraph) return false;
  tr.insert(pos, paragraph);
  if (focusInside) {
    // pos = start of the paragraph node; +1 enters the paragraph, +2 enters
    // its docBlockText wrapper (an empty textblock — a valid cursor spot).
    tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 2)));
  }
  return true;
}

/**
 * Applies the Enter rules at `tr.selection` (which must be a collapsed
 * cursor — either the original one or the collapse point of a just-deleted
 * range earlier on the same `tr`). Appends the mutation steps to `tr` and
 * returns whether it handled the position; on `false` the caller must
 * DISCARD `tr` undispatched so the defaults run against the original state.
 */
function applyEnterAtCursor(tr: Transaction, schema: Schema): boolean {
  const { selection } = tr;
  if (!selection.empty || !(selection instanceof TextSelection)) return false;
  const { $from } = selection;

  // Code block: Enter is a literal newline (Mod-Enter exits, see below).
  if ($from.parent.type.name === "docCodeBlock") {
    tr.insertText("\n");
    return true;
  }

  const cursor = resolveWrapperCursor(selection);
  if (!cursor) return false;
  const { block, blockDepth } = cursor;

  if (block.type.name === "docListItem") {
    if ($from.parent.content.size === 0) {
      // Empty list item: exit the list — convert to a paragraph in place
      // (id preserved; the save layer treats a block type change as
      // delete+insert with a fresh id, which is exactly right).
      tr.setNodeMarkup($from.before(blockDepth), schema.nodes.docParagraph, {
        blockId: block.attrs.blockId ?? null,
        blockProps: block.attrs.blockProps ?? {},
      });
      return true;
    }
    // Non-empty: split into a new sibling list item with the same `ordered`
    // block type; fresh identity (id minted on save).
    return splitIntoSibling(tr, schema, block.type, {
      blockId: null,
      blockProps: {},
      ordered: block.attrs.ordered ?? null,
    });
  }

  const atEnd = $from.parentOffset === $from.parent.content.size;
  if (atEnd) {
    // THE core fix: a plain paragraph sibling AFTER the block — never a
    // nested child in the block's `block*` slot, never a same-type tail.
    return insertEmptyParagraph(tr, schema, $from.after(blockDepth), true);
  }

  const atStart = $from.parentOffset === 0;
  if (atStart) {
    // Notion: Enter at the start pushes the block down — an empty paragraph
    // appears above and the original block (id, type, text) is untouched;
    // the cursor stays where it was.
    return insertEmptyParagraph(tr, schema, $from.before(blockDepth), false);
  }

  // Mid-text: same-type sibling split; tail keeps type + attrs (e.g. heading
  // `level`) but a null blockId so it mints a fresh id on save.
  return splitIntoSibling(tr, schema, block.type, { ...block.attrs, blockId: null });
}

function handleEnter(editor: Editor): boolean {
  const { state, view } = editor;
  // The slash menu / @-mention popovers own Enter while open (their plugins'
  // handleKeyDown executes the selected item). This keymap plugin sits ahead
  // of them in TipTap's plugin order, so it must yield explicitly or Enter
  // would insert a block instead of running the highlighted command.
  if (slashMenuPluginKey.getState(state)?.open) return false;
  if (referenceMentionPluginKey.getState(state)?.open) return false;
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return false;

  const tr = state.tr;
  if (!selection.empty) {
    // Ranged select-then-Enter: replace the selection with a block boundary.
    // Delete first (a cross-block range collapses into the head block, PM
    // joining the compatible wrapper remainders), then the cursor rules
    // below decide the boundary shape at the collapse point. Both live on
    // ONE transaction: single dispatch, single undo step — and if the
    // collapse point turns out not to be ours, the delete is discarded with
    // the rest and the defaults still see the original range.
    tr.deleteSelection();
  }
  if (!applyEnterAtCursor(tr, state.schema)) return false;
  view.dispatch(tr.scrollIntoView());
  return true;
}

/** Mod-Enter: exit a code block into a fresh paragraph sibling after it. */
function handleModEnter(editor: Editor): boolean {
  const { state, view } = editor;
  const { selection } = state;
  if (!selection.empty || !(selection instanceof TextSelection)) return false;
  const { $from } = selection;
  if ($from.parent.type.name !== "docCodeBlock") return false;
  const tr = state.tr;
  if (!insertEmptyParagraph(tr, state.schema, $from.after($from.depth), true)) return false;
  view.dispatch(tr.scrollIntoView());
  return true;
}

function handleBackspace(editor: Editor): boolean {
  const cursor = resolveWrapperCursor(editor.state.selection);
  if (!cursor) return false;
  const { $from, block, blockDepth } = cursor;
  // Only at the very start of the block's own text — and only for blocks
  // that HAVE a format to strip. A paragraph falls through to the default
  // join-backward.
  if ($from.parentOffset !== 0) return false;
  if (!BACKSPACE_CONVERTIBLE_NODE_NAMES.has(block.type.name)) return false;
  const { state, view } = editor;
  const tr = state.tr.setNodeMarkup($from.before(blockDepth), state.schema.nodes.docParagraph, {
    blockId: block.attrs.blockId ?? null,
    blockProps: block.attrs.blockProps ?? {},
  });
  view.dispatch(tr.scrollIntoView());
  return true;
}

export const DocKeymap = Extension.create({
  name: "docKeymap",
  addKeyboardShortcuts() {
    return {
      Enter: () => handleEnter(this.editor),
      "Mod-Enter": () => handleModEnter(this.editor),
      Backspace: () => handleBackspace(this.editor),
    };
  },
});
