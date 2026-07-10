"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";
import { readTableRows } from "../lib";

export const removeRow = defineComponentAction({
  action: "structured-table.removeRow",
  blockType: "structured-table",
  description: "Remove the row at the given index.",
  params: Type.Object(
    {
      index: Type.Integer({
        description: "Row index in [0, rows.length - 1].",
      }),
    },
    { additionalProperties: false },
  ),
  apply(block, params) {
    const rows = readTableRows(block);
    if (params.index < 0 || params.index > rows.length - 1) {
      return {
        ok: false,
        issues: [
          {
            path: "$.params.index",
            message: `"index" must be an integer in [0, ${rows.length - 1}].`,
          },
        ],
      };
    }
    return {
      ok: true,
      props: { rows: rows.filter((_, i) => i !== params.index) },
    };
  },
});
