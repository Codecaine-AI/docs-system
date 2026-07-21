"use client";

import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { tableCellToPlainText, type TableCell } from "@codecaine-ai/docs-model";
import { isRecord } from "../../editor/core/node-helpers";
import { isTableCellValue } from "./cell-content";
import { STRUCTURED_TABLE_LABEL } from "./StructuredTableDocsBlock";
import { AddButtons } from "./editor/AddButtons";
import { AddDragPreview } from "./editor/AddDragPreview";
import {
  BirthFlash,
  columnsFlashRange,
  rowsFlashRange,
  type FlashRange,
} from "./editor/BirthFlash";
import { DragPreview } from "./editor/DragPreview";
import { DragRegionOverlay, DropIndicator } from "./editor/DropIndicator";
import { FocusNotches, type NotchPoint } from "./editor/FocusNotches";
import { gapPosition, unionRect, type Rect } from "./editor/geometry";
import { HandleMenu, type HandleMenuKind, type MenuAnchorRect } from "./editor/HandleMenu";
import { ColumnHandle, RowHandle } from "./editor/Handles";
import {
  HEADER_ROW,
  TableGrid,
  focusCellElement,
  type CellPosition,
} from "./editor/TableGrid";
import {
  addColumn,
  addRow,
  moveColumn,
  moveRow,
  normalizeTable,
  updateCell,
  updateHeader,
  type TableData,
} from "./editor/mutations";
import {
  cellRect,
  cellRectKey,
  columnOffsets,
  rangeRects,
  rowOffsets,
  type CellRectMap,
} from "./editor/overlay-geometry";
import { SelectionOverlay } from "./editor/SelectionOverlay";
import {
  applyAddDrag,
  trailingEmptyColumns,
  trailingEmptyRows,
  useAddDrag,
} from "./editor/use-add-drag";
import { useReorderDrag, type ReorderAxis } from "./editor/use-reorder-drag";
import { TABLE_SECTION_CLASSES, TABLE_TITLE_CLASSES } from "./table-classes";

/** A cell-range selection (anchor/head in grid coordinates, header row = HEADER_ROW). */
export type TableSelection = { anchor: CellPosition; head: CellPosition };

/** Hover state the grid reports — the overlay furniture (handles, add bars) keys off this. */
export type TableHoverState = { hoverRow: number | null; hoverCol: number | null };

/**
 * Post-commit side effects of one structural mutation, computed from the
 * COMMITTED result: an optional cell to move the caret into (single adds —
 * the focus replaces the usual editor-view refocus) and optional cell ranges
 * to wash with the one-shot birth flash (every add).
 */
type StructuralEffects = { focus?: CellPosition; flash?: FlashRange[] };

/** Column pill: 28×16, centered on the column, raised above the table's top edge. */
const COLUMN_HANDLE_SIZE = { width: 28, height: 16 };
/** Row pill: 16×28, centered on the body row, pushed left of the table's left edge. */
const ROW_HANDLE_SIZE = { width: 16, height: 28 };
/**
 * How far the pills sit outside the table edge, themed via the structured-table
 * token file (larger = the column pill rides higher / the row pill further
 * left). Consumed as a CSS calc() in the inline position styles — never read
 * back into JS — so the rail slider retunes it live. The fallback must match
 * the semantic.css default.
 */
export const HANDLE_OFFSET_CALC = "calc(-1 * var(--docs-table-handle-offset, 12px))";
/** Grace period before the handles fade after the pointer leaves the grid, so they can be reached. */
const HANDLE_LINGER_MS = 150;

const EMPTY_HOVER: TableHoverState = { hoverRow: null, hoverCol: null };
const EMPTY_TABLE: TableData = { columns: [], rows: [] };

function parseTableProps(
  props: Record<string, unknown>,
): { title?: string; data: TableData } | null {
  const { columns, rows } = props;
  if (!Array.isArray(columns) || columns.length === 0) return null;
  if (!columns.every(isTableCellValue)) return null;
  if (!Array.isArray(rows)) return null;
  if (
    !rows.every(
      (row): row is TableCell[] => Array.isArray(row) && row.every(isTableCellValue),
    )
  ) {
    return null;
  }
  return {
    title: typeof props.title === "string" ? props.title : undefined,
    data: normalizeTable({ columns, rows }),
  };
}

