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

export const updateCell = defineComponentAction({
  action: "structured-table.updateCell",
  blockType: "structured-table",
  description:
    "Set one cell, addressing the column by name (column) or position (columnIndex).",
  params: Type.Object(
    {
      rowIndex: Type.Integer({
        description: "Row index in [0, rows.length - 1].",
      }),
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
      value: Type.String({ description: "New cell value." }),
    },
  ),
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const columns = readTableColumns(block);
    const rows = readTableRows(block);
    if (params.rowIndex < 0 || params.rowIndex > rows.length - 1) {
      issues.push({
        path: "$.params.rowIndex",
        message: `"rowIndex" must be an integer in [0, ${rows.length - 1}].`,
      });
    }
    const columnIndex = resolveColumn(params, columns, issues);
    if (issues.length > 0) return { ok: false, issues };

    const next = rows.map((row) => [...row]);
    const row = normalizeRow(next[params.rowIndex], columns.length);
    row[columnIndex as number] = params.value;
    next[params.rowIndex] = row;
    return { ok: true, props: { rows: next } };
  },
});
