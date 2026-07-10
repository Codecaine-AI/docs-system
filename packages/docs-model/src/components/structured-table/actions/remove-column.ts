"use client";

import { Type } from "@sinclair/typebox";
import type { DocValidationIssue } from "../../../doc-schema";
import { defineComponentAction } from "../../define";
import {
  normalizeRow,
  readTableColumns,
  readTableRows,
  resolveColumn,
} from "../lib";

export const removeColumn = defineComponentAction({
  action: "structured-table.removeColumn",
  blockType: "structured-table",
  description:
    "Remove a column by name (column) or position (columnIndex), shrinking every row.",
  params: Type.Object(
    {
      column: Type.Optional(
        Type.String({
          description: "Column name — exactly one of column/columnIndex.",
        }),
      ),
      columnIndex: Type.Optional(
        Type.Integer({
          description: "Column position — exactly one of column/columnIndex.",
        }),
      ),
    },
  ),
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const columns = readTableColumns(block);
    const columnIndex = resolveColumn(params, columns, issues);
    if (issues.length > 0) return { ok: false, issues };

    const nextColumns = columns.filter((_, i) => i !== columnIndex);
    const nextRows = readTableRows(block).map((row) =>
      normalizeRow(row, columns.length).filter((_, i) => i !== columnIndex),
    );
    return { ok: true, props: { columns: nextColumns, rows: nextRows } };
  },
});
