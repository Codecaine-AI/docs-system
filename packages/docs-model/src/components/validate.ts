"use client";

import { TypeCompiler } from "@sinclair/typebox/compiler";
import type { DocBlockType, DocValidationIssue } from "../doc-schema";
import { canvasComponent } from "./canvas";
import { codeComponent } from "./code";
import { schemaIssues } from "./define";
import { fileTreeComponent } from "./file-tree";
import { interactionSurfaceComponent } from "./interaction-surface";
import { mermaidComponent } from "./mermaid";
import { richTextComponent } from "./rich-text";
import { sequenceComponent } from "./sequence";
import { structuredTableComponent } from "./structured-table";
import type { ComponentBundle } from "./types";

const COMPONENTS: readonly ComponentBundle[] = [
  richTextComponent,
  codeComponent,
  mermaidComponent,
  fileTreeComponent,
  structuredTableComponent,
  interactionSurfaceComponent,
  canvasComponent,
  sequenceComponent,
];

const stateChecks = new Map(
  COMPONENTS.flatMap((component) =>
    component.manifest.ownedTypes.map((type) => {
      const state = component.states[type];
      if (!state) throw new Error(`No component state registered for block type "${type}".`);
      return [type, TypeCompiler.Compile(state.schema)] as const;
    }),
  ),
);

export function checkStateProps(
  type: DocBlockType,
  props: Record<string, unknown>,
): DocValidationIssue[] {
  const check = stateChecks.get(type);
  if (!check) throw new Error(`No compiled component state registered for block type "${type}".`);
  if (check.Check(props)) return [];
  return schemaIssues(check.Errors(props), "$.op.props");
}
