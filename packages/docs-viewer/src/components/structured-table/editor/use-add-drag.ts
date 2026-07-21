"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { addColumn, addRow, removeColumn, removeRow, type TableData } from "./mutations";
import { DRAG_DEAD_ZONE_PX } from "./use-reorder-drag";

export type AddDragAxis = "column" | "row";

/** Pointer travel that mints one ghost column while dragging the right add bar (~AFFiNE's DefaultColumnWidth). */
export const ADD_DRAG_COLUMN_STEP_PX = 120;
/** Pointer travel that mints one ghost row while dragging the bottom add bar (~one body-row height). */
export const ADD_DRAG_ROW_STEP_PX = 36;

/** A live (past-dead-zone) add/remove drag on an add bar; null while idle or inside the dead zone. */
export type ActiveAddDrag = {
  axis: AddDragAxis;
  /** Net change on release: +n appends n columns/rows, −n removes n trailing EMPTY ones. */
  net: number;
  /** Last pointer position in client coordinates (drives the floating count label). */
  pointerX: number;
  pointerY: number;
};

/** Trailing columns whose header and every body cell are "" — the only ones a leftward add-bar drag may remove. */
export function trailingEmptyColumns(data: TableData): number {
  let count = 0;
  for (let col = data.columns.length - 1; col >= 0; col--) {
    const empty =
      data.columns[col] === "" && data.rows.every((row) => (row[col] ?? "") === "");
    if (!empty) break;
    count++;
  }
  return count;
}

/** Trailing rows whose every cell is "" — the only ones an upward add-bar drag may remove. */
export function trailingEmptyRows(data: TableData): number {
  let count = 0;
  for (let row = data.rows.length - 1; row >= 0; row--) {
    if (!data.rows[row].every((cell) => cell === "")) break;
    count++;
  }
  return count;
}

/**
 * Pure add-drag math: pointer travel along the bar's axis → net column/row
 * change. Positive travel adds one per `step` px; negative travel removes at
 * most the trailing-empty run, and never below one column/row.
 */
export function planAddDragNet(
  delta: number,
  step: number,
  trailingEmpty: number,
  total: number,
): number {
  if (delta >= 0) return Math.floor(delta / step);
  const wanted = Math.floor(-delta / step);
  const removable = Math.max(0, Math.min(wanted, trailingEmpty, total - 1));
  return removable === 0 ? 0 : -removable;
}

/**
 * Folds a net add-drag result into ONE TableData (the node view commits it via
 * a single `commitData` call): +n appends n empty columns/rows, −n removes n
 * from the tail. Composed from the existing pure mutations.
 */
export function applyAddDrag(data: TableData, axis: AddDragAxis, net: number): TableData {
  let next = data;
  for (let i = 0; i < net; i++) {
    next = axis === "column" ? addColumn(next) : addRow(next);
  }
  for (let i = 0; i < -net; i++) {
    next =
      axis === "column"
        ? removeColumn(next, next.columns.length - 1)
        : removeRow(next, next.rows.length - 1);
  }
  return next;
}

type AddDragSession = {
  axis: AddDragAxis;
  startX: number;
  startY: number;
  active: boolean;
  trailingEmpty: number;
  total: number;
  net: number;
  onMouseMove: (event: MouseEvent) => void;
  onMouseUp: (event: MouseEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
};

/**
 * Pointer-tracked add/remove drag for the add bars — the same
 * dead-zone/pointer-session shape as useReorderDrag, kept separate so the two
 * interactions never tangle. `startAddDrag` wires to a bar's mousedown;
 * within the dead zone mouseup reports `onClick` (add exactly one, as a plain
 * click always did); past it the drag activates: limits are snapshotted once
 * via `getLimits`, every move re-plans the net via `planAddDragNet`, the body
 * cursor becomes col/row-resize, Escape cancels, and mouseup reports
 * `onCommit(axis, net)` (skipped at net 0). All listeners are removed on
 * drop, cancel, and unmount.
 */
export function useAddDrag({
  getLimits,
  onClick,
  onCommit,
}: {
  getLimits: (axis: AddDragAxis) => { trailingEmpty: number; total: number };
  onClick: (axis: AddDragAxis) => void;
  onCommit: (axis: AddDragAxis, net: number) => void;
}) {
  const [addDrag, setAddDrag] = useState<ActiveAddDrag | null>(null);
  const sessionRef = useRef<AddDragSession | null>(null);
  const callbacksRef = useRef({ getLimits, onClick, onCommit });
  callbacksRef.current = { getLimits, onClick, onCommit };

  const teardown = () => {
    const session = sessionRef.current;
    if (!session) return;
    document.removeEventListener("mousemove", session.onMouseMove);
    document.removeEventListener("mouseup", session.onMouseUp);
    document.removeEventListener("keydown", session.onKeyDown, true);
    if (session.active) document.body.style.cursor = "";
    sessionRef.current = null;
    setAddDrag(null);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  useEffect(() => () => teardown(), []);

  const startAddDrag = (axis: AddDragAxis, event: ReactMouseEvent) => {
    if (event.button !== 0) return;
    // ProseMirror must never see furniture mousedowns; preventDefault also
    // keeps focus (and any in-flight cell edit) in place.
    event.preventDefault();
    event.stopPropagation();
    if (sessionRef.current) teardown();

    const limits = callbacksRef.current.getLimits(axis);
    const step = axis === "column" ? ADD_DRAG_COLUMN_STEP_PX : ADD_DRAG_ROW_STEP_PX;
    const session: AddDragSession = {
      axis,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      trailingEmpty: limits.trailingEmpty,
      total: limits.total,
      net: 0,
      onMouseMove: (move: MouseEvent) => {
        const delta =
          axis === "column" ? move.clientX - session.startX : move.clientY - session.startY;
        if (!session.active) {
          if (Math.abs(delta) <= DRAG_DEAD_ZONE_PX) return;
          session.active = true;
          document.body.style.cursor = axis === "column" ? "col-resize" : "row-resize";
        }
        session.net = planAddDragNet(delta, step, session.trailingEmpty, session.total);
        setAddDrag({ axis, net: session.net, pointerX: move.clientX, pointerY: move.clientY });
      },
      onMouseUp: () => {
        const wasActive = session.active;
        const net = session.net;
        teardown();
        if (!wasActive) callbacksRef.current.onClick(axis);
        else if (net !== 0) callbacksRef.current.onCommit(axis, net);
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

  return { addDrag, startAddDrag };
}