/**
 * Editor node view for `docStructuredTable`: the same Option D table the read
 * surface renders, with every cell editable in place. The wrapper stays
 * `contentEditable={false}` (PM strips unknown editable children otherwise —
 * see CodeBlockNodeView) while each cell is its own plaintext editable
 * island; TipTap's default `stopEvent` keeps events from those islands away
 * from ProseMirror.
 *
 * Every mutation funnels through `commitData`, which shallow-merges the new
 * columns/rows into `blockProps` (title/density ride along untouched) — one
 * `updateAttributes` call, which convert.ts turns into a single updateBlock
 * op. The `relative` surface div around TableGrid mounts the Notion-style
 * overlay furniture (none of it renders when the editor is read-only):
 *
 * - Add bars/corner (AddButtons) append columns/rows at the table edges. The
 *   right/bottom bars also drive useAddDrag: dragging outward stacks ghost
 *   column/row slabs (AddDragPreview) and dragging back over trailing EMPTY
 *   columns/rows marks them for removal; release folds the whole net change
 *   into ONE commitData call (applyAddDrag).
 * - While a cell holds focus, its th/td carries the editor-only accent ring
 *   (EDITOR_CELL_FOCUS_CLASS) and two gray notches (FocusNotches) mark the
 *   focused column/row edges, tracked via TableGrid's onFocusCell.
 * - Every add answers "where did it land?" twice: a one-shot accent wash over
 *   the new column/row (BirthFlash, keyed per add) and — for single adds
 *   (bar click, corner, menu inserts; never drag-many/duplicate) — the caret
 *   moves straight into the new column's header / new row's first cell.
 * - Pill handles (Handles) appear for the hovered column/body row, positioned
 *   from cell rects measured against the surface (overlay-geometry). Hover
 *   lingers briefly after the pointer leaves the grid so the off-edge pills
 *   stay reachable.
 * - Clicking a handle selects the whole column/row (SelectionOverlay draws
 *   one accent union rect) and opens its floating menu (HandleMenu); each
 *   action is one pure mutation committed via `commitData`, closing the menu
 *   and clearing the selection.
 * - Dragging a handle past the 10px dead zone reorders via useReorderDrag:
 *   boundary offsets from overlay-geometry drive the DropIndicator line and
 *   the translucent DragRegionOverlay, and mouseup commits moveColumn/moveRow.
 */
