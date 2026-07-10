"use client";

import type {
  BlockActionDefinition,
  BlockActionResult,
} from "../block-actions";
import type { DocBlockType } from "../doc-schema";
import { checkParams, deriveParamSpecs } from "./define";
import { ACTION_REGISTRY } from "./index";
import type { ComponentAction } from "./types";

export type BlockCategory = "text" | "object";

/**
 * Editing category per block type. Text types edit through generic ops
 * (updateBlock text/props, split/merge); object types edit their structured
 * props through named actions.
 *
 * `code` counts as OBJECT because of its structured `annotations` prop
 * (edited via code.setAnnotation / code.removeAnnotation) — its SOURCE text
 * still edits through generic text ops like any text block.
 *
 * @deprecated Removed in P2 when discovery serves component manifests directly.
 */
export const BLOCK_TYPE_CATEGORY: Record<DocBlockType, BlockCategory> = {
  paragraph: "text",
  heading: "text",
  "list-item": "text",
  quote: "text",
  callout: "text",
  code: "object",
  divider: "object",
  "structured-table": "object",
  "file-tree": "object",
  "interaction-surface": "object",
  mermaid: "object",
  canvas: "object",
  image: "object",
  video: "object",
};

export const LEGACY_ACTION_ORDER: readonly string[] = [
  "file-tree.addEntry",
  "file-tree.removeEntry",
  "file-tree.updateEntry",
  "structured-table.addRow",
  "structured-table.removeRow",
  "structured-table.updateCell",
  "structured-table.addColumn",
  "structured-table.removeColumn",
  "interaction-surface.addOperation",
  "interaction-surface.updateOperation",
  "interaction-surface.removeOperation",
  "code.setAnnotation",
  "code.removeAnnotation",
];

export function toLegacyDefinition(action: ComponentAction): BlockActionDefinition {
  return {
    action: action.action,
    blockType: action.blockType,
    description: action.description,
    params: deriveParamSpecs(action.params),
    apply(block, params): BlockActionResult {
      const issues = checkParams(action, params);
      if (issues.length > 0) return { ok: false, issues };
      if ("apply" in action) return action.apply(block, params);
      return {
        ok: false,
        issues: [
          {
            path: "$.op.action",
            message: `Action "${action.action}" is handled by authority "${action.forward.authority}".`,
          },
        ],
      };
    },
  };
}

export const BLOCK_ACTIONS: ReadonlyMap<string, BlockActionDefinition> = new Map(
  LEGACY_ACTION_ORDER.map((key) => {
    const action = ACTION_REGISTRY.get(key);
    if (!action) throw new Error(`Legacy block action "${key}" is not registered.`);
    return [key, toLegacyDefinition(action)] as const;
  }),
);

export function getBlockAction(action: string): BlockActionDefinition | undefined {
  return BLOCK_ACTIONS.get(action);
}

export function listBlockActions(blockType?: DocBlockType): BlockActionDefinition[] {
  const all = [...BLOCK_ACTIONS.values()];
  return blockType === undefined ? all : all.filter((definition) => definition.blockType === blockType);
}

// TODO(Wave 2): Re-export FILE_TREE_CHANGES, FileTreeEntry,
// readFileTreeEntries, and FileTreeChange from the file-tree bundle home.
// TODO(Wave 2): Re-export INTERACTION_SURFACE_KINDS,
// InteractionSurfaceKind, InteractionSurfaceParam, InteractionSurfaceOperation,
// and readInteractionSurfaceOperations from the interaction-surface bundle home.
// TODO(Wave 2): Re-export CodeAnnotation and readCodeAnnotations from the code
// bundle home.
// TODO(Wave 2): Re-export BlockActionParamType and BlockActionParamSpec from
// their bundle-home compatibility definitions.
