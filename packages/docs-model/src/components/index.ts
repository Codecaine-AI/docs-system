"use client";

import type { DocBlockType } from "../doc-schema";
import { assertComponentRegistry } from "./checks";
import { deriveEmptyProps } from "./empty-state";
import { checkStateProps } from "./validate";
import { canvasComponent } from "./canvas";
import { codeComponent } from "./code";
import { fileTreeComponent } from "./file-tree";
import { interactionSurfaceComponent } from "./interaction-surface";
import { richTextComponent } from "./rich-text";
import { sequenceComponent } from "./sequence";
import { stateShapeComponent } from "./state-shape";
import { structuredTableComponent } from "./structured-table";
import { processOutlineComponent } from "./process-outline";
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
export { processOutlineComponent } from "./process-outline";
export {
  parseProcessOutline,
  readProcessOutlineStepTree,
  readProcessOutlineSteps,
  serializeProcessOutline,
} from "./process-outline";
export type { ProcessOutlineNode, ProcessOutlineStep } from "./process-outline";

export const ALL_COMPONENTS: readonly ComponentBundle[] = [
  richTextComponent,
  codeComponent,
  fileTreeComponent,
  structuredTableComponent,
  interactionSurfaceComponent,
  stateShapeComponent,
  canvasComponent,
  sequenceComponent,
  processOutlineComponent,
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

export { deriveEmptyProps } from "./empty-state";

/** Schema-derived blank props per type — what a blank insert starts as. */
export const EMPTY_STATE_BY_TYPE: ReadonlyMap<
  DocBlockType,
  Record<string, unknown>
> = new Map(
  ALL_COMPONENTS.flatMap((component) =>
    component.manifest.ownedTypes.map((type) => {
      const state = component.states[type];
      if (!state) throw new Error(`No component state registered for block type "${type}".`);
      return [type, deriveEmptyProps(state.schema)] as const;
    }),
  ),
);

/** A fresh copy of the blank props for a type (safe to mutate). */
export function emptyStateFor(type: DocBlockType): Record<string, unknown> {
  const empty = EMPTY_STATE_BY_TYPE.get(type);
  if (!empty) throw new Error(`No blank state registered for block type "${type}".`);
  return structuredClone(empty);
}

// Boot invariant: every type must be blank-insertable — a schema change that
// makes the derived blank invalid fails here, at import time.
for (const [type, empty] of EMPTY_STATE_BY_TYPE) {
  const issues = checkStateProps(type, empty);
  if (issues.length > 0) {
    throw new Error(
      `Blank props for block type "${type}" fail validation: ${issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
  }
}
