"use client";

import { Type } from "@sinclair/typebox";
import type { DocValidationIssue } from "../../doc-schema";
import type { BlockStateDefinition } from "../types";

/**
 * Allowed span attributes in table cells: bold/italic/strike/code (literal
 * true) and link (non-empty string). Closed — `reference` and any other
 * attribute are invalid in cells.
 */
const TableCellSpanAttributes = Type.Object(
  {
    bold: Type.Optional(Type.Literal(true)),
    italic: Type.Optional(Type.Literal(true)),
    strike: Type.Optional(Type.Literal(true)),
    code: Type.Optional(Type.Literal(true)),
    link: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

const TableCellSpan = Type.Object(
  {
    insert: Type.String(),
    attributes: Type.Optional(TableCellSpanAttributes),
  },
  { additionalProperties: false },
);

/** A cell is a plain string (canonical unmarked form) or an array of marked spans (see lib.ts's TableCell). */
export const TableCellSchema = Type.Union([Type.String(), Type.Array(TableCellSpan)]);

export const StructuredTableState = Type.Object(
  {
    title: Type.Optional(Type.String()),
    columns: Type.Array(TableCellSchema),
    rows: Type.Array(Type.Array(TableCellSchema)),
    density: Type.Optional(
      Type.Union([
        Type.Literal("compact"),
        Type.Literal("normal"),
        Type.Literal("relaxed"),
      ]),
    ),
  },
  { additionalProperties: false },
);

function checkCanonicalCell(
  cell: unknown,
  path: string,
  issues: DocValidationIssue[],
): void {
  if (!Array.isArray(cell)) return;
  const attributed = cell.some((span) => {
    if (!span || typeof span !== "object") return false;
    const attrs = (span as { attributes?: unknown }).attributes;
    return (
      !!attrs &&
      typeof attrs === "object" &&
      Object.keys(attrs as Record<string, unknown>).length > 0
    );
  });
  if (attributed) return;
  issues.push({
    path,
    message:
      "Span-array cell carries no attributed spans — store an unmarked cell as a plain string (canonical form).",
  });
}

/**
 * Canonical-form invariant beyond the TypeBox schema (the closed schema
 * already rejects `reference` and unknown attributes): a span-array cell
 * must contain at least one attributed span, otherwise it must be the plain
 * string. Runs after the schema passes (see components/validate.ts).
 */
export function checkStructuredTableProps(
  props: Record<string, unknown>,
  basePath: string,
): DocValidationIssue[] {
  const issues: DocValidationIssue[] = [];
  const columns = props.columns;
  if (Array.isArray(columns)) {
    for (const [index, cell] of columns.entries()) {
      checkCanonicalCell(cell, `${basePath}.columns[${index}]`, issues);
    }
  }
  const rows = props.rows;
  if (Array.isArray(rows)) {
    for (const [rowIndex, row] of rows.entries()) {
      if (!Array.isArray(row)) continue;
      for (const [cellIndex, cell] of row.entries()) {
        checkCanonicalCell(cell, `${basePath}.rows[${rowIndex}][${cellIndex}]`, issues);
      }
    }
  }
  return issues;
}

export const structuredTableState: BlockStateDefinition = {
  schema: StructuredTableState,
  carriesText: false,
  check: checkStructuredTableProps,
};
