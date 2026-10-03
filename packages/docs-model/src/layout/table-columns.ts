import type { DeltaSpan } from "../doc-schema";
import { tableCellToPlainText, type TableCell } from "../components/structured-table/lib";
import { TABLE_METRICS } from "./metrics";

/**
 * How the structured table types its cells and sizes its columns, for layout
 * lints. This copies the viewer's pure logic: components/structured-table/
 * cell-code.ts (`liftBacktickCode`), cell-kind.ts (`tableCellKinds`) and
 * column-layout.ts (`tableColumnFits`). docs-viewer's layout-metrics-drift
 * test runs both copies on the same fixtures and fails when one changes
 * alone.
 */

const BACKTICK_SPAN = /`([^`\n]+)`/g;

/** A plain-string cell written with backtick code as the span cell it renders as: each backtick pair becomes a code span. */
export function liftBacktickCode(cell: TableCell): TableCell {
  if (typeof cell !== "string" || !cell.includes("`")) return cell;
  const spans: DeltaSpan[] = [];
  let cursor = 0;
  for (const match of cell.matchAll(BACKTICK_SPAN)) {
    const index = match.index ?? 0;
    if (index > cursor) spans.push({ insert: cell.slice(cursor, index) });
    spans.push({ insert: match[1]!, attributes: { code: true } });
    cursor = index + match[0].length;
  }
  if (spans.length === 0) return cell;
  if (cursor < cell.length) spans.push({ insert: cell.slice(cursor) });
  return spans;
}

/** `"key"`: an identifier cell in the first column. `"mono"`: an identifier cell elsewhere. Undefined: a sans cell. */
export type TableCellKind = "key" | "mono";

const STRICT_IDENTIFIER_PATTERNS: readonly RegExp[] = [
  /^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/,
  /^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+$/,
  /^[A-Za-z_$][\w$-]*(?:\.[A-Za-z_$][\w$-]*)+(?:\(\))?$/,
  /^--[A-Za-z0-9_-]+\*?$/,
  /^-?\d+(?:\.\d+)?(?:px|r?em|ms|s|%|deg|ch|vh|vw|fr|x)?$/,
];
const KEBAB_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+){2,}$/;
const KEBAB_STOPWORDS = new Set(["a", "an", "the", "of", "to", "in", "on", "up", "by", "for", "and", "or", "at", "as"]);

function isStrictIdentifier(text: string): boolean {
  if (STRICT_IDENTIFIER_PATTERNS.some((pattern) => pattern.test(text))) return true;
  return KEBAB_PATTERN.test(text) && !text.split("-").some((segment) => KEBAB_STOPWORDS.has(segment));
}

function isWholeCodeCell(cell: TableCell): boolean {
  if (typeof cell === "string" || cell.length === 0) return false;
  return cell.every(
    (span) => span.attributes?.code === true && !span.attributes.link && span.insert.length > 0,
  ) && cell.some((span) => span.insert.trim().length > 0);
}

function singleToken(cell: TableCell): string | null {
  if (typeof cell !== "string") return null;
  const text = cell.trim();
  return text.length > 0 && !/\s/.test(text) ? text : null;
}

/**
 * Per body cell, its kind. A column qualifies when any body cell is a whole
 * code span or a plain string with a strict identifier shape. In a
 * qualifying column every single-token string and whole code span is an
 * identifier cell, and cells with spaces stay sans.
 */
export function tableCellKinds(
  storedRows: readonly (readonly TableCell[])[],
  columnCount: number,
): (TableCellKind | undefined)[][] {
  const rows = storedRows.map((row) => row.map(liftBacktickCode));
  const qualifies = Array.from({ length: columnCount }, (_, column) =>
    rows.some((row) => {
      const cell = row[column] ?? "";
      if (isWholeCodeCell(cell)) return true;
      const token = singleToken(cell);
      return token !== null && isStrictIdentifier(token);
    }),
  );
  return rows.map((row) =>
    qualifies.map((qualified, column) => {
      if (!qualified) return undefined;
      const cell = row[column] ?? "";
      if (!isWholeCodeCell(cell) && singleToken(cell) === null) return undefined;
      return column === 0 ? "key" : "mono";
    }),
  );
}

/**
 * How a column sizes. `"fit"`: on one line, never wraps. `"prose"`: the one
 * column that wraps at the prose measure and takes the width left over.
 * `"wrap"`: another long text column that wraps at the same measure.
 */
export type TableColumnFit = "fit" | "prose" | "wrap";

/** A text column whose longest body cell is over this many characters wraps. */
export const WRAP_THRESHOLD = TABLE_METRICS.wrapThresholdChars;

export function tableColumnFits(
  rows: readonly (readonly TableCell[])[],
  columnCount: number,
  cellKinds: readonly (readonly (TableCellKind | undefined)[])[],
): TableColumnFit[] {
  const columns = Array.from({ length: columnCount }, (_, column) => {
    const code = cellKinds.some((row) => row[column] !== undefined);
    const lengths = rows.map((row) => tableCellToPlainText(row[column] ?? "").trim().length);
    const total = lengths.reduce((sum, length) => sum + length, 0);
    const sansLengths = lengths.filter((_, row) => cellKinds[row]?.[column] === undefined);
    return {
      code,
      average: rows.length > 0 ? total / rows.length : 0,
      longest: Math.max(0, ...sansLengths),
    };
  });
  let prose = -1;
  columns.forEach((column, index) => {
    if (column.code || column.average === 0) return;
    if (prose === -1 || column.average > columns[prose]!.average) prose = index;
  });
  return columns.map((column, index) => {
    if (index === prose) return "prose";
    return column.longest > WRAP_THRESHOLD ? "wrap" : "fit";
  });
}
