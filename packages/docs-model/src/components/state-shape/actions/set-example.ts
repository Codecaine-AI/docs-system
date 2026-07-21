"use client";

import { Type } from "@sinclair/typebox";
import { defineComponentAction } from "../../define";

export const setExample = defineComponentAction({
  action: "state-shape.setExample",
  blockType: "state-shape",
  description:
    "Set the JSON example instance rendered beside the field tree (example must parse as JSON; null clears it).",
  params: Type.Object({
    example: Type.Union([Type.String({ minLength: 1 }), Type.Null()], {
      description: "JSON text of an example instance of this shape; null clears the example.",
    }),
  }),
  apply(_block, { example }) {
    if (example === null) return { ok: true, props: { example: undefined } };
    try {
      JSON.parse(example);
    } catch {
      return {
        ok: false,
        issues: [
          {
            path: "$.params.example",
            message: "example does not parse as JSON.",
          },
        ],
      };
    }
    return { ok: true, props: { example } };
  },
});
