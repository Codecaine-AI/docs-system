"use client";

import { Type } from "@sinclair/typebox";
import type { BlockStateDefinition } from "../types";

export const StructuredTableState = Type.Object(
  {
    title: Type.Optional(Type.String()),
    columns: Type.Array(Type.String()),
    rows: Type.Array(Type.Array(Type.String())),
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

export const structuredTableState: BlockStateDefinition = {
  schema: StructuredTableState,
  carriesText: false,
};
