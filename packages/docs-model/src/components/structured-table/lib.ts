"use client";

import type { DocBlock, DocValidationIssue } from "../../doc-schema";

export function readTableColumns(block: DocBlock): string[] {
  const raw = block.props.columns;
  return Array.isArray(raw)
    ? raw.filter((column): column is string => typeof column === "string")
    : [];
}

export function readTableRows(block: DocBlock): string[][] {
  const raw = block.props.rows;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) =>
      row.map((cell) => (typeof cell === "string" ? cell : String(cell ?? ""))),
    );
}

/** Pads with `fill` / truncates a copy of `row` to exactly `length` cells. */
export function normalizeRow(row: string[], length: number, fill = ""): string[] {
  const next = row.slice(0, length);
  while (next.length < length) next.push(fill);
  return next;
}

/** Resolves "exactly one of column | columnIndex" to a column index. */
export function resolveColumn(
  params: { column?: string; columnIndex?: number },
  columns: string[],
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
    const index = columns.indexOf(name);
    if (index === -1) {
      issues.push({
        path: "$.params.column",
        message: `Unknown column "${name}". Columns: ${columns.map((c) => `"${c}"`).join(", ")}.`,
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
