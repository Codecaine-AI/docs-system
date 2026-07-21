"use client";

/** A tick's center point in surface coordinates. */
export type NotchPoint = { left: number; top: number };

/**
 * Notion's focused-cell position markers: while a cell holds focus, a small
 * gray horizontal tick (16×2) sits centered on the top edge of the focused
 * cell's column, and a vertical tick (2×16) centered on the left edge of its
 * row. Purely visual overlay furniture — `pointer-events-none`, never
 * editable; the whole-cell accent ring itself is the th/td's
 * `:focus-within` treatment (TableGrid).
 */
export function FocusNotches({
  columnTick,
  rowTick,
}: {
  columnTick: NotchPoint | null;
  rowTick: NotchPoint | null;
}) {
  return (
    <>
      {columnTick && (
        <div
          contentEditable={false}
          data-table-focus-notch="column"
          className="pointer-events-none absolute z-[2] h-[2px] w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/50"
          style={{ left: columnTick.left, top: columnTick.top }}
        />
      )}
      {rowTick && (
        <div
          contentEditable={false}
          data-table-focus-notch="row"
          className="pointer-events-none absolute z-[2] h-4 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/50"
          style={{ left: rowTick.left, top: rowTick.top }}
        />
      )}
    </>
  );
}
