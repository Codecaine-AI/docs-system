"use client";

import { TypeCompiler } from "@sinclair/typebox/compiler";
import type { DocBlockType, DocValidationIssue } from "../doc-schema";
import { canvasComponent } from "./canvas";
import { codeComponent } from "./code";
import { schemaIssues } from "./define";
import { fileTreeComponent } from "./file-tree";
import { interactionSurfaceComponent } from "./interaction-surface";
import { richTextComponent } from "./rich-text";
import { sequenceComponent } from "./sequence";
import { stateShapeComponent } from "./state-shape";
import { structuredTableComponent } from "./structured-table";
import { waterfallComponent } from "./waterfall";
import type { ComponentBundle } from "./types";

const COMPONENTS: readonly ComponentBundle[] = [
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

const stateChecks = new Map(
  COMPONENTS.flatMap((component) =>
    component.manifest.ownedTypes.map((type) => {
      const state = component.states[type];
      if (!state) throw new Error(`No component state registered for block type "${type}".`);
      return [type, { compiled: TypeCompiler.Compile(state.schema), state }] as const;
    }),
  ),
);

export function checkStateProps(
  type: DocBlockType,
  props: Record<string, unknown>,
): DocValidationIssue[] {
  const entry = stateChecks.get(type);
  if (!entry) throw new Error(`No compiled component state registered for block type "${type}".`);
  if (!entry.compiled.Check(props)) {
    return schemaIssues(entry.compiled.Errors(props), "$.op.props");
  }
  // Custom per-component invariants (e.g. structured-table's canonical cell
  // form) run only once the schema itself passes.
  return entry.state.check?.(props, "$.op.props") ?? [];
}
