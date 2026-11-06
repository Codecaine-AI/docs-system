import { tableCellToPlainText, type TableCell } from "@codecaine-ai/docs-model";
import type { TableCellKind } from "./cell-kind";
import {
  TABLE_COLUMN_FIT_CLASSES,
  TABLE_PROSE_FLOOR_CLASS,
  TABLE_PROSE_MEASURE_CLASS,
  TABLE_STICKY_BODY_CELL_CLASSES,
  TABLE_STICKY_HEADER_CELL_CLASSES,
  TABLE_WRAP_MEASURE_CLASS,
} from "./table-classes";

/**
 * How one column sizes inside the shrink-to-content table:
 *
 * - `"fit"`: sized to its content on one line (never wraps). Columns of
 *   identifiers (any cell typed by cell-kind.ts — never the prose column)
 *   and every short text column.
 * - `"prose"`: the ONE column that absorbs the width left over and wraps,
 *   between words only, at a 60ch line measure — the text column with the
 *   longest average body text.
 * - `"text"`: a second sentence column, whose average body text is at
 *   least TEXT_COLUMN_SHARE of the prose column's. It wraps at the same 60ch
 *   measure, so two sentence columns share the lane evenly.
 * - `"wrap"`: any other long text column (some cell longer than
 *   WRAP_THRESHOLD characters), such as a run of flags. It wraps at half the
 *   measure, so it leaves the spare width to the prose column.
 *
 * The read block and the editor grid both feed this the same cell kinds, so
 * a table sizes identically at rest on both surfaces.
 */
export type TableColumnFit = "fit" | "prose" | "text" | "wrap";

/** A long text column whose average body text is at least this share of the prose column's is a second sentence column. */
export const TEXT_COLUMN_SHARE = 0.8;

/**
 * A text column whose longest body cell is over this many characters wraps.
 * A short-label column stays on one line; a column of phrases wraps, so the
 * browser shares the lane between it and the prose column instead of giving
 * the prose column only what the one-line columns leave over.
 */
export const WRAP_THRESHOLD = 24;

/** A code chip in a cell up to this many characters long never breaks on screen (cell-render.tsx). */
export const WHOLE_CHIP_MAX_CHARS = 40;

/**
 * The prose column is never narrower than this many ch (TABLE_PROSE_FLOOR_CLASS),
 * so one-line columns cannot squeeze it to a few words a line. A table whose
 * longest text cell is this short or shorter has no prose column.
 */
export const PROSE_FLOOR_CH = 30;

export function tableColumnFits(
  rows: readonly (readonly TableCell[])[],
  columnCount: number,
  cellKinds: readonly (readonly (TableCellKind | undefined)[])[],
): TableColumnFit[] {
  const columns = Array.from({ length: columnCount }, (_, column) => {
    const code = cellKinds.some((row) => row[column] !== undefined);
    const lengths = rows.map((row) => tableCellToPlainText(row[column] ?? "").trim().length);
    const total = lengths.reduce((sum, length) => sum + length, 0);
    // Identifier cells never wrap (their td is nowrap); only the sans cells
    // left in a column decide whether it may wrap.
    const sansLengths = lengths.filter((_, row) => cellKinds[row]?.[column] === undefined);
    return {
      code,
      average: rows.length > 0 ? total / rows.length : 0,
      longest: Math.max(0, ...sansLengths),
    };
  });

  // Ties go to the leftmost column; a table with no body text has no prose column.
  let prose = -1;
  columns.forEach((column, index) => {
    if (column.code || column.average === 0 || column.longest <= PROSE_FLOOR_CH) return;
    if (prose === -1 || column.average > columns[prose].average) prose = index;
  });

  return columns.map((column, index) => {
    if (index === prose) return "prose";
    if (column.longest <= WRAP_THRESHOLD) return "fit";
    return prose !== -1 && column.average >= TEXT_COLUMN_SHARE * columns[prose].average ? "text" : "wrap";
  });
}

/**
 * The column-placement classes one th/td carries on both surfaces: its
 * column's fit, and — first column only — the sticky pin.
 */
export function columnCellClasses(
  fit: TableColumnFit | undefined,
  columnIndex: number,
  header: boolean,
): string {
  const pin =
    columnIndex === 0
      ? header
        ? TABLE_STICKY_HEADER_CELL_CLASSES
        : TABLE_STICKY_BODY_CELL_CLASSES
      : "";
  return [TABLE_COLUMN_FIT_CLASSES[fit ?? "fit"], pin].filter(Boolean).join(" ");
}

/**
 * The classes of the block around a body cell's content: the prose measure
 * for a prose or text column, half of it for a wrap column, plus the floor
 * for the prose column. Undefined
 * for a fit column, whose content needs no block.
 */
export function proseMeasureClass(fit: TableColumnFit | undefined): string | undefined {
  if (fit === "prose") return `${TABLE_PROSE_MEASURE_CLASS} ${TABLE_PROSE_FLOOR_CLASS}`;
  if (fit === "text") return TABLE_PROSE_MEASURE_CLASS;
  return fit === "wrap" ? TABLE_WRAP_MEASURE_CLASS : undefined;
}