export function StructuredTableNodeView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const blockId = (node.attrs.blockId as string | null) ?? "";
  const props = useMemo(
    () => (isRecord(node.attrs.blockProps) ? node.attrs.blockProps : {}),
    [node.attrs.blockProps],
  );
  const parsed = useMemo(() => parseTableProps(props), [props]);
  const data = parsed?.data ?? EMPTY_TABLE;
  const showFurniture = editor.isEditable && parsed !== null;

  const [hover, setHover] = useState<TableHoverState>(EMPTY_HOVER);
  const [lingerHover, setLingerHover] = useState<TableHoverState>(EMPTY_HOVER);
  const [selection, setSelection] = useState<TableSelection | null>(null);
  const [menu, setMenu] = useState<{ kind: HandleMenuKind; index: number } | null>(null);
  const [focusedCell, setFocusedCell] = useState<CellPosition | null>(null);
  const [flash, setFlash] = useState<{ token: number; ranges: FlashRange[] } | null>(null);

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const cellsRef = useRef<CellRectMap>(new Map());
  const lingerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleHoveredRef = useRef(false);
  const flashTokenRef = useRef(0);
  const pendingFocusRef = useRef<CellPosition | null>(null);

  // Latest committed table data, updated when the PROPS-derived data changes
  // AND synchronously inside commitData — every mutation entry point reads
  // THIS, never a render-captured `data`, so a flushed cell edit and the
  // structural op that follows it in the same tick compose instead of the
  // second dropping the first. The identity guard matters: local state
  // updates (flash, hover, menu) re-render with the SAME memoized props data,
  // and blindly re-assigning it would roll dataRef back to the pre-commit
  // value whenever such a render lands before the committed attrs do.
  const dataRef = useRef(data);
  const propsDataRef = useRef(data);
  if (propsDataRef.current !== data) {
    propsDataRef.current = data;
    dataRef.current = data;
  }

  useEffect(
    () => () => {
      if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
    },
    [],
  );

  const commitData = (next: TableData) => {
    dataRef.current = next;
    updateAttributes({
      blockProps: { ...props, columns: next.columns, rows: next.rows },
    });
  };

  // If one of THIS table's cells holds focus, blur it — blur dispatches
  // synchronously, so the cell's pending edit (if any) commits through
  // commitData (updating dataRef) before the caller reads dataRef.current.
  // Without this, a structural mutation under a focused cell leaves the cell
  // island showing pre-mutation text that its blur/debounce later commits at
  // its grid position, clobbering the moved data.
  const flushPendingCellEdit = () => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    for (const element of cellsRef.current.values()) {
      if (element === active) {
        active.blur();
        return;
      }
    }
  };

  // Hand focus back to ProseMirror so a plain Mod-Z right after a table
  // action reaches the editor's history (menu buttons unmount on close and
  // would strand focus on <body>). PM's focus() preserves scroll position and
  // does not touch the selection.
  const focusEditorView = () => {
    if (!editor.isDestroyed) editor.view.focus();
  };

  // Every structural mutation funnels through here: flush the focused cell's
  // pending edit, run the pure transform against the freshest data, commit,
  // and route focus. `effects` — computed from the committed result, so index
  // math never races a flushed cell edit — may name a freshly added cell to
  // move the caret into (that focus REPLACES the editor-view refocus; the
  // whole-cell ring and gray notches light up with it) and/or ranges to wash
  // with the one-shot birth flash.
  const applyStructural = (
    transform: (current: TableData) => TableData,
    effects?: (next: TableData) => StructuralEffects | null,
  ) => {
    flushPendingCellEdit();
    const previous = dataRef.current;
    const next = transform(previous);
    commitData(next);
    const resolved = next === previous ? null : (effects?.(next) ?? null);
    pendingFocusRef.current = resolved?.focus ?? null;
    if (resolved?.flash && resolved.flash.length > 0) {
      flashTokenRef.current += 1;
      setFlash({ token: flashTokenRef.current, ranges: resolved.flash });
    }
    if (!resolved?.focus) focusEditorView();
  };

  // Resolves a structural op's focus target once the target cell exists: the
  // add's re-render mounts and registers the new cell one commit AFTER
  // applyStructural runs, so this runs after every render and simply waits
  // for the key to appear (the next structural op replaces or clears it).
  // Focusing the island fires its onFocusChange, so the accent ring and
  // focus notches follow for free.
  useEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    const element = cellsRef.current.get(cellRectKey(target.row, target.col));
    if (!element) return;
    pendingFocusRef.current = null;
    focusCellElement(element);
  });

  const clearLingerTimer = () => {
    if (lingerTimerRef.current) {
      clearTimeout(lingerTimerRef.current);
      lingerTimerRef.current = null;
    }
  };

  // Leaving the grid clears hover after a grace period (unless the pointer is
  // on a handle) — without it the off-edge pills unmount the instant the
  // pointer crosses from the table onto them.
  const scheduleLingerClear = () => {
    clearLingerTimer();
    lingerTimerRef.current = setTimeout(() => {
      lingerTimerRef.current = null;
      if (!handleHoveredRef.current) setLingerHover(EMPTY_HOVER);
    }, HANDLE_LINGER_MS);
  };

  const reportHover = (hoverRow: number | null, hoverCol: number | null) => {
    setHover({ hoverRow, hoverCol });
    if (hoverRow === null && hoverCol === null) {
      scheduleLingerClear();
    } else {
      clearLingerTimer();
      setLingerHover({ hoverRow, hoverCol });
    }
  };

  const holdHandles = () => {
    handleHoveredRef.current = true;
    clearLingerTimer();
  };

  const releaseHandles = () => {
    handleHoveredRef.current = false;
    scheduleLingerClear();
  };

  const closeMenu = () => {
    setMenu(null);
    setSelection(null);
    // Escape/click-away close included: PM should hold focus afterwards so
    // undo keeps working. A click-away that lands on a focusable target (a
    // cell, say) still wins — this runs during the menu's capture-phase
    // mousedown listener, before the browser's default focus change.
    focusEditorView();
  };

  const { drag, startDrag } = useReorderDrag({
    getOffsets: (axis: ReorderAxis) => {
      const surface = surfaceRef.current;
      if (!surface) return null;
      return axis === "column"
        ? columnOffsets(cellsRef.current, surface, data.columns.length)
        : rowOffsets(cellsRef.current, surface, data.rows.length);
    },
    onDrop: (axis, from, to) => {
      closeMenu();
      applyStructural((current) =>
        axis === "column" ? moveColumn(current, from, to) : moveRow(current, from, to),
      );
    },
    onClick: (axis, index) => {
      setSelection(
        axis === "column"
          ? {
              anchor: { row: HEADER_ROW, col: index },
              head: { row: data.rows.length - 1, col: index },
            }
          : {
              anchor: { row: index, col: 0 },
              head: { row: index, col: data.columns.length - 1 },
            },
      );
      setMenu({ kind: axis, index });
    },
  });

  const { addDrag, startAddDrag } = useAddDrag({
    getLimits: (axis) =>
      axis === "column"
        ? { trailingEmpty: trailingEmptyColumns(data), total: data.columns.length }
        : { trailingEmpty: trailingEmptyRows(data), total: data.rows.length },
    // A plain bar click appends one column/row: the caret lands in the new
    // column's header / new row's first cell, and the birth flash marks it.
    onClick: (axis) =>
      axis === "column"
        ? applyStructural(
            (current) => addColumn(current),
            (next) => ({
              focus: { row: HEADER_ROW, col: next.columns.length - 1 },
              flash: [
                columnsFlashRange(next, next.columns.length - 1, next.columns.length - 1),
              ],
            }),
          )
        : applyStructural(
            (current) => addRow(current),
            (next) => ({
              focus: { row: next.rows.length - 1, col: 0 },
              flash: [rowsFlashRange(next, next.rows.length - 1, next.rows.length - 1)],
            }),
          ),
    // Drag-to-add-many: no focus move (nothing singular to focus), one flash
    // over the whole added region; removals flash nothing.
    onCommit: (axis, net) =>
      applyStructural(
        (current) => applyAddDrag(current, axis, net),
        (next) =>
          net > 0
            ? {
                flash: [
                  axis === "column"
                    ? columnsFlashRange(next, next.columns.length - net, next.columns.length - 1)
                    : rowsFlashRange(next, next.rows.length - net, next.rows.length - 1),
                ],
              }
            : null,
      ),
  });

  if (!parsed) {
    return (
      <NodeViewWrapper as="div" data-doc-node={node.type.name} contentEditable={false}>
        <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
          Invalid {STRUCTURED_TABLE_LABEL} block — see agent description for the expected
          shape.
        </div>
      </NodeViewWrapper>
    );
  }

  const { title } = parsed;
  const lastCol = data.columns.length - 1;
  const lastRow = data.rows.length - 1;
  const surface = surfaceRef.current;

  // Which column/body-row shows its handle: an active drag pins it, an open
  // menu holds it, otherwise the (lingering) hover drives it.
  const rawHandleCol =
    drag?.axis === "column"
      ? drag.index
      : menu?.kind === "column"
        ? menu.index
        : lingerHover.hoverCol;
  const handleCol = rawHandleCol !== null && rawHandleCol <= lastCol ? rawHandleCol : null;
  const rawHandleRow =
    drag?.axis === "row" ? drag.index : menu?.kind === "row" ? menu.index : lingerHover.hoverRow;
  const handleRow =
    rawHandleRow !== null && rawHandleRow !== HEADER_ROW && rawHandleRow <= lastRow
      ? rawHandleRow
      : null;
  const columnHandleActive = drag?.axis === "column" || menu?.kind === "column";
  const rowHandleActive = drag?.axis === "row" || menu?.kind === "row";

  // Handle pill positions from cell rects, surface-relative; recomputed every
  // render that hover/menu/drag state changes (cells register before hover
  // can occur, so measuring here is safe). The off-edge axis is a calc()
  // string over the themed HANDLE_OFFSET var, so the pill's distance from the
  // table edge resolves in CSS.
  let columnHandlePosition: { left: number; top: string } | null = null;
  if (showFurniture && surface && handleCol !== null) {
    const rect = cellRect(cellsRef.current, surface, HEADER_ROW, handleCol);
    if (rect) {
      columnHandlePosition = {
        left: rect.left + rect.width / 2 - COLUMN_HANDLE_SIZE.width / 2,
        top: HANDLE_OFFSET_CALC,
      };
    }
  }
  let rowHandlePosition: { left: string; top: number } | null = null;
  if (showFurniture && surface && handleRow !== null) {
    const rect = cellRect(cellsRef.current, surface, handleRow, 0);
    if (rect) {
      rowHandlePosition = {
        left: HANDLE_OFFSET_CALC,
        top: rect.top + rect.height / 2 - ROW_HANDLE_SIZE.height / 2,
      };
    }
  }

  const selectionRect: Rect | null =
    showFurniture && surface && selection
      ? unionRect(rangeRects(cellsRef.current, surface, selection.anchor, selection.head))
      : null;

  const dragRegionRect: Rect | null =
    showFurniture && surface && drag
      ? unionRect(
          drag.axis === "column"
            ? rangeRects(
                cellsRef.current,
                surface,
                { row: HEADER_ROW, col: drag.index },
                { row: lastRow, col: drag.index },
              )
            : rangeRects(
                cellsRef.current,
                surface,
                { row: drag.index, col: 0 },
                { row: drag.index, col: lastCol },
              ),
        )
      : null;

  // Focused-cell position notches: a horizontal tick centered on the top edge
  // of the focused cell's column and a vertical tick centered on the left
  // edge of its row (the whole-cell accent ring is the th/td's own
  // :focus-within class). Guarded against stale coordinates after deletes.
  let columnTick: NotchPoint | null = null;
  let rowTick: NotchPoint | null = null;
  if (
    showFurniture &&
    surface &&
    focusedCell &&
    focusedCell.col <= lastCol &&
    focusedCell.row <= lastRow
  ) {
    const columnRect = cellRect(cellsRef.current, surface, HEADER_ROW, focusedCell.col);
    if (columnRect) {
      columnTick = { left: columnRect.left + columnRect.width / 2, top: columnRect.top };
    }
    const rowRect = cellRect(cellsRef.current, surface, focusedCell.row, 0);
    if (rowRect) rowTick = { left: rowRect.left, top: rowRect.top + rowRect.height / 2 };
  }

  // Live add-drag preview geometry: the full-table rect (ghost slabs stack
  // after its right/bottom edge), the doomed trailing-empty region when
  // removing, and the count label pinned near the pointer.
  let addDragPreview: {
    table: Rect;
    removalRect: Rect | null;
    labelPosition: { left: number; top: number };
  } | null = null;
  if (showFurniture && surface && addDrag && addDrag.net !== 0) {
    const columnBounds = columnOffsets(cellsRef.current, surface, data.columns.length);
    const rowBounds =
      data.rows.length > 0 ? rowOffsets(cellsRef.current, surface, data.rows.length) : null;
    const headerRect = cellRect(cellsRef.current, surface, HEADER_ROW, 0);
    if (columnBounds && headerRect) {
      const tableTop = headerRect.top;
      const tableBottom = rowBounds
        ? rowBounds[rowBounds.length - 1]
        : headerRect.top + headerRect.height;
      const table: Rect = {
        left: columnBounds[0],
        top: tableTop,
        width: columnBounds[columnBounds.length - 1] - columnBounds[0],
        height: tableBottom - tableTop,
      };
      let removalRect: Rect | null = null;
      if (addDrag.net < 0) {
        if (addDrag.axis === "column") {
          const start = columnBounds[data.columns.length + addDrag.net];
          removalRect = {
            left: start,
            top: table.top,
            width: columnBounds[columnBounds.length - 1] - start,
            height: table.height,
          };
        } else if (rowBounds) {
          const start = rowBounds[data.rows.length + addDrag.net];
          removalRect = {
            left: table.left,
            top: start,
            width: table.width,
            height: rowBounds[rowBounds.length - 1] - start,
          };
        }
      }
      const surfaceRect = surface.getBoundingClientRect();
      // Label trails the pointer; on column drags the left edge is clamped
      // back over the table so it never disappears under whatever system UI
      // is docked right of the editor canvas.
      addDragPreview = {
        table,
        removalRect,
        labelPosition: {
          left: Math.min(
            addDrag.pointerX - surfaceRect.left + 16,
            addDrag.axis === "column"
              ? table.left + table.width - 96
              : Number.POSITIVE_INFINITY,
          ),
          top: addDrag.pointerY - surfaceRect.top + 16,
        },
      };
    }
  }

  // Floating reorder preview: a simplified clone of the dragged column/row
  // following the pointer, sized from the measured drag-region rect.
  let reorderPreview: {
    cells: string[];
    position: { left: number; top: number };
    size: { width: number; height: number };
  } | null = null;
  if (showFurniture && surface && drag && dragRegionRect) {
    const surfaceRect = surface.getBoundingClientRect();
    reorderPreview = {
      // The floating preview is text-only — marks don't need to survive a
      // half-second drag ghost, but a span cell must still show its words.
      cells:
        drag.axis === "column"
          ? [
              tableCellToPlainText(data.columns[drag.index] ?? ""),
              ...data.rows.map((row) => tableCellToPlainText(row[drag.index] ?? "")),
            ]
          : (data.rows[drag.index] ?? []).map(tableCellToPlainText),
      position: {
        left: drag.pointerX - surfaceRect.left + 12,
        top: drag.pointerY - surfaceRect.top + 12,
      },
      size: { width: dragRegionRect.width, height: dragRegionRect.height },
    };
  }

  // The menu anchors to the pill's LIVE viewport box (the open menu keeps the
  // pill mounted) — measuring the element is the one way to stay consistent
  // with the CSS-resolved HANDLE_OFFSET without reading the var back into JS.
  let menuAnchor: MenuAnchorRect | null = null;
  if (showFurniture && surface && menu && !drag) {
    const handleElement = surface.querySelector(
      menu.kind === "column" ? "[data-table-column-handle]" : "[data-table-row-handle]",
    );
    if (handleElement) {
      const handleRect = handleElement.getBoundingClientRect();
      menuAnchor = {
        left: handleRect.left,
        top: handleRect.top,
        width: handleRect.width,
        height: handleRect.height,
      };
    }
  }

  return (
    <NodeViewWrapper as="div" data-doc-node={node.type.name} contentEditable={false}>
      <section
        className={TABLE_SECTION_CLASSES}
        data-docs-block-type="structured-table"
        data-source-id={blockId}
      >
        {title && <div className={TABLE_TITLE_CLASSES}>{title}</div>}
        <div
          ref={surfaceRef}
          className="relative"
          data-structured-table-surface=""
          data-hover-row={hover.hoverRow ?? undefined}
          data-hover-col={hover.hoverCol ?? undefined}
          data-header-row-hovered={hover.hoverRow === HEADER_ROW ? "" : undefined}
          data-table-selection={selection ? "active" : "none"}
        >
          <TableGrid
            data={data}
            editable={editor.isEditable}
            onCommitHeader={(columnIndex, value) =>
              commitData(updateHeader(dataRef.current, columnIndex, value))
            }
            onCommitCell={(rowIndex, columnIndex, value) =>
              commitData(updateCell(dataRef.current, rowIndex, columnIndex, value))
            }
            onUndo={() => editor.commands.undo()}
            onRedo={() => editor.commands.redo()}
            onHoverCell={reportHover}
            onFocusCell={(row, col) =>
              setFocusedCell(row === null || col === null ? null : { row, col })
            }
            onRegisterCell={(row, col, element) => {
              const key = cellRectKey(row, col);
              if (element) cellsRef.current.set(key, element);
              else cellsRef.current.delete(key);
            }}
          />
          {showFurniture && (
            <>
              <AddButtons
                lastColumnHovered={hover.hoverCol === lastCol}
                lastRowHovered={hover.hoverRow !== null && hover.hoverRow === lastRow && lastRow >= 0}
                onColumnBarMouseDown={(event: ReactMouseEvent) => startAddDrag("column", event)}
                onRowBarMouseDown={(event: ReactMouseEvent) => startAddDrag("row", event)}
                onAddBoth={() =>
                  applyStructural(
                    (current) => addRow(addColumn(current)),
                    (next) => {
                      const col = next.columns.length - 1;
                      const row = next.rows.length - 1;
                      return {
                        focus: { row: HEADER_ROW, col },
                        flash: [
                          columnsFlashRange(next, col, col),
                          // The row slab stops before the corner cell the
                          // column slab already covers, so the two washes
                          // read as one clean L.
                          { anchor: { row, col: 0 }, head: { row, col: col - 1 } },
                        ],
                      };
                    },
                  )
                }
              />
              <FocusNotches columnTick={columnTick} rowTick={rowTick} />
              {handleCol !== null && columnHandlePosition && (
                <ColumnHandle
                  left={columnHandlePosition.left}
                  top={columnHandlePosition.top}
                  active={columnHandleActive}
                  onMouseDown={(event: ReactMouseEvent) => startDrag("column", handleCol, event)}
                  onMouseEnter={holdHandles}
                  onMouseLeave={releaseHandles}
                />
              )}
              {handleRow !== null && rowHandlePosition && (
                <RowHandle
                  left={rowHandlePosition.left}
                  top={rowHandlePosition.top}
                  active={rowHandleActive}
                  onMouseDown={(event: ReactMouseEvent) => startDrag("row", handleRow, event)}
                  onMouseEnter={holdHandles}
                  onMouseLeave={releaseHandles}
                />
              )}
              <SelectionOverlay rect={selectionRect} />
              {flash && (
                <BirthFlash
                  key={flash.token}
                  ranges={flash.ranges}
                  cells={cellsRef.current}
                  surface={surface}
                  onDone={() =>
                    setFlash((current) => (current?.token === flash.token ? null : current))
                  }
                />
              )}
              {drag && (
                <DropIndicator
                  axis={drag.axis}
                  position={gapPosition(drag.offsets, drag.slotIndex)}
                />
              )}
              <DragRegionOverlay rect={dragRegionRect} />
              {drag && reorderPreview && (
                <DragPreview
                  axis={drag.axis}
                  cells={reorderPreview.cells}
                  position={reorderPreview.position}
                  size={reorderPreview.size}
                />
              )}
              {addDrag && addDragPreview && (
                <AddDragPreview
                  axis={addDrag.axis}
                  net={addDrag.net}
                  table={addDragPreview.table}
                  removalRect={addDragPreview.removalRect}
                  labelPosition={addDragPreview.labelPosition}
                />
              )}
              {menu && menuAnchor && (
                <HandleMenu
                  kind={menu.kind}
                  index={menu.index}
                  columnCount={data.columns.length}
                  rowCount={data.rows.length}
                  anchor={menuAnchor}
                  onApply={(item) => {
                    const kind = menu.kind;
                    // `item.apply` is pure — run it against dataRef at
                    // invocation time, NOT the render-captured `data` the
                    // menu mounted with, so a just-flushed cell edit
                    // survives the action. Items that create a column/row
                    // carry `adds`: flash the newcomer, and (inserts only)
                    // move the caret into its header/first cell.
                    applyStructural(item.apply, (next) => {
                      if (!item.adds) return null;
                      const at = item.adds.index;
                      return kind === "column"
                        ? {
                            focus: item.adds.focus ? { row: HEADER_ROW, col: at } : undefined,
                            flash: [columnsFlashRange(next, at, at)],
                          }
                        : {
                            focus: item.adds.focus ? { row: at, col: 0 } : undefined,
                            flash: [rowsFlashRange(next, at, at)],
                          };
                    });
                    // Close WITHOUT closeMenu's focus handoff —
                    // applyStructural just routed focus (into the new cell
                    // for inserts, back to the editor view otherwise).
                    setMenu(null);
                    setSelection(null);
                  }}
                  onClose={closeMenu}
                />
              )}
            </>
          )}
        </div>
      </section>
    </NodeViewWrapper>
  );
}
