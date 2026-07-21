"use client";

import { cn } from "../../../ui/cn";
import type { Rect } from "./geometry";
import { ADD_DRAG_COLUMN_STEP_PX, ADD_DRAG_ROW_STEP_PX, type AddDragAxis } from "./use-add-drag";

const GHOST_SLAB_CLASSES =
  "pointer-events-none absolute z-40 rounded-sm border border-dashed border-[color:var(--docs-editor-accent,#2383e2)] bg-[color:color-mix(in_srgb,var(--docs-editor-accent,#2383e2)_5%,transparent)]";

const REMOVAL_REGION_CLASSES =
  "pointer-events-none absolute z-40 rounded-sm border border-dashed border-destructive bg-[color:color-mix(in_srgb,var(--destructive,#e03e3e)_10%,transparent)]";

/** The floating "+2 columns" / "−1 row" label text for a live add drag. */
export function addDragLabel(axis: AddDragAxis, net: number): string {
  const magnitude = Math.abs(net);
  const noun = axis === "column" ? "column" : "row";
  return `${net > 0 ? "+" : "−"}${magnitude} ${noun}${magnitude === 1 ? "" : "s"}`;
}

/**
 * Live preview for an add-bar drag (useAddDrag): appending renders `net`
 * ghost column/row slabs after the table edge (dashed accent outline, faint
 * accent fill); removing tints the doomed trailing-empty region; and a small
 * dark count label floats near the pointer. Purely visual overlay furniture —
 * `pointer-events-none`, never editable; nothing here mutates data (the hook
 * commits once on release).
 */
export function AddDragPreview({
  axis,
  net,
  table,
  removalRect,
  labelPosition,
}: {
  axis: AddDragAxis;
  net: number;
  /** Full table rect in surface coordinates (ghost slabs stack after its right/bottom edge). */
  table: Rect;
  /** Region covering the trailing empty columns/rows marked for removal (net < 0). */
  removalRect: Rect | null;
  /** Label anchor in surface coordinates (offset from the pointer). */
  labelPosition: { left: number; top: number };
}) {
  if (net === 0) return null;
  const step = axis === "column" ? ADD_DRAG_COLUMN_STEP_PX : ADD_DRAG_ROW_STEP_PX;
  return (
    <div contentEditable={false} data-table-add-drag-preview={axis}>
      {net > 0 &&
        Array.from({ length: net }, (_, index) => (
          <div
            key={index}
            data-table-add-drag-ghost=""
            className={GHOST_SLAB_CLASSES}
            style={
              axis === "column"
                ? {
                    left: table.left + table.width + index * step,
                    top: table.top,
                    width: step,
                    height: table.height,
                  }
                : {
                    left: table.left,
                    top: table.top + table.height + index * step,
                    width: table.width,
                    height: step,
                  }
            }
          />
        ))}
      {net < 0 && removalRect && (
        <div
          data-table-add-drag-removal=""
          className={REMOVAL_REGION_CLASSES}
          style={{
            left: removalRect.left,
            top: removalRect.top,
            width: removalRect.width,
            height: removalRect.height,
          }}
        />
      )}
      <div
        data-table-add-drag-label=""
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded px-2 py-1 text-xs shadow-md",
          "bg-neutral-800 text-neutral-100 dark:bg-neutral-200 dark:text-neutral-900",
        )}
        style={{ left: labelPosition.left, top: labelPosition.top }}
      >
        {addDragLabel(axis, net)}
      </div>
    </div>
  );
}
