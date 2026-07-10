"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { normalizeRow, readTableColumns, readTableRows } from "../lib";

export const addRow = defineComponentAction({
  action: "structured-table.addRow",
  blockType: "structured-table",
  description:
    "Insert a row (cells padded/truncated to the column count); index defaults to the end.",
  params: Type.Object(
    {
      cells: Type.Array(Type.String(), {
        description: "Cell strings, in column order.",
      }),
      index: Type.Optional(
        Type.Integer({
          description: "Insert position in [0, rows.length]; default end.",
        }),
      ),
    },
    { additionalProperties: false },
  ),
  apply(block, params) {
    const columns = readTableColumns(block);
    const rows = readTableRows(block);
    const index = params.index ?? rows.length;
    if (index < 0 || index > rows.length) {
      return {
        ok: false,
        issues: [
          {
            path: "$.params.index",
            message: `"index" must be an integer in [0, ${rows.length}].`,
          },
        ],
      };
    }

    const next = [...rows];
    next.splice(index, 0, normalizeRow(params.cells, columns.length));
    return { ok: true, props: { rows: next } };
  },
});
