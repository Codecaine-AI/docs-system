"use client";

import type { InteractionSurfaceOperation, InteractionSurfaceParam } from "./state";

/** Builds a plain-JSON param object with only the defined keys. */
function operationParamToProps(param: InteractionSurfaceParam): Record<string, unknown> {
  const out: Record<string, unknown> = { name: param.name };
  if (param.type !== undefined) out.type = param.type;
  if (param.required !== undefined) out.required = param.required;
  if (param.description !== undefined) out.description = param.description;
  return out;
}

function operationToProps(operation: InteractionSurfaceOperation): Record<string, unknown> {
  const out: Record<string, unknown> = { name: operation.name };
  if (operation.description !== undefined) out.description = operation.description;
  if (operation.params !== undefined) out.params = operation.params.map(operationParamToProps);
  if (operation.returns !== undefined) out.returns = operation.returns;
  if (operation.kind !== undefined) out.kind = operation.kind;
  return out;
}

export function operationsPatch(operations: InteractionSurfaceOperation[]): Record<string, unknown> {
  return { operations: operations.map(operationToProps) };
}
