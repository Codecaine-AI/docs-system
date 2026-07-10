"use client";

import type { DocBlockType } from "../doc-schema";
import { assertComponentRegistry } from "./checks";
import type {
  BlockStateDefinition,
  ComponentAction,
  ComponentBundle,
} from "./types";

export * from "./types";
export * from "./define";
export * from "./checks";
export * from "./projection-utils";

export const ALL_COMPONENTS: readonly ComponentBundle[] = [
  // Wave 1 bundles registered in Wave 2: rich-text, code, mermaid, file-tree,
  // structured-table, interaction-surface, canvas.
];

export const COMPONENT_BY_TYPE: ReadonlyMap<DocBlockType, ComponentBundle> = new Map(
  ALL_COMPONENTS.flatMap((component) =>
    component.manifest.ownedTypes.map((type) => [type, component] as const),
  ),
);

export const ACTION_REGISTRY: ReadonlyMap<string, ComponentAction> = new Map(
  ALL_COMPONENTS.flatMap((component) =>
    component.actions.map((action) => [action.action, action] as const),
  ),
);

export function stateFor(type: DocBlockType): BlockStateDefinition {
  const state = COMPONENT_BY_TYPE.get(type)?.states[type];
  if (!state) throw new Error(`No component state registered for block type "${type}".`);
  return state;
}

export function agentViewFor(type: DocBlockType): ComponentBundle["agentView"] {
  const component = COMPONENT_BY_TYPE.get(type);
  if (!component) throw new Error(`No component registered for block type "${type}".`);
  return component.agentView;
}

assertComponentRegistry(ALL_COMPONENTS);
