"use client";

import {
  autoUpdate,
  flip,
  offset as offsetMiddleware,
  shift,
  useFloating,
  type ReferenceType,
} from "@floating-ui/react";
import { useEffect, useMemo, useRef } from "react";
import type { TableData } from "./mutations";
import {
  addColumn,
  addRow,
  clearColumn,
  clearRow,
  duplicateColumn,
  duplicateRow,
  moveColumn,
  moveRow,
  removeColumn,
  removeRow,
} from "./mutations";

export type HandleMenuKind = "column" | "row";

/** Handle-anchor rect in VIEWPORT coordinates (the floating menu positions against it). */
export type MenuAnchorRect = { left: number; top: number; width: number; height: number };

export type HandleMenuItem = {
  label: string;
  disabled?: boolean;
  /** Pure TableData transform — the node view runs exactly one `commitData(apply(data))` per action. */
  apply: (data: TableData) => TableData;
  /**
   * For items that create a column/row (inserts, duplicate): the newcomer's
   * index after `apply`. Drives the node view's birth flash, and — for
   * inserts (`focus: true`) — moves the caret into the new column's header /
   * new row's first cell. Duplicates leave focus with the editor view.
   */
  adds?: { index: number; focus: boolean };
};

/** Column handle menu items with disabled states (exported for direct testing). */
export function buildColumnMenuItems(index: number, columnCount: number): HandleMenuItem[] {
  return [
    {
      label: "Insert left",
      apply: (data) => addColumn(data, index),
      adds: { index, focus: true },
    },
    {
      label: "Insert right",
      apply: (data) => addColumn(data, index + 1),
      adds: { index: index + 1, focus: true },
    },
    {
      label: "Move left",
      disabled: index === 0,
      apply: (data) => moveColumn(data, index, index - 1),
    },
    {
      label: "Move right",
      disabled: index === columnCount - 1,
      apply: (data) => moveColumn(data, index, index + 1),
    },
    {
      label: "Duplicate",
      apply: (data) => duplicateColumn(data, index),
      adds: { index: index + 1, focus: false },
    },
    { label: "Clear column", apply: (data) => clearColumn(data, index) },
    {
      label: "Delete column",
      disabled: columnCount <= 1,
      apply: (data) => removeColumn(data, index),
    },
  ];
}

/** Body-row handle menu items with disabled states (exported for direct testing). */
export function buildRowMenuItems(index: number, rowCount: number): HandleMenuItem[] {
  return [
    {
      label: "Insert above",
      apply: (data) => addRow(data, index),
      adds: { index, focus: true },
    },
    {
      label: "Insert below",
      apply: (data) => addRow(data, index + 1),
      adds: { index: index + 1, focus: true },
    },
    { label: "Move up", disabled: index === 0, apply: (data) => moveRow(data, index, index - 1) },
    {
      label: "Move down",
      disabled: index === rowCount - 1,
      apply: (data) => moveRow(data, index, index + 1),
    },
    {
      label: "Duplicate",
      apply: (data) => duplicateRow(data, index),
      adds: { index: index + 1, focus: false },
    },
    { label: "Clear row", apply: (data) => clearRow(data, index) },
    { label: "Delete row", disabled: rowCount <= 1, apply: (data) => removeRow(data, index) },
  ];
}

/**
 * Floating menu for a column/row pill handle, following the repo's
 * @floating-ui pattern (reference-node.tsx): virtual reference over the
 * handle rect, offset/flip/shift, popover-styled panel. Esc and click-away
 * (document capture listeners) call `onClose` — the node view clears the
 * selection alongside; each item runs one pure mutation via `onApply`.
 */
export function HandleMenu({
  kind,
  index,
  columnCount,
  rowCount,
  anchor,
  onApply,
  onClose,
}: {
  kind: HandleMenuKind;
  index: number;
  columnCount: number;
  rowCount: number;
  anchor: MenuAnchorRect;
  /** The clicked item, transform and `adds` metadata included — the node view commits and routes focus/flash. */
  onApply: (item: HandleMenuItem) => void;
  onClose: () => void;
}) {
  const items =
    kind === "column" ? buildColumnMenuItems(index, columnCount) : buildRowMenuItems(index, rowCount);

  const { refs, floatingStyles } = useFloating({
    open: true,
    placement: kind === "column" ? "bottom-start" : "right-start",
    whileElementsMounted: autoUpdate,
    middleware: [offsetMiddleware(6), flip(), shift({ padding: 8 })],
  });

  const virtualReference = useMemo<ReferenceType>(
    () => ({
      getBoundingClientRect: () => ({
        x: anchor.left,
        y: anchor.top,
        left: anchor.left,
        top: anchor.top,
        right: anchor.left + anchor.width,
        bottom: anchor.top + anchor.height,
        width: anchor.width,
        height: anchor.height,
      }),
    }),
    [anchor],
  );

  useEffect(() => {
    refs.setReference(virtualReference);
  }, [refs, virtualReference]);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // Capture phase so handle/cell mousedowns that stopPropagation still
    // close the menu; mousedowns inside the panel are exempt.
    const handleMouseDown = (event: MouseEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      onCloseRef.current();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  return (
    <div
      ref={(element) => {
        panelRef.current = element;
        refs.setFloating(element);
      }}
      style={floatingStyles}
      contentEditable={false}
      data-table-handle-menu={kind}
      className="z-50 w-44 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          disabled={item.disabled}
          onClick={() => onApply(item)}
          className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-muted disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
