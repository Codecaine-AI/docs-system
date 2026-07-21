"use client";

import type { DocBlockType } from "../doc-schema";
import { assertComponentRegistry } from "./checks";
import { canvasComponent } from "./canvas";
import { codeComponent } from "./code";
import { fileTreeComponent } from "./file-tree";
import { interactionSurfaceComponent } from "./interaction-surface";
import { mermaidComponent } from "./mermaid";
import { richTextComponent } from "./rich-text";
import { sequenceComponent } from "./sequence";
import { structuredTableComponent } from "./structured-table";
import type {
  BlockStateDefinition,
  ComponentAction,
  ComponentBundle,
} from "./types";

export * from "./types";
export * from "./define";
export * from "./checks";
export * from "./projection-utils";
export * from "./compat";
export * from "./validate";

export { richTextComponent } from "./rich-text";
export { codeComponent } from "./code";
export { mermaidComponent } from "./mermaid";
export { fileTreeComponent } from "./file-tree";
export { structuredTableComponent } from "./structured-table";
export { interactionSurfaceComponent } from "./interaction-surface";
export { canvasComponent } from "./canvas";
export { sequenceComponent } from "./sequence";

export const ALL_COMPONENTS: readonly ComponentBundle[] = [
  richTextComponent,
  codeComponent,
  mermaidComponent,
  fileTreeComponent,
  structuredTableComponent,
  interactionSurfaceComponent,
  canvasComponent,
  sequenceComponent,
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
