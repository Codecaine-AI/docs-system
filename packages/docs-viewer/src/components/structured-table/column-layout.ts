import { tableCellToPlainText, type TableCell } from "@codecaine-ai/docs-model";
import type { TableCellKind } from "./cell-kind";
import {
  TABLE_COLUMN_FIT_CLASSES,
  TABLE_STICKY_BODY_CELL_CLASSES,
  TABLE_STICKY_HEADER_CELL_CLASSES,
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
 * - `"wrap"`: a second long text column (some cell longer than
 *   WRAP_THRESHOLD characters). It wraps at the same measure rather than
 *   pushing one very long line, but it is not the column the table flexes.
 *
 * The read block and the editor grid both feed this the same cell kinds, so
 * a table sizes identically at rest on both surfaces.
 */
export type TableColumnFit = "fit" | "prose" | "wrap";

/** A text column whose longest body cell is under this many characters stays on one line. */
export const WRAP_THRESHOLD = 40;

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
    if (column.code || column.average === 0) return;
    if (prose === -1 || column.average > columns[prose].average) prose = index;
  });

  return columns.map((column, index) => {
    if (index === prose) return "prose";
    return column.longest > WRAP_THRESHOLD ? "wrap" : "fit";
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

/** Whether a column's cell content sits inside the prose measure. */
export function hasProseMeasure(fit: TableColumnFit | undefined): boolean {
  return fit === "prose" || fit === "wrap";
}
