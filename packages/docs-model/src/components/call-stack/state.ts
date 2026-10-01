"use client";

import { Type } from "@sinclair/typebox";
import type { DocBlock } from "../../doc-schema";
import type { BlockStateDefinition } from "../types";
import { outlineRowSchema, readOutlineRows, type OutlineRow } from "../shared/outline-rows";

export const CALL_STACK_KINDS = ["call", "branch"] as const;

export const CallStackRowSchema = outlineRowSchema("CallStackRow", "frames", CALL_STACK_KINDS, "\"call\" (default) is a function call; \"branch\" is a condition row that may own frames.");

export const CallStackState = Type.Object({ frames: Type.Array(CallStackRowSchema) }, { additionalProperties: false });

export const callStackState: BlockStateDefinition = { schema: CallStackState, carriesText: false };

/** Tolerant read of the row tree; children always present. */
export function readCallStack(block: DocBlock): OutlineRow[] {
  return readOutlineRows(block.props.frames, "frames", CALL_STACK_KINDS);
}
