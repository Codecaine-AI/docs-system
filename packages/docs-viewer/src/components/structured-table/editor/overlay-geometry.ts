"use client";

import type { Rect } from "./geometry";
import { HEADER_ROW, type CellPosition } from "./TableGrid";

/**
 * DOM-touching geometry for the structured-table overlay furniture (handles,
 * selection rect, drop indicator). Pure index math stays in geometry.ts —
 * everything here measures live elements against the surface div so overlays
 * can be absolutely positioned inside it.
 *
 * The registry maps `"row:col"` (header row = HEADER_ROW) to the EditableCell
 * content element registered by TableGrid; measurements always use the
 * enclosing th/td box so cell padding is included.
 */
export type CellRectMap = Map<string, HTMLElement>;

export function cellRectKey(row: number, col: number): string {
  return `${row}:${col}`;
}

/** The th/td box for a registered cell content element (falls back to the element itself). */
export function cellBoxElement(element: HTMLElement): HTMLElement {
  return (element.closest("th,td") as HTMLElement | null) ?? element;
}

/** `element`'s border box in `surface`-relative coordinates. */
export function relativeRect(surface: Element, element: Element): Rect {
  const surfaceRect = surface.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left - surfaceRect.left,
    top: rect.top - surfaceRect.top,
    width: rect.width,
    height: rect.height,
  };
}

/** Surface-relative rect of the th/td at (row, col), or null when unregistered. */
export function cellRect(
  cells: CellRectMap,
  surface: Element,
  row: number,
  col: number,
): Rect | null {
  const element = cells.get(cellRectKey(row, col));
  return element ? relativeRect(surface, cellBoxElement(element)) : null;
}

/**
 * Surface-relative rects for every registered cell in the inclusive
 * anchor→head range (rows may include HEADER_ROW). Feed the result to
 * `unionRect` for the selection overlay / drag region rect.
 */
export function rangeRects(
  cells: CellRectMap,
  surface: Element,
  anchor: CellPosition,
  head: CellPosition,
): Rect[] {
  const rects: Rect[] = [];
  const rowLo = Math.min(anchor.row, head.row);
  const rowHi = Math.max(anchor.row, head.row);
  const colLo = Math.min(anchor.col, head.col);
  const colHi = Math.max(anchor.col, head.col);
  for (let row = rowLo; row <= rowHi; row++) {
    for (let col = colLo; col <= colHi; col++) {
      const rect = cellRect(cells, surface, row, col);
      if (rect) rects.push(rect);
    }
  }
  return rects;
}

/**
 * Column boundary offsets for drag targeting: the left edge of each column's
 * header cell plus the final right edge (length columnCount + 1), in surface
 * coordinates. Null when any column is unmeasurable.
 */
export function columnOffsets(
  cells: CellRectMap,
  surface: Element,
  columnCount: number,
): number[] | null {
  const offsets: number[] = [];
  for (let col = 0; col < columnCount; col++) {
    const rect = cellRect(cells, surface, HEADER_ROW, col);
    if (!rect) return null;
    offsets.push(rect.left);
    if (col === columnCount - 1) offsets.push(rect.left + rect.width);
  }
  return offsets.length === columnCount + 1 ? offsets : null;
}

/**
 * Body-row boundary offsets (header excluded — it can't be reordered): the
 * top edge of each body row's first cell plus the final bottom edge, in
 * surface coordinates. Null when any row is unmeasurable.
 */
export function rowOffsets(
  cells: CellRectMap,
  surface: Element,
  rowCount: number,
): number[] | null {
  const offsets: number[] = [];
  for (let row = 0; row < rowCount; row++) {
    const rect = cellRect(cells, surface, row, 0);
    if (!rect) return null;
    offsets.push(rect.top);
    if (row === rowCount - 1) offsets.push(rect.top + rect.height);
  }
  return offsets.length === rowCount + 1 ? offsets : null;
}
