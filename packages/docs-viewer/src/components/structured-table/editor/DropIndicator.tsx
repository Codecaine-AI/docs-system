"use client";

import { cn } from "../../../ui/cn";
import type { Rect } from "./geometry";
import { HANDLE_ACCENT_BG_CLASS } from "./Handles";
import { paddedRectStyle } from "./SelectionOverlay";
import type { ReorderAxis } from "./use-reorder-drag";

/**
 * Reorder drop target line: 3px accent rule at a column/row boundary
 * (`gapPosition(offsets, slotIndex)`), spanning the table's full height
 * (column drag) or width (row drag) with a slight 4px overhang on each end.
 * Purely visual — `pointer-events-none`.
 */
export function DropIndicator({ axis, position }: { axis: ReorderAxis; position: number }) {
  const isColumn = axis === "column";
  return (
    <div
      contentEditable={false}
      data-table-drop-indicator={axis}
      className={cn(
        "pointer-events-none absolute z-[3] rounded-full",
        HANDLE_ACCENT_BG_CLASS,
        isColumn ? "-bottom-1 -top-1 w-[3px]" : "-left-1 -right-1 h-[3px]",
      )}
      style={isColumn ? { left: position - 1.5 } : { top: position - 1.5 }}
    />
  );
}

/**
 * Dims the column/row being dragged: a background wash fades the source
 * content to a ~40% feel (the floating DragPreview is the strong visual now),
 * with a faint accent tint on top so the region still reads as "in motion".
 * Expanded by the themed selection padding so it matches the selection
 * outline's footprint. Purely visual — `pointer-events-none`.
 */
export function DragRegionOverlay({ rect }: { rect: Rect | null }) {
  if (!rect) return null;
  return (
    <div
      contentEditable={false}
      data-table-drag-region=""
      className="pointer-events-none absolute z-40 rounded-sm"
      style={paddedRectStyle(rect)}
    >
      <div className="absolute inset-0 bg-background/60" />
      <div className={cn("absolute inset-0 rounded-sm opacity-10", HANDLE_ACCENT_BG_CLASS)} />
    </div>
  );
}
