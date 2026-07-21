"use client";

import { cloneField } from "../shared/field";
import type { InteractionSurfaceOperation } from "./state";

function operationToProps(operation: InteractionSurfaceOperation): Record<string, unknown> {
  const out: Record<string, unknown> = { name: operation.name };
  if (operation.description !== undefined) out.description = operation.description;
  // cloneField builds plain-JSON param objects (recursively) with only the defined keys.
  if (operation.params !== undefined) out.params = operation.params.map(cloneField);
  if (operation.returns !== undefined) out.returns = operation.returns;
  if (operation.kind !== undefined) out.kind = operation.kind;
  return out;
}

export function operationsPatch(operations: InteractionSurfaceOperation[]): Record<string, unknown> {
  return { operations: operations.map(operationToProps) };
}
