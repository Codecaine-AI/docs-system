"use client";

import type { DocBlock, DocBlockType } from "../doc-schema";
import { codeComponent } from "./code";
import { checkParams, deriveParamSpecs } from "./define";
import { fileTreeComponent } from "./file-tree";
import { interactionSurfaceComponent } from "./interaction-surface";
import { structuredTableComponent } from "./structured-table";
import type { BlockActionResult, ComponentAction } from "./types";

export type BlockActionParamType = "string" | "number" | "boolean" | "object" | "array";

export type BlockActionParamSpec = {
  name: string;
  type: BlockActionParamType;
  required: boolean;
  description: string;
};

export type BlockActionDefinition = {
  /** Registry key: "<blockType>.<verb>". */
  action: string;
  blockType: DocBlockType;
  /** One-line, agent-facing. */
  description: string;
  /** Discovery-only specs; the runtime checks live in apply(). */
  params: BlockActionParamSpec[];
  /** Pure: validates params itself and never mutates the input block. */
  apply(block: DocBlock, params: Record<string, unknown>): BlockActionResult;
};

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

const LEGACY_ACTION_REGISTRY: ReadonlyMap<string, ComponentAction> = new Map(
  [fileTreeComponent, structuredTableComponent, interactionSurfaceComponent, codeComponent].flatMap(
    (component) => component.actions.map((action) => [action.action, action] as const),
  ),
);

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
    const action = LEGACY_ACTION_REGISTRY.get(key);
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

export { FILE_TREE_CHANGES, readFileTreeEntries } from "./file-tree/state";
export type { FileTreeChange, FileTreeEntry } from "./file-tree/state";
export {
  INTERACTION_SURFACE_KINDS,
  readInteractionSurfaceOperations,
} from "./interaction-surface/state";
export type {
  InteractionSurfaceKind,
  InteractionSurfaceOperation,
  InteractionSurfaceParam,
} from "./interaction-surface/state";
export { readCodeAnnotations } from "./code/state";
export type { CodeAnnotation } from "./code/state";
