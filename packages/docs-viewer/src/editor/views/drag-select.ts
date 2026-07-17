"use client";

import { Extension } from "@tiptap/core";
import {
  NodeSelection,
  Plugin,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import type { Node as PMNode, Slice } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { topLevelBlockPos } from "./drag-handle";
import { dragSelectPluginKey, type DragSelectRange } from "./drag-select-state";

/**
 * Notion-style drag select (Ford, dogfood round 2): hold the mouse down
 * anywhere that is not text or an embed — the page margins around the
 * content column, gaps between blocks, the empty run-out beside a line's
 * text — and drag: a screenshot-style rectangle draws from the press point,
 * and every top-level block it touches joins a contiguous multi-block
 * selection (soft highlight via node decorations,
 * `.docs-block-multi-selected` — same look as the grip's NodeSelection).
 * Presses ON text stay ProseMirror's native text selection; presses on
 * embeds/node views stay the block's own interactions. The listener sits on
 * the editor's scroll region (nearest scrollable ancestor), so the band can
 * start well outside the editor column, exactly like Notion.
 *
 * Grabbing the grip of any selected block then moves the WHOLE range in one
 * drag (drag-handle.ts reads the range; handleDrop below performs the
 * schema-safe range move). Escape or clicking clears; Backspace/Delete
 * removes the selected blocks; any edit clears the selection.
 *
 * The rectangle's color/opacity are style-rail knobs
 * (--docs-dragselect-color / --docs-dragselect-opacity, index.css).
 */

/** Drag distance (px) below which a background press stays a plain click. */
const DRAG_THRESHOLD_PX = 4;

type ViewportRect = { left: number; top: number; right: number; bottom: number };

/** Normalized viewport rect spanning two pointer positions. */
export function normalizedRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
): ViewportRect {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  };
}

/**
 * The contiguous top-level block range intersecting `rect` (viewport
 * coordinates), or null when no block is touched. Top-level blocks stack
 * vertically, so the min/max span of the hit blocks IS the contiguous run.
 */
