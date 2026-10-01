"use client";

import { Type } from "@sinclair/typebox";
import type { DocBlock } from "../../doc-schema";
import type { BlockStateDefinition } from "../types";
import { outlineRowSchema, readOutlineRows, type OutlineRow } from "../shared/outline-rows";

export const COMPONENT_TREE_KINDS = ["component", "hook", "branch"] as const;

export const ComponentTreeRowSchema = outlineRowSchema("ComponentTreeRow", "nodes", COMPONENT_TREE_KINDS, "\"component\" (default) is a rendered element; \"hook\" a hook call; \"branch\" a condition row that may own nodes.");

export const ComponentTreeState = Type.Object({ nodes: Type.Array(ComponentTreeRowSchema) }, { additionalProperties: false });

export const componentTreeState: BlockStateDefinition = { schema: ComponentTreeState, carriesText: false };

/** Tolerant read of the row tree; children always present. */
export function readComponentTree(block: DocBlock): OutlineRow[] {
  return readOutlineRows(block.props.nodes, "nodes", COMPONENT_TREE_KINDS);
}
