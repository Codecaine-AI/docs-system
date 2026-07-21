"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { getTargetIndexByDraggingOffset } from "./geometry";

export type ReorderAxis = "column" | "row";

/** Pointer travel below this is a click (opens the handle menu), not a drag. */
export const DRAG_DEAD_ZONE_PX = 10;

/** A live (past-dead-zone) reorder drag; null while idle or inside the dead zone. */
export type ActiveReorderDrag = {
  axis: ReorderAxis;
  /** Index being dragged (column index, or body-row index). */
  index: number;
  /** Where `moveColumn`/`moveRow` should land the dragged index on drop. */
  targetIndex: number;
  /** Boundary slot for the drop indicator — feed to `gapPosition(offsets, slotIndex)`. */
  slotIndex: number;
  /** Boundary offsets measured at drag start (surface coordinates). */
  offsets: number[];
  /** Last pointer position in client coordinates (drives the floating drag preview). */
  pointerX: number;
  pointerY: number;
};

/**
 * Pure drop math: maps the dragged block's current start offset to the index
 * `moveColumn`/`moveRow` should receive and the boundary slot the drop
 * indicator sits at. `getTargetIndexByDraggingOffset` returns the index the
 * dragged block will OCCUPY after the move (mutations splice-out then
 * splice-in, so no further adjustment is needed); moving forward the
 * indicator gap is AFTER that block in the pre-move order, hence slot
 * `target + 1`, while moving backward it is at slot `target`.
 */
export function planReorderDrop(
  offsets: number[],
  draggingIndex: number,
  currentOffset: number,
): { targetIndex: number; slotIndex: number } {
  const targetIndex = getTargetIndexByDraggingOffset(offsets, draggingIndex, currentOffset);
  const slotIndex = targetIndex > draggingIndex ? targetIndex + 1 : targetIndex;
  return { targetIndex, slotIndex };
}

type DragSession = {
  axis: ReorderAxis;
  index: number;
  startX: number;
  startY: number;
  active: boolean;
  offsets: number[] | null;
  targetIndex: number;
  onMouseMove: (event: MouseEvent) => void;
  onMouseUp: (event: MouseEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
};

/**
 * Pointer-tracked reorder for the structured-table handles (NOT HTML5 drag —
 * mirrors the AFFiNE reference's column/row drag). `startDrag` is wired to a
 * handle's mousedown; document-level listeners then track the pointer.
 * Within the dead zone, mouseup reports `onClick` (open the handle menu);
 * past it the drag activates: offsets are measured once via `getOffsets`,
 * every move re-plans the target via `planReorderDrop`, the body cursor
 * becomes `grabbing`, Escape cancels, and mouseup reports `onDrop` (skipped
 * when the target equals the origin). All listeners are removed on drop,
 * cancel, and unmount.
 */
export function useReorderDrag({
  getOffsets,
  onDrop,
  onClick,
}: {
  getOffsets: (axis: ReorderAxis) => number[] | null;
  onDrop: (axis: ReorderAxis, from: number, to: number) => void;
  onClick: (axis: ReorderAxis, index: number) => void;
}) {
  const [drag, setDrag] = useState<ActiveReorderDrag | null>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const callbacksRef = useRef({ getOffsets, onDrop, onClick });
  callbacksRef.current = { getOffsets, onDrop, onClick };

  const teardown = () => {
    const session = sessionRef.current;
    if (!session) return;
    document.removeEventListener("mousemove", session.onMouseMove);
    document.removeEventListener("mouseup", session.onMouseUp);
    document.removeEventListener("keydown", session.onKeyDown, true);
    if (session.active) document.body.style.cursor = "";
    sessionRef.current = null;
    setDrag(null);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  useEffect(() => () => teardown(), []);

  const startDrag = (axis: ReorderAxis, index: number, event: ReactMouseEvent) => {
    if (event.button !== 0) return;
    // Keep ProseMirror (node selection, editor drag handles) and native text
    // selection out of the interaction entirely.
    event.preventDefault();
    event.stopPropagation();
    if (sessionRef.current) teardown();

    const session: DragSession = {
      axis,
      index,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      offsets: null,
      targetIndex: index,
      onMouseMove: (move: MouseEvent) => {
        const dx = move.clientX - session.startX;
        const dy = move.clientY - session.startY;
        if (!session.active) {
          if (Math.hypot(dx, dy) <= DRAG_DEAD_ZONE_PX) return;
          const offsets = callbacksRef.current.getOffsets(axis);
          if (!offsets || offsets.length < index + 2) {
            teardown();
            return;
          }
          session.active = true;
          session.offsets = offsets;
          document.body.style.cursor = "grabbing";
        }
        const offsets = session.offsets;
        if (!offsets) return;
        const delta = axis === "column" ? dx : dy;
        const currentOffset = offsets[index] + delta;
        const plan = planReorderDrop(offsets, index, currentOffset);
        session.targetIndex = plan.targetIndex;
        setDrag({
          axis,
          index,
          offsets,
          ...plan,
          pointerX: move.clientX,
          pointerY: move.clientY,
        });
      },
      onMouseUp: () => {
        const wasActive = session.active;
        const target = session.targetIndex;
        teardown();
        if (!wasActive) callbacksRef.current.onClick(axis, index);
        else if (target !== index) callbacksRef.current.onDrop(axis, index, target);
      },
      onKeyDown: (key: KeyboardEvent) => {
        if (key.key !== "Escape") return;
        key.stopPropagation();
        teardown();
      },
    };

    document.addEventListener("mousemove", session.onMouseMove);
    document.addEventListener("mouseup", session.onMouseUp);
    document.addEventListener("keydown", session.onKeyDown, true);
    sessionRef.current = session;
  };

  return { drag, startDrag };
}
