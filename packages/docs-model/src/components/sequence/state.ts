"use client";

import { Type } from "@sinclair/typebox";
import type { BlockStateDefinition } from "../types";

export const SequenceState = Type.Object(
  {
    sequenceId: Type.Optional(Type.String({ minLength: 1 })),
    src: Type.Optional(Type.String({ minLength: 1 })),
    title: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const sequenceState: BlockStateDefinition = {
  schema: SequenceState,
  carriesText: false,
};
