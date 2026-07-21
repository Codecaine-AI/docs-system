"use client";

import type {
  DeltaSpan,
  DeltaSpanAttributes,
  DocBlock,
  DocValidationIssue,
} from "../../doc-schema";
import type { SpectreRef } from "../../spectre-ref";
import { wrapMarkdownMarks } from "../../delta-markdown";
import { inlineToDelta } from "../../markdown-to-delta";

/**
 * A structured-table cell (body cells AND column headers; NOT the title):
 * either a plain string (the canonical form for unmarked content) or a
 * DeltaSpan[] carrying inline marks. Allowed span attributes in cells are
 * bold/italic/strike/code (literal true) and link (non-empty string) —
 * `reference` is NOT valid in cells; the write path downgrades parser-made
 * references to plain links (see parseTableCellInput).
 *
 * Canonical form (keeps canonical bytes deterministic): a cell whose spans
 * carry no attributes must be stored as the plain string, an empty cell as
 * "". A span-array cell containing zero attributed spans is non-canonical
 * and fails validation (see state.ts's checkStructuredTableProps). Actions
 * always write normalized cells.
 */
export type TableCell = string | DeltaSpan[];

function isCellSpan(value: unknown): value is DeltaSpan {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { insert?: unknown }).insert === "string"
  );
}

/** Defensive single-cell read: strings and span arrays pass, junk coerces to a string. */
function readCell(cell: unknown): TableCell {
  if (typeof cell === "string") return cell;
  if (Array.isArray(cell)) return cell.filter(isCellSpan);
  return String(cell ?? "");
}

export function readTableColumns(block: DocBlock): TableCell[] {
  const raw = block.props.columns;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (column): column is string | unknown[] =>
        typeof column === "string" || Array.isArray(column),
    )
    .map((column) =>
      typeof column === "string" ? column : column.filter(isCellSpan),
    );
}

export function readTableRows(block: DocBlock): TableCell[][] {
  const raw = block.props.rows;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.map(readCell));
}

/** Pads with `fill` / truncates a copy of `row` to exactly `length` cells. */
export function normalizeRow(
  row: TableCell[],
  length: number,
  fill: TableCell = "",
): TableCell[] {
  const next = row.slice(0, length);
  while (next.length < length) next.push(fill);
  return next;
}

/** Attribute equality over the cell mark vocabulary (+ reference, defensively, for pre-downgrade spans). */
function sameCellAttributes(
  a?: DeltaSpanAttributes,
  b?: DeltaSpanAttributes,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  for (const key of ["bold", "italic", "strike", "code", "link"] as const) {
    if (a[key] !== b[key]) return false;
  }
  const refA = a.reference;
  const refB = b.reference;
  if (!refA && !refB) return true;
  if (!refA || !refB) return false;
  return (
    refA.kind === refB.kind &&
    refA.path === refB.path &&
    refA.symbol === refB.symbol &&
    refA.line === refB.line &&
    refA.section === refB.section &&
    refA.label === refB.label
  );
}

/** The span's attributes when it actually carries at least one, else undefined. */
function spanAttributes(span: DeltaSpan): DeltaSpanAttributes | undefined {
  const attrs = span.attributes;
  return attrs && Object.keys(attrs).length > 0 ? attrs : undefined;
}

/**
 * Normalizes a cell to its canonical form: merges adjacent same-attribute
 * spans, drops empty inserts, returns the plain string when no attributes
 * remain, "" for an empty cell.
 */
export function normalizeTableCell(cell: string | DeltaSpan[]): TableCell {
  if (typeof cell === "string") return cell;
  const merged: DeltaSpan[] = [];
  for (const span of cell) {
    if (span.insert.length === 0) continue;
    const attributes = spanAttributes(span);
    const prev = merged[merged.length - 1];
    if (prev && sameCellAttributes(prev.attributes, attributes)) {
      merged[merged.length - 1] = prev.attributes
        ? { insert: prev.insert + span.insert, attributes: prev.attributes }
        : { insert: prev.insert + span.insert };
    } else {
      merged.push(
        attributes ? { insert: span.insert, attributes } : { insert: span.insert },
      );
    }
  }
  if (merged.some((span) => span.attributes !== undefined)) return merged;
  return merged.map((span) => span.insert).join("");
}

export function tableCellToPlainText(cell: TableCell): string {
  if (typeof cell === "string") return cell;
  return cell.map((span) => span.insert).join("");
}

/**
 * Inline-markdown projection of a cell. Plain strings pass through verbatim
 * (no new escaping — the pipe-table projection stays byte-identical for
 * plain cells); span cells render their marks via the shared
 * wrapMarkdownMarks syntax.
 */
export function tableCellToMarkdown(cell: TableCell): string {
  if (typeof cell === "string") return cell;
  return cell.map((span) => wrapMarkdownMarks(span.insert, span.attributes)).join("");
}

/** href form for a reference downgraded to a plain link: path plus an anchor suffix when present. */
function referenceHref(ref: SpectreRef): string {
  if (ref.section !== undefined) return `${ref.path}#${ref.section}`;
  if (ref.line !== undefined) return `${ref.path}#L${ref.line}`;
  if (ref.symbol !== undefined) return `${ref.path}#${ref.symbol}`;
  return ref.path;
}

/**
 * Cells forbid the `reference` attribute — downgrade any reference the
 * inline-markdown parser produced to a plain `link` mark on the same span.
 */
function downgradeReference(span: DeltaSpan): DeltaSpan {
  const attrs = span.attributes;
  if (!attrs?.reference) return span;
  const { reference, ...rest } = attrs;
  return { insert: span.insert, attributes: { ...rest, link: referenceHref(reference) } };
}

/**
 * The agent write surface for cell content: parses an action `value` string
 * as inline markdown (inlineToDelta, no docPath), downgrades any reference
 * attributes to plain links, and normalizes to the canonical cell form.
 */
export function parseTableCellInput(value: string): TableCell {
  const { spans } = inlineToDelta(value);
  return normalizeTableCell(spans.map(downgradeReference));
}

/** Resolves "exactly one of column | columnIndex" to a column index; names match a column's plain text. */
export function resolveColumn(
  params: { column?: string; columnIndex?: number },
  columns: TableCell[],
  issues: DocValidationIssue[],
): number | undefined {
  const hasColumn = params.column !== undefined;
  const hasColumnIndex = params.columnIndex !== undefined;
  if (hasColumn === hasColumnIndex) {
    issues.push({
      path: "$.params.column",
      message: 'Provide exactly one of "column" or "columnIndex".',
    });
    return undefined;
  }
  if (hasColumn) {
    const name = params.column as string;
    if (name.length === 0) {
      issues.push({
        path: "$.params.column",
        message: '"column" is required and must be a non-empty string.',
      });
      return undefined;
    }
    const names = columns.map(tableCellToPlainText);
    const index = names.indexOf(name);
    if (index === -1) {
      issues.push({
        path: "$.params.column",
        message: `Unknown column "${name}". Columns: ${names.map((c) => `"${c}"`).join(", ")}.`,
      });
      return undefined;
    }
    return index;
  }
  const columnIndex = params.columnIndex as number;
  if (columnIndex < 0 || columnIndex > columns.length - 1) {
    issues.push({
      path: "$.params.columnIndex",
      message: `"columnIndex" must be an integer in [0, ${columns.length - 1}].`,
    });
    return undefined;
  }
  return columnIndex;
}
