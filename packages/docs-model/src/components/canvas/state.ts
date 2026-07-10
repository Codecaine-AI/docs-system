"use client";

import { Type } from "@sinclair/typebox";
import type { BlockStateDefinition } from "../types";

export const CanvasState = Type.Object(
  {
    canvasId: Type.Optional(Type.String({ minLength: 1 })),
    src: Type.Optional(Type.String({ minLength: 1 })),
    view: Type.Optional(Type.String()),
    title: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const canvasState: BlockStateDefinition = {
  schema: CanvasState,
  carriesText: false,
};
