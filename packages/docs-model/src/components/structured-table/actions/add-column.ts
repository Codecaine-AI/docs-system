"use client";

import { Type } from "@sinclair/typebox";
import type { DocValidationIssue } from "../../../doc-schema";
import { defineComponentAction } from "../../define";
import {
  normalizeRow,
  parseTableCellInput,
  readTableColumns,
  readTableRows,
  tableCellToPlainText,
} from "../lib";

export const addColumn = defineComponentAction({
  action: "structured-table.addColumn",
  blockType: "structured-table",
  description:
    "Insert a column (default at the end), extending every row with the fill value.",
  params: Type.Object(
    {
      name: Type.String({
        minLength: 1,
        description:
          "New column name, as inline markdown (its plain text must not match an existing column).",
      }),
      index: Type.Optional(
        Type.Integer({
          description: "Insert position in [0, columns.length]; default end.",
        }),
      ),
      fill: Type.Optional(
        Type.String({
          description:
            'Cell value for existing rows (inline markdown; plain text stays plain); default "".',
        }),
      ),
    },
  ),
  apply(block, params) {
    const issues: DocValidationIssue[] = [];
    const columns = readTableColumns(block);
    const name = parseTableCellInput(params.name);
    const nameText = tableCellToPlainText(name);
    if (columns.some((column) => tableCellToPlainText(column) === nameText)) {
      issues.push({
        path: "$.params.name",
        message: `Column "${params.name}" already exists.`,
      });
    }
    const index = params.index ?? columns.length;
    if (index < 0 || index > columns.length) {
      issues.push({
        path: "$.params.index",
        message: `"index" must be an integer in [0, ${columns.length}].`,
      });
    }
    if (issues.length > 0) return { ok: false, issues };

    const fill = parseTableCellInput(params.fill ?? "");
    const nextColumns = [...columns];
    nextColumns.splice(index, 0, name);
    const nextRows = readTableRows(block).map((row) => {
      const padded = normalizeRow(row, columns.length);
      padded.splice(index, 0, fill);
      return padded;
    });
    return { ok: true, props: { columns: nextColumns, rows: nextRows } };
  },
});
