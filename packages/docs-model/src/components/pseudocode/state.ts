"use client";

import { Type } from "@sinclair/typebox";
import type { BlockStateDefinition } from "../types";

/** The text is the pseudocode; `diff: true` reads each line's leading `+`, `-` or space as a diff marker. */
export const PseudocodeState = Type.Object(
  {
    diff: Type.Optional(
      Type.Boolean({ description: "Read each line's leading +, - or space as a diff marker." }),
    ),
  },
  { additionalProperties: false },
);

export const pseudocodeState: BlockStateDefinition = { schema: PseudocodeState, carriesText: true };
