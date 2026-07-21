"use client";

import { useRef } from "react";
import { cn } from "../../../ui/cn";
import {
  TABLE_BODY_CELL_TEXT_CLASSES,
  TABLE_CELL_SPACING_CLASS,
  TABLE_COLUMN_GAP_CLASS,
  TABLE_ELEMENT_CLASSES,
  TABLE_HEAD_CLASSES,
  TABLE_HEADER_CELL_TEXT_CLASSES,
  TABLE_LAST_COLUMN_CLASS,
  TABLE_ROW_HOVER_CLASSES,
  TABLE_ROW_RULE_CLASSES,
  TABLE_WRAPPER_CLASSES,
} from "../table-classes";
import type { TableCell } from "@codecaine-ai/docs-model";
import { placeCaretAtEnd } from "./caret";
import { EditableCell, getCellEditor, type CellNavigation } from "./EditableCell";
import type { TableData } from "./mutations";

/** Row coordinate of the header row in hover/focus positions (body rows are 0-based). */
export const HEADER_ROW = -1;

export type CellPosition = { row: number; col: number };

/**
 * Focus order is header cells left-to-right, then each body row: Tab/Shift-Tab
 * walk that order (wrapping across rows, no-op at the very ends), Enter drops
 * to the same column one row down. Returns null when the move falls off the
 * grid.
 */
