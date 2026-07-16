"use client";

import { Extension } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/**
 * AFFiNE/Notion-style drag grip for reordering top-level blocks (Ford,
 * dogfood review 2026-07-16). A `⠿` handle floats to the LEFT of the block
 * under the pointer; dragging it hands the block to ProseMirror's NATIVE
 * node-drag machinery (`view.dragging` + the StarterKit dropCursor already
 * registered in DocEditor), so drop targeting, schema validation, and the
 * actual move are all stock PM — this extension only owns hover tracking
 * and the grip element itself.
 *
 * Deliberately dependency-free: TipTap's official drag-handle extension
 * hard-imports the collaboration/yjs stack (~100KB) for functionality this
 * editor doesn't use.
 *
 * v1 scope: TOP-LEVEL blocks only (the grip appears for the outermost block
 * under the pointer; nested list items reorder via Tab/Shift-Tab). The grip
 * hides on scroll, on typing, and outside the editor. Grabbing it sets a
 * NodeSelection on the block — which also gives the block the
 * `.ProseMirror-selectednode` highlight (soft blue, index.css) while it is
 * being dragged.
 */

export const docDragHandlePluginKey = new PluginKey("docDragHandle");

/** Grip glyph: a 2x3 dot grid, drawn as inline SVG so it inherits currentColor. */
const GRIP_SVG = `<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="2.5" cy="3" r="1.3"/><circle cx="7.5" cy="3" r="1.3"/>
  <circle cx="2.5" cy="8" r="1.3"/><circle cx="7.5" cy="8" r="1.3"/>
  <circle cx="2.5" cy="13" r="1.3"/><circle cx="7.5" cy="13" r="1.3"/>
</svg>`;

/** Horizontal gap between the grip's right edge and the block's left edge — fallback when the host sets no --docs-grip-gap. */
const GRIP_GAP_PX = 12;

/** Vertical offset from the block's top — fallback when the host sets no --docs-grip-offset-y. */
const GRIP_TOP_OFFSET_PX = 6;

/** Fallback fade duration when the host sets no --docs-grip-fade; the handoff timer adds a small beat on top so the fade-out completes before repositioning. */
const GRIP_FADE_MS = 100;
const GRIP_FADE_BEAT_MS = 10;

/** The active fade duration: the --docs-grip-fade var (e.g. "180ms") when set, the fallback otherwise. */
function gripFadeMs(element: HTMLElement): number {
  const value = Number.parseFloat(
    window.getComputedStyle(element).getPropertyValue("--docs-grip-fade"),
  );
  return Number.isFinite(value) ? value : GRIP_FADE_MS;
}