export function blockRangeForRect(
  view: EditorView,
  rect: ViewportRect,
): { from: number; to: number } | null {
  let from: number | null = null;
  let to: number | null = null;
  for (const child of Array.from(view.dom.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const box = child.getBoundingClientRect();
    const hit =
      box.left < rect.right && box.right > rect.left && box.top < rect.bottom && box.bottom > rect.top;
    if (!hit) continue;
    const pos = topLevelBlockPos(view, child);
    if (pos === null) continue;
    const node = view.state.doc.nodeAt(pos);
    if (!node) continue;
    if (from === null || pos < from) from = pos;
    if (to === null || pos + node.nodeSize > to) to = pos + node.nodeSize;
  }
  return from !== null && to !== null ? { from, to } : null;
}

/**
 * The nearest TOP-LEVEL boundary to `pos` — where dropped blocks may land.
 * The doc schema gives every text block a `block*` child slot, so PM's own
 * dropPoint happily nests a dropped block INSIDE a heading or paragraph
 * (the "Solution staircase", Ford 2026-07-17). Block drops always reorder
 * at the top level instead: snap to whichever edge of the containing
 * top-level block is closer.
 */
export function topLevelDropPos(doc: PMNode, pos: number): number {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  if ($pos.depth === 0) return $pos.pos;
  const before = $pos.before(1);
  const after = $pos.after(1);
  return $pos.pos - before <= after - $pos.pos ? before : after;
}

/**
 * The transaction that moves the range's blocks to `dropPos` (both in the
 * PRE-move doc), leaving the moved run selected. Null when the drop lands
 * inside the dragged range (a no-op move). Exported for tests — this is the
 * whole semantic of a multi-block grip drop.
 */
export function moveRangeTr(
  state: EditorState,
  range: { from: number; to: number },
  dropPos: number,
): Transaction | null {
  const slice = state.doc.slice(range.from, range.to);
  const target = topLevelDropPos(state.doc, dropPos);
  if (target >= range.from && target <= range.to) return null;
  const tr = state.tr.delete(range.from, range.to);
  const mapped = tr.mapping.map(target);
  tr.insert(mapped, slice.content);
  tr.setMeta(dragSelectPluginKey, {
    from: mapped,
    to: mapped + slice.content.size,
    dragging: false,
  } satisfies DragSelectRange);
  return tr;
}

/**
 * The transaction for a SINGLE closed block-slice drop (a grip drag):
 * top-level-clamped reorder with the dropped block left node-selected —
 * PM's native drop handling minus the nesting. Null when the drop is a
 * no-op (inside the dragged block itself). Exported for tests.
 */
export function dropBlockSliceTr(
  state: EditorState,
  slice: Slice,
  dropPos: number,
  moved: boolean,
): Transaction | null {
  const target = topLevelDropPos(state.doc, dropPos);
  let tr = state.tr;
  if (moved) {
    // The grip put a NodeSelection on the dragged block; dropping onto
    // yourself is a no-op, and the move deletes the source via selection.
    const { from, to } = state.selection;
    if (target >= from && target <= to) return null;
    tr = tr.deleteSelection();
  }
  const mapped = tr.mapping.map(target);
  tr = tr.insert(mapped, slice.content);
  const dropped = tr.doc.nodeAt(mapped);
  if (dropped) tr = tr.setSelection(NodeSelection.create(tr.doc, mapped));
  return tr;
}

/** Selectors whose press must never start the band: real controls and floating editor UI. */
const BAND_EXCLUDED_SELECTOR =
  'button, a, input, textarea, select, [role="button"], [data-docs-drag-handle], [data-docs-drag-select-rect]';

/**
 * Whether a press at `target` should start the rubber band. Exported for
 * tests. Not band material: controls/floating UI; the editor's own TEXT
 * (native text selection) and node views (the block's own interactions);
 * and — outside the editor — anything contentEditable, i.e. editable page
 * furniture like DocPage's click-to-rename title, whose caret the band's
 * preventDefault was swallowing (Ford, R2-D12 follow-up). The PM root is
 * itself contentEditable, so that check only applies OUTSIDE view.dom.
 */
export function shouldStartBand(view: EditorView, target: Element): boolean {
  if (target.closest(BAND_EXCLUDED_SELECTOR)) return false;
  if (view.dom.contains(target)) {
    return !(
      target.closest('span[data-doc-node="docBlockText"]') ||
      target.closest("[data-node-view-wrapper]")
    );
  }
  return !target.closest('[contenteditable="true"]');
}

/** Rubber-band DOM machinery: the rectangle element + pointer tracking. */
class DragSelectView {
  private readonly rectEl: HTMLElement;
  private readonly pressRegion: HTMLElement | Document;
  private anchor: { x: number; y: number } | null = null;
  private active = false;

  constructor(private readonly view: EditorView) {
    // The rectangle lives on <body> with fixed positioning: it must draw
    // over the page margins outside the content column without being
    // clipped by the scroll region's overflow.
    this.rectEl = document.createElement("div");
    this.rectEl.className = "docs-drag-select-rect";
    this.rectEl.style.display = "none";
    this.rectEl.setAttribute("data-docs-drag-select-rect", "true");
    document.body.appendChild(this.rectEl);
    // Listen on the nearest scrollable ancestor (the doc page's scroll
    // region), so margin presses left/right of the column start the band
    // too — pressing exactly on the editor element almost never happens.
    this.pressRegion = findScrollRegion(view.dom);
    this.pressRegion.addEventListener("mousedown", this.onMouseDown as EventListener);
    // A cancelled grip range-drag (Escape mid-flight) never reaches
    // handleDrop — the dragging flag must not stay stuck.
    window.addEventListener("dragend", this.onDragEnd);
  }

  private onMouseDown = (event: MouseEvent) => {
    if (!this.view.editable || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    // Controls and floating UI: hands off entirely — notably the grip,
    // whose press must KEEP the multi-selection it is about to drag.
    if (target.closest(BAND_EXCLUDED_SELECTOR)) return;
    if (shouldStartBand(this.view, target)) {
      // Page margins, gaps, the empty run-out beside a line. preventDefault
      // keeps the browser/PM from starting a text drag-selection underneath
      // the rectangle; a plain click's caret placement is re-dispatched on
      // mouseup instead.
      event.preventDefault();
      this.anchor = { x: event.clientX, y: event.clientY };
      this.active = false;
      window.addEventListener("mousemove", this.onMouseMove);
      window.addEventListener("mouseup", this.onMouseUp);
      return;
    }
    // Editor text, node views, editable page furniture (the rename title):
    // native behavior, and an existing multi-selection dissolves (Notion
    // feel).
    if (dragSelectPluginKey.getState(this.view.state)) this.setRange(null);
  };

  private onMouseMove = (event: MouseEvent) => {
    if (!this.anchor) return;
    if (
      !this.active &&
      Math.hypot(event.clientX - this.anchor.x, event.clientY - this.anchor.y) < DRAG_THRESHOLD_PX
    ) {
      return;
    }
    this.active = true;
    const rect = normalizedRect(this.anchor, { x: event.clientX, y: event.clientY });
    this.showRect(rect);
    const range = blockRangeForRect(this.view, rect);
    this.setRange(range ? { ...range, dragging: false } : null);
  };

  private onMouseUp = () => {
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    const anchor = this.anchor;
    const wasActive = this.active;
    this.anchor = null;
    this.active = false;
    this.rectEl.style.display = "none";
    if (wasActive || !anchor) return;
    // Plain click (below the drag threshold): clear any selection, and when
    // the press was within the editor column, hand the caret back — the
    // mousedown preventDefault suppressed PM's own placement. Margin clicks
    // just deselect (Notion feel).
    this.setRange(null);
    const editorRect = this.view.dom.getBoundingClientRect();
    if (anchor.x < editorRect.left || anchor.x > editorRect.right) return;
    const coords = this.view.posAtCoords({ left: anchor.x, top: anchor.y });
    if (!coords) return;
    const selection = TextSelection.near(this.view.state.doc.resolve(coords.pos));
    this.view.dispatch(this.view.state.tr.setSelection(selection));
    this.view.focus();
  };

  private onDragEnd = () => {
    const range = dragSelectPluginKey.getState(this.view.state);
    if (range?.dragging) this.setRange({ ...range, dragging: false });
  };

  private showRect(rect: ViewportRect) {
    // Fixed positioning on <body>: viewport coordinates go on unchanged.
    this.rectEl.style.display = "block";
    this.rectEl.style.left = `${rect.left}px`;
    this.rectEl.style.top = `${rect.top}px`;
    this.rectEl.style.width = `${rect.right - rect.left}px`;
    this.rectEl.style.height = `${rect.bottom - rect.top}px`;
  }

  private setRange(range: DragSelectRange | null) {
    const current = dragSelectPluginKey.getState(this.view.state) ?? null;
    if (
      current === range ||
      (current &&
        range &&
        current.from === range.from &&
        current.to === range.to &&
        current.dragging === range.dragging)
    ) {
      return;
    }
    this.view.dispatch(this.view.state.tr.setMeta(dragSelectPluginKey, range));
  }

  destroy() {
    this.pressRegion.removeEventListener("mousedown", this.onMouseDown as EventListener);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("dragend", this.onDragEnd);
    this.rectEl.remove();
  }
}

/**
 * The nearest scrollable ancestor of the editor — the doc page's scroll
 * region, whose full width (margins included) is drag-select territory.
 * Document fallback covers hosts with window-level scrolling.
 */
function findScrollRegion(start: HTMLElement): HTMLElement | Document {
  let element: HTMLElement | null = start.parentElement;
  while (element) {
    const overflowY = window.getComputedStyle(element).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return element;
    element = element.parentElement;
  }
  return start.ownerDocument;
}

export const DocDragSelect = Extension.create({
  name: "docDragSelect",

  // Keymaps sort by priority (higher first): the Escape/Backspace/Delete
  // guards below must see the event before the base keymap's own handlers.
  // They return false when no range is active, so nothing else changes.
  priority: 200,

  addKeyboardShortcuts() {
    const deleteRange = () => {
      const range = dragSelectPluginKey.getState(this.editor.state);
      if (!range) return false;
      this.editor.view.dispatch(
        this.editor.state.tr.delete(range.from, range.to).setMeta(dragSelectPluginKey, null),
      );
      return true;
    };
    return {
      Escape: () => {
        const range = dragSelectPluginKey.getState(this.editor.state);
        if (!range) return false;
        this.editor.view.dispatch(this.editor.state.tr.setMeta(dragSelectPluginKey, null));
        return true;
      },
      Backspace: deleteRange,
      Delete: deleteRange,
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: dragSelectPluginKey,
        state: {
          init: () => null,
          apply(tr, value: DragSelectRange | null): DragSelectRange | null {
            const meta = tr.getMeta(dragSelectPluginKey) as DragSelectRange | null | undefined;
            if (meta !== undefined) return meta;
            if (!value) return null;
            // Any edit outside our own metas dissolves the selection — the
            // range positions would be stale against the new doc.
            if (tr.docChanged) return null;
            return value;
          },
        },
        props: {
          decorations(state) {
            const range = dragSelectPluginKey.getState(state);
            if (!range) return null;
            const decorations: Decoration[] = [];
            state.doc.forEach((node, offset) => {
              if (offset >= range.from && offset + node.nodeSize <= range.to) {
                decorations.push(
                  Decoration.node(offset, offset + node.nodeSize, {
                    class: "docs-block-multi-selected",
                  }),
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
          handleDrop(view, event, slice, moved) {
            const range = dragSelectPluginKey.getState(view.state);
            if (range?.dragging && moved) {
              const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
              const tr = coords ? moveRangeTr(view.state, range, coords.pos) : null;
              view.dispatch(
                tr ?? view.state.tr.setMeta(dragSelectPluginKey, { ...range, dragging: false }),
              );
              return true;
            }
            // Single CLOSED block slices (grip drags): clamp the insertion
            // to a top-level gap ourselves — PM's native drop would nest
            // into a text block's block* slot. Open slices (native text
            // drags) keep PM's handling untouched.
            if (
              slice.openStart !== 0 ||
              slice.openEnd !== 0 ||
              !slice.content.childCount ||
              !slice.content.firstChild?.isBlock
            ) {
              return false;
            }
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (!coords) return false;
            const tr = dropBlockSliceTr(view.state, slice, coords.pos, moved);
            if (tr) view.dispatch(tr);
            return true;
          },
        },
        view: (editorView) => new DragSelectView(editorView),
      }),
    ];
  },
});