export function resolveNavigation(
  from: CellPosition,
  move: CellNavigation,
  data: TableData,
): CellPosition | null {
  const lastCol = data.columns.length - 1;
  const lastRow = data.rows.length - 1;
  if (move === "down") {
    return from.row < lastRow ? { row: from.row + 1, col: from.col } : null;
  }
  if (move === "next") {
    if (from.col < lastCol) return { row: from.row, col: from.col + 1 };
    return from.row < lastRow ? { row: from.row + 1, col: 0 } : null;
  }
  if (from.col > 0) return { row: from.row, col: from.col - 1 };
  return from.row > HEADER_ROW ? { row: from.row - 1, col: lastCol } : null;
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

/**
 * Editor-only whole-cell focus treatment: a 2px inset accent ring on the
 * enclosing th/td while its EditableCell island holds focus. Lives here (NOT
 * in table-classes.ts) so the read renderer never carries it.
 */
export const EDITOR_CELL_FOCUS_CLASS =
  "focus-within:shadow-[inset_0_0_0_2px_var(--docs-editor-accent,#2383e2)]";

/** Focus a cell island with the caret ready at the end of its text — shared with the node view's post-add focus routing. */
export function focusCellElement(element: HTMLElement) {
  // Rich cells route through their mini editor so ProseMirror's own
  // selection state moves with the DOM caret; the DOM-range path stays as
  // the fallback for any plain registered element.
  const editor = getCellEditor(element);
  if (editor && !editor.isDestroyed) {
    // focus("end") places the PM selection synchronously but defers the DOM
    // focus a frame (TipTap's rAF) — view.focus() makes it land NOW, so
    // grid navigation reads coherent focus state immediately.
    editor.commands.focus("end");
    editor.view.focus();
    return;
  }
  element.focus();
  placeCaretAtEnd(element);
}

/**
 * The editable structured-table grid: the exact `<table>` structure and
 * classes of the read renderer (table-classes.ts), with every header/body
 * cell swapped for an EditableCell. Pure data-in/callbacks-out — no
 * ProseMirror knowledge; the node view owns persistence, hover state, and
 * the wave-2 overlay furniture around it.
 */
export function TableGrid({
  data,
  editable,
  onCommitHeader,
  onCommitCell,
  onHoverCell,
  onFocusCell,
  onRegisterCell,
  onUndo,
  onRedo,
}: {
  data: TableData;
  editable: boolean;
  onCommitHeader: (columnIndex: number, value: TableCell) => void;
  onCommitCell: (rowIndex: number, columnIndex: number, value: TableCell) => void;
  onHoverCell: (rowIndex: number | null, columnIndex: number | null) => void;
  /** Reports the focused cell (header row = HEADER_ROW), or (null, null) on blur — drives the node view's focus notches. */
  onFocusCell?: (rowIndex: number | null, columnIndex: number | null) => void;
  /** Optional cell-element passthrough (header row = HEADER_ROW) so the node view's overlay furniture can measure cell rects. */
  onRegisterCell?: (rowIndex: number, columnIndex: number, element: HTMLElement | null) => void;
  /** Editor-history passthroughs for Mod-Z/Mod-Shift-Z/Mod-Y pressed inside a cell (see EditableCell). */
  onUndo?: () => void;
  onRedo?: () => void;
}) {
  const cellElementsRef = useRef(new Map<string, HTMLElement>());

  const reportFocus = (row: number, col: number) => (focused: boolean) => {
    onFocusCell?.(focused ? row : null, focused ? col : null);
  };

  const registerCell = (row: number, col: number) => (element: HTMLDivElement | null) => {
    if (element) cellElementsRef.current.set(cellKey(row, col), element);
    else cellElementsRef.current.delete(cellKey(row, col));
    onRegisterCell?.(row, col, element);
  };

  const navigateFrom = (from: CellPosition) => (move: CellNavigation) => {
    const target = resolveNavigation(from, move, data);
    if (!target) return;
    const element = cellElementsRef.current.get(cellKey(target.row, target.col));
    if (element) focusCellElement(element);
  };

  return (
    <div className={TABLE_WRAPPER_CLASSES} onMouseLeave={() => onHoverCell(null, null)}>
      <table className={TABLE_ELEMENT_CLASSES}>
        <thead className={TABLE_HEAD_CLASSES}>
          <tr>
            {data.columns.map((column, columnIndex) => (
              <th
                key={columnIndex}
                className={cn(
                  TABLE_CELL_SPACING_CLASS,
                  TABLE_HEADER_CELL_TEXT_CLASSES,
                  columnIndex === data.columns.length - 1
                    ? TABLE_LAST_COLUMN_CLASS
                    : TABLE_COLUMN_GAP_CLASS,
                  editable && EDITOR_CELL_FOCUS_CLASS,
                )}
                onMouseEnter={() => onHoverCell(HEADER_ROW, columnIndex)}
              >
                <EditableCell
                  value={column}
                  editable={editable}
                  ariaLabel={`Column ${columnIndex + 1} header`}
                  placeholder={`Column ${columnIndex + 1}`}
                  onCommit={(next) => onCommitHeader(columnIndex, next)}
                  onNavigate={navigateFrom({ row: HEADER_ROW, col: columnIndex })}
                  onFocusChange={reportFocus(HEADER_ROW, columnIndex)}
                  onUndo={onUndo}
                  onRedo={onRedo}
                  registerElement={registerCell(HEADER_ROW, columnIndex)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={cn(
                TABLE_ROW_HOVER_CLASSES,
                rowIndex !== data.rows.length - 1 && TABLE_ROW_RULE_CLASSES,
              )}
            >
              {data.columns.map((_, columnIndex) => (
                <td
                  key={columnIndex}
                  className={cn(
                    TABLE_CELL_SPACING_CLASS,
                    TABLE_BODY_CELL_TEXT_CLASSES,
                    columnIndex === data.columns.length - 1
                      ? TABLE_LAST_COLUMN_CLASS
                      : TABLE_COLUMN_GAP_CLASS,
                    editable && EDITOR_CELL_FOCUS_CLASS,
                  )}
                  onMouseEnter={() => onHoverCell(rowIndex, columnIndex)}
                >
                  <EditableCell
                    value={row[columnIndex] ?? ""}
                    editable={editable}
                    ariaLabel={`Row ${rowIndex + 1}, column ${columnIndex + 1}`}
                    onCommit={(next) => onCommitCell(rowIndex, columnIndex, next)}
                    onNavigate={navigateFrom({ row: rowIndex, col: columnIndex })}
                    onFocusChange={reportFocus(rowIndex, columnIndex)}
                    onUndo={onUndo}
                    onRedo={onRedo}
                    registerElement={registerCell(rowIndex, columnIndex)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
