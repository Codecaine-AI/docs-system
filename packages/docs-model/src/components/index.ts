"use client";

import type { DocBlockType } from "../doc-schema";
import { assertComponentRegistry } from "./checks";
import { canvasComponent } from "./canvas";
import { codeComponent } from "./code";
import { fileTreeComponent } from "./file-tree";
import { interactionSurfaceComponent } from "./interaction-surface";
import { richTextComponent } from "./rich-text";
import { sequenceComponent } from "./sequence";
import { stateShapeComponent } from "./state-shape";
import { structuredTableComponent } from "./structured-table";
import { waterfallComponent } from "./waterfall";
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
export { fileTreeComponent } from "./file-tree";
export { structuredTableComponent } from "./structured-table";
export {
  normalizeRow,
  normalizeTableCell,
  parseTableCellInput,
  readTableColumns,
  readTableRows,
  tableCellToMarkdown,
  tableCellToPlainText,
} from "./structured-table";
export type { TableCell } from "./structured-table";
export { interactionSurfaceComponent } from "./interaction-surface";
export { stateShapeComponent } from "./state-shape";
export {
  readStateShapeExample,
  readStateShapeFields,
  readStateShapeSource,
} from "./state-shape";
export type { StateShapeSource } from "./state-shape";
export { FieldSchema, cloneField, fieldLines, readFields } from "./shared/field";
export type { Field } from "./shared/field";
export { printJsonLines } from "./shared/json-lines";
export type { JsonLineRange, JsonLinesResult } from "./shared/json-lines";
export { canvasComponent } from "./canvas";
export { sequenceComponent } from "./sequence";
export { waterfallComponent } from "./waterfall";
export {
  parseWaterfall,
  readWaterfallStepTree,
  readWaterfallSteps,
  serializeWaterfall,
} from "./waterfall";
export type { WaterfallNode, WaterfallStep } from "./waterfall";

export const ALL_COMPONENTS: readonly ComponentBundle[] = [
  richTextComponent,
  codeComponent,
  fileTreeComponent,
  structuredTableComponent,
  interactionSurfaceComponent,
  stateShapeComponent,
  canvasComponent,
  sequenceComponent,
  waterfallComponent,
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
