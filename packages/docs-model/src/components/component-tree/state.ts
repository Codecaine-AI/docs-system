"use client";

import { Type } from "@sinclair/typebox";
import type { DocBlock } from "../../doc-schema";
import type { BlockStateDefinition } from "../types";
import { outlineRowSchema, readOutlineRows, type OutlineRow } from "../shared/outline-rows";

export const COMPONENT_TREE_KINDS = ["component", "hook", "branch"] as const;

export const ComponentTreeRowSchema = outlineRowSchema("ComponentTreeRow", "nodes", COMPONENT_TREE_KINDS, "\"component\" (default) is a rendered element; \"hook\" a hook call; \"branch\" a condition row that may own nodes. Give each arm of an if/else or a ternary its own branch row with the source's own condition, such as \"descriptor\", and write the last arm as \"else\".");

export const ComponentTreeState = Type.Object({ nodes: Type.Array(ComponentTreeRowSchema) }, { additionalProperties: false });

export const componentTreeState: BlockStateDefinition = { schema: ComponentTreeState, carriesText: false };

/** Tolerant read of the row tree; children always present. */
export function readComponentTree(block: DocBlock): OutlineRow[] {
  return readOutlineRows(block.props.nodes, "nodes", COMPONENT_TREE_KINDS);
}