/** A host-tunable pixel offset: the CSS var when set (docs-workbench style rail), the baked-in fallback otherwise. */
function pixelVar(element: HTMLElement, name: string, fallback: number): number {
  const value = Number.parseFloat(window.getComputedStyle(element).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

/** The top-level block element under the pointer: the ancestor of `target` that is a DIRECT child of the editor root. Null when the pointer isn't over block content. */
function topLevelBlockElement(view: EditorView, target: EventTarget | null): HTMLElement | null {
  let element = target instanceof Element ? target : null;
  if (!element || !view.dom.contains(element)) return null;
  while (element.parentElement && element.parentElement !== view.dom) {
    element = element.parentElement;
  }
  return element.parentElement === view.dom ? (element as HTMLElement) : null;
}

class DragHandleView {
  private readonly handle: HTMLElement;
  private readonly container: HTMLElement;
  private blockPos: number | null = null;
  private blockElement: HTMLElement | null = null;
  private moveTimer: number | null = null;

  constructor(private readonly view: EditorView) {
    // Where the handle LIVES only needs to be outside PM's own DOM (PM
    // strips foreign children of view.dom); where it POSITIONS from is its
    // `offsetParent`, resolved fresh on every show (onMouseMove) — at
    // construction time React may not have attached view.dom under
    // DocEditor's relative wrapper yet, so nothing ancestor-dependent may
    // be cached here.
    this.container = view.dom.parentElement ?? view.dom;
    this.handle = document.createElement("div");
    this.handle.className = "docs-drag-handle";
    this.handle.draggable = true;
    this.handle.innerHTML = GRIP_SVG;
    this.handle.setAttribute("data-docs-drag-handle", "true");
    this.container.appendChild(this.handle);

    view.dom.addEventListener("mousemove", this.onMouseMove);
    view.dom.addEventListener("keydown", this.hide);
    this.container.addEventListener("mouseleave", this.onContainerLeave);
    this.handle.addEventListener("click", this.onClick);
    this.handle.addEventListener("dragstart", this.onDragStart);
    this.handle.addEventListener("dragend", this.hide);
    window.addEventListener("scroll", this.hide, true);
  }

  private onMouseMove = (event: MouseEvent) => {
    if (!this.view.editable) {
      this.hide();
      return;
    }
    const block = topLevelBlockElement(this.view, event.target);
    if (!block) return; // keep the current grip while over gaps/margins
    if (block === this.blockElement) return;
    let pos: number;
    try {
      // Position at the very start INSIDE the block element, minus one =
      // the position OF the block node itself.
      pos = this.view.posAtDOM(block, 0) - 1;
    } catch {
      return;
    }
    if (pos < 0 || pos >= this.view.state.doc.content.size) return;
    const node = this.view.state.doc.nodeAt(pos);
    if (!node) return;
    this.blockPos = pos;
    this.blockElement = block;
    if (this.moveTimer !== null) {
      window.clearTimeout(this.moveTimer);
      this.moveTimer = null;
    }
    if (this.handle.classList.contains("docs-drag-handle-visible")) {
      // Block-to-block move: fade OUT where it was, then reappear at the
      // new block — never slide (Ford: too much motion) and never teleport
      // while visible. pointer-events die with the class, so nothing is
      // clickable mid-fade.
      this.handle.classList.remove("docs-drag-handle-visible");
      this.moveTimer = window.setTimeout(() => {
        this.moveTimer = null;
        if (this.blockElement) this.showAt(this.blockElement);
      }, gripFadeMs(this.handle) + GRIP_FADE_BEAT_MS);
    } else {
      this.showAt(block);
    }
  };

  /** Position beside `block` and fade in. */
  private showAt(block: HTMLElement) {
    const blockRect = block.getBoundingClientRect();
    // Absolute coordinates resolve against the nearest POSITIONED ancestor
    // (DocEditor's relative wrapper), not the element the handle happens to
    // be appended to — so measure the offsetParent. The hidden state keeps
    // the element in the layer, so offsetParent stays readable.
    const anchor = (this.handle.offsetParent as HTMLElement | null) ?? this.container;
    const anchorRect = anchor.getBoundingClientRect();
    const gap = pixelVar(this.handle, "--docs-grip-gap", GRIP_GAP_PX);
    const topOffset = pixelVar(this.handle, "--docs-grip-offset-y", GRIP_TOP_OFFSET_PX);
    this.handle.style.top = `${blockRect.top - anchorRect.top + topOffset}px`;
    this.handle.style.left = `${blockRect.left - anchorRect.left - this.handle.offsetWidth - gap}px`;
    this.handle.classList.add("docs-drag-handle-visible");
  }

  private onContainerLeave = (event: MouseEvent) => {
    // Moving FROM the doc ONTO the grip must not hide it.
    if (event.relatedTarget instanceof Element && this.handle.contains(event.relatedTarget)) {
      return;
    }
    this.hide();
  };

  /** Plain click (no drag): select the block — NodeSelection gives it the highlight fill. */
  private onClick = () => {
    if (this.blockPos === null) return;
    const { state } = this.view;
    if (this.blockPos >= state.doc.content.size || !state.doc.nodeAt(this.blockPos)) return;
    this.view.focus();
    this.view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, this.blockPos)));
  };

  private onDragStart = (event: DragEvent) => {
    if (this.blockPos === null || !event.dataTransfer) return;
    const { state } = this.view;
    if (this.blockPos >= state.doc.content.size || !state.doc.nodeAt(this.blockPos)) return;
    const selection = NodeSelection.create(state.doc, this.blockPos);
    this.view.dispatch(state.tr.setSelection(selection));
    // Handing PM the dragged slice makes its own drop handler perform a
    // schema-validated MOVE (with dropCursor targeting) — no custom drop
    // logic anywhere.
    this.view.dragging = { slice: selection.content(), move: true };
    event.dataTransfer.effectAllowed = "copyMove";
    // Some browsers cancel drags carrying no data at all.
    event.dataTransfer.setData("text/plain", "​");
    if (this.blockElement) event.dataTransfer.setDragImage(this.blockElement, 0, 0);
    // Notion feel: while in flight the source block dims instead of
    // highlighting (index.css keys off this class); the highlight lands
    // with the drop, when dragend's hide() removes it and the mapped
    // NodeSelection shows through.
    this.view.dom.classList.add("docs-block-dragging");
  };

  private hide = () => {
    if (this.moveTimer !== null) {
      window.clearTimeout(this.moveTimer);
      this.moveTimer = null;
    }
    this.view.dom.classList.remove("docs-block-dragging");
    this.handle.classList.remove("docs-drag-handle-visible");
    this.blockPos = null;
    this.blockElement = null;
  };

  destroy() {
    this.view.dom.removeEventListener("mousemove", this.onMouseMove);
    this.view.dom.removeEventListener("keydown", this.hide);
    this.handle.removeEventListener("click", this.onClick);
    this.container.removeEventListener("mouseleave", this.onContainerLeave);
    window.removeEventListener("scroll", this.hide, true);
    this.handle.remove();
  }
}

export const DocDragHandle = Extension.create({
  name: "docDragHandle",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: docDragHandlePluginKey,
        view: (editorView) => new DragHandleView(editorView),
      }),
    ];
  },
});
