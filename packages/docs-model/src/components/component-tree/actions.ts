"use client";

import { createOutlineRowActions } from "../shared/outline-rows-actions";
import { COMPONENT_TREE_KINDS, ComponentTreeRowSchema, ComponentTreeState } from "./state";

/** Path-addressed row edits over `nodes`; see shared/outline-rows-actions. */
export const { insertRow, updateRow, removeRow, moveRow, setRows } = createOutlineRowActions({
  blockType: "component-tree",
  childKey: "nodes",
  kinds: COMPONENT_TREE_KINDS,
  rowSchema: ComponentTreeRowSchema,
  stateSchema: ComponentTreeState,
  noun: "node",
});
