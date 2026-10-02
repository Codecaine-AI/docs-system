import type { TableCell } from "@codecaine-ai/docs-model";
import { liftBacktickCode } from "./cell-code";

/**
 * How a body cell is typed: `"mono"` cells set in plain mono ink, `"key"` is
 * a mono cell in the FIRST column (the row's one colored focal point).
 * Undefined leaves the cell in the sans body style. The read block and the
 * editor grid both put it on the td as `data-cell-kind`, which the shared
 * body-cell classes key on.
 */
export type TableCellKind = "key" | "mono";

/**
 * Strict identifier shapes. One match anywhere in a column's body opts that
 * column in; ordinary words ("color", "done", "read-only") never match, so a
 * column of plain words stays sans.
 */
const STRICT_IDENTIFIER_PATTERNS: readonly RegExp[] = [
  // camelCase: headerRuleWidth, cellPaddingY
  /^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/,
  // snake_case and SCREAMING_SNAKE: row_rule, MAX_ROWS
  /^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+$/,
  // dotted paths, optionally called: file-tree.addEntry, editor.commands.focus()
  /^[A-Za-z_$][\w$-]*(?:\.[A-Za-z_$][\w$-]*)+(?:\(\))?$/,
  // CSS custom properties, globs included: --docs-table-bg, --docs-shape-*
  /^--[A-Za-z0-9_-]+\*?$/,
  // numbers with an optional unit: 0.8, 1.5px, 120ms, 50%
  /^-?\d+(?:\.\d+)?(?:px|r?em|ms|s|%|deg|ch|vh|vw|fr|x)?$/,
];

/** Kebab case counts only from three segments up, and never with an English connective in it ("up-to-date", "end-to-end"). */
const KEBAB_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+){2,}$/;
const KEBAB_STOPWORDS = new Set(["a", "an", "the", "of", "to", "in", "on", "up", "by", "for", "and", "or", "at", "as"]);

function isStrictIdentifier(text: string): boolean {
  if (STRICT_IDENTIFIER_PATTERNS.some((pattern) => pattern.test(text))) return true;
  return KEBAB_PATTERN.test(text) && !text.split("-").some((segment) => KEBAB_STOPWORDS.has(segment));
}

/** A span cell whose every span carries the inline-code mark (and no link): one whole code span. */
function isWholeCodeCell(cell: TableCell): boolean {
  if (typeof cell === "string" || cell.length === 0) return false;
  return cell.every(
    (span) => span.attributes?.code === true && !span.attributes.link && span.insert.length > 0,
  ) && cell.some((span) => span.insert.trim().length > 0);
}

/** A plain-string cell that is one token: no whitespace anywhere once trimmed. */
function singleToken(cell: TableCell): string | null {
  if (typeof cell !== "string") return null;
  const text = cell.trim();
  return text.length > 0 && !/\s/.test(text) ? text : null;
}

/**
 * Per body cell, `"key" | "mono" | undefined` (rows padded to the column
 * count). A column qualifies when any body cell is a whole code span or a
 * plain string matching a strict identifier shape; inside a qualifying
 * column every single-token plain string and every whole code span sets
 * mono, while cells with spaces (prose) and other rich cells stay sans.
 */
export function tableCellKinds(
  storedRows: readonly (readonly TableCell[])[],
  columnCount: number,
): (TableCellKind | undefined)[][] {
  // Backtick code in a plain string counts as the code span it renders as.
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
