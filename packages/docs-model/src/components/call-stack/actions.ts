"use client";

import { createOutlineRowActions } from "../shared/outline-rows-actions";
import { CALL_STACK_KINDS, CallStackRowSchema, CallStackState } from "./state";

/** Path-addressed row edits over `frames`; see shared/outline-rows-actions. */
export const { insertRow, updateRow, removeRow, moveRow, setRows } = createOutlineRowActions({
  blockType: "call-stack",
  childKey: "frames",
  kinds: CALL_STACK_KINDS,
  rowSchema: CallStackRowSchema,
  stateSchema: CallStackState,
  noun: "frame",
});
