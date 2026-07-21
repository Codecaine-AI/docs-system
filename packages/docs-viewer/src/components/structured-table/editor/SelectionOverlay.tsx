"use client";

import type { CSSProperties } from "react";
import type { Rect } from "./geometry";

/** Themed breathing room between a union rect and the cells it wraps. */
const SELECTION_PAD = "var(--docs-table-selection-pad, 3px)";

/**
 * Expands a measured union rect outward by `--docs-table-selection-pad` on
 * every side, as calc() strings — the themed padding resolves in CSS, so no
 * getComputedStyle read is needed. Shared by SelectionOverlay and
 * DragRegionOverlay; the drop-indicator line intentionally does NOT use it.
 */
export function paddedRectStyle(rect: Rect): CSSProperties {
  return {
    left: `calc(${rect.left}px - ${SELECTION_PAD})`,
    top: `calc(${rect.top}px - ${SELECTION_PAD})`,
    width: `calc(${rect.width}px + 2 * ${SELECTION_PAD})`,
    height: `calc(${rect.height}px + 2 * ${SELECTION_PAD})`,
  };
}

/**
 * Whole-column/row selection visual: ONE absolutely positioned rect (sized
 * via `unionRect` over the selected cells' boxes, expanded by the themed
 * selection padding so the outline never sits flush on cell text) with a 2px
 * accent border — no per-cell borders. Purely visual: `pointer-events-none`,
 * never editable.
 */
export function SelectionOverlay({ rect }: { rect: Rect | null }) {
  if (!rect) return null;
  return (
    <div
      contentEditable={false}
      data-table-selection-overlay=""
      className="pointer-events-none absolute z-[1] rounded-sm border-2 border-[color:var(--docs-editor-accent,#2383e2)]"
      style={paddedRectStyle(rect)}
    />
  );
}
