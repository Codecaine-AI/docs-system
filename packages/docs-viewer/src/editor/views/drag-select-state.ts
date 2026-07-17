"use client";

import { PluginKey } from "@tiptap/pm/state";

/**
 * Shared state contract of the Notion-style drag-select (rubber-band block
 * selection, drag-select.ts). Lives in its own module so drag-handle.ts can
 * read the active range for multi-block grip drags without a circular
 * import (drag-select.ts imports position helpers FROM drag-handle.ts).
 *
 * `from`/`to` bound a CONTIGUOUS run of top-level blocks (block boundaries,
 * never inside a block). `dragging` is set while a grip drag is moving the
 * whole range — handleDrop in drag-select.ts keys off it.
 */
export type DragSelectRange = {
  from: number;
  to: number;
  dragging: boolean;
};

export const dragSelectPluginKey = new PluginKey<DragSelectRange | null>("docDragSelect");
