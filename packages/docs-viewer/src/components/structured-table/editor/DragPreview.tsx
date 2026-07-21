"use client";

import { cn } from "../../../ui/cn";
import type { ReorderAxis } from "./use-reorder-drag";

/**
 * Floating semi-transparent clone that follows the cursor during a reorder
 * drag (useReorderDrag): a simplified render of the dragged column (vertical
 * stack of its cell texts) or row (horizontal strip), sized from the measured
 * drag-region rect and offset slightly from the pointer. Purely visual
 * overlay furniture — `pointer-events-none`, never editable; the drop
 * indicator line remains the commit affordance.
 */
export function DragPreview({
  axis,
  cells,
  position,
  size,
}: {
  axis: ReorderAxis;
  /** Cell texts of the dragged column (header first) or row, in order. */
  cells: string[];
  /** Top-left anchor in surface coordinates (pointer + offset). */
  position: { left: number; top: number };
  /** Measured width (column drag) / height (row drag) of the dragged region. */
  size: { width: number; height: number };
}) {
  const isColumn = axis === "column";
  return (
    <div
      contentEditable={false}
      data-table-drag-preview={axis}
      className={cn(
        "pointer-events-none absolute z-50 flex overflow-hidden rounded-md border bg-background opacity-80 shadow-lg",
        isColumn ? "flex-col" : "flex-row items-stretch",
      )}
      style={{
        left: position.left,
        top: position.top,
        ...(isColumn ? { width: size.width } : { height: size.height }),
      }}
    >
      {cells.map((text, index) => (
        <div
          key={index}
          className={cn(
            "truncate px-2 py-1 text-sm text-foreground",
            isColumn
              ? index === 0 && "border-b font-medium"
              : "flex max-w-40 items-center border-r last:border-r-0",
          )}
        >
          {text || "\u00A0"}
        </div>
      ))}
    </div>
  );
}
