import { createElement } from "react";
import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import type { DocBlockDescriptor } from "../../render/block-registry";
import {
  STRUCTURAL_OPS,
  blockAttrs,
  el,
  invalidBlockPlaceholder,
  stringProp,
} from "../../render/descriptor-helpers";
import {
  INTERACTION_SURFACE_AGENT_DESCRIPTION,
  INTERACTION_SURFACE_LABEL,
  InteractionSurfaceBlock,
  type InteractionSurfaceOperation,
} from "./InteractionSurfaceDocsBlock";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const INTERACTION_SURFACE_KINDS = ["action", "query", "event"] as const;

/** Strict recursive param read (params are shared Field nodes): any malformed entry invalidates the whole block. */
function interactionSurfaceParams(raw: unknown): InteractionSurfaceOperation["params"] | null {
  if (!Array.isArray(raw)) return null;
  const params: NonNullable<InteractionSurfaceOperation["params"]> = [];
  for (const param of raw) {
    if (!isPlainRecord(param)) return null;
    if (typeof param.name !== "string" || !param.name.trim()) return null;
    if (param.type !== undefined && typeof param.type !== "string") return null;
    if (param.required !== undefined && typeof param.required !== "boolean") return null;
    if (param.description !== undefined && typeof param.description !== "string") return null;
    let nested: InteractionSurfaceOperation["params"];
    if (param.fields !== undefined) {
      const parsed = interactionSurfaceParams(param.fields);
      if (!parsed) return null;
      nested = parsed;
    }
    params.push({
      name: param.name,
      ...(param.type !== undefined ? { type: param.type } : {}),
      ...(param.required !== undefined ? { required: param.required } : {}),
      ...(param.description !== undefined ? { description: param.description } : {}),
      ...(nested !== undefined ? { fields: nested } : {}),
    });
  }
  return params;
}

function interactionSurfaceOperations(block: DocBlock): InteractionSurfaceOperation[] | null {
  const raw = block.props.operations;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const operations: InteractionSurfaceOperation[] = [];
  for (const entry of raw) {
    if (!isPlainRecord(entry)) return null;
    const { name, description, params, returns, kind } = entry;
    if (typeof name !== "string" || !name.trim()) return null;
    if (description !== undefined && typeof description !== "string") return null;
    if (returns !== undefined && typeof returns !== "string") return null;
    if (
      kind !== undefined &&
      !INTERACTION_SURFACE_KINDS.includes(kind as (typeof INTERACTION_SURFACE_KINDS)[number])
    ) {
      return null;
    }
    let operationParams: InteractionSurfaceOperation["params"];
    if (params !== undefined) {
      const parsed = interactionSurfaceParams(params);
      if (!parsed) return null;
      operationParams = parsed;
    }
    operations.push({
      name,
      ...(description !== undefined ? { description } : {}),
      ...(operationParams !== undefined ? { params: operationParams } : {}),
      ...(returns !== undefined ? { returns } : {}),
      ...(kind !== undefined ? { kind: kind as InteractionSurfaceOperation["kind"] } : {}),
    });
  }
  return operations;
}

export const descriptors: DocBlockDescriptor[] = [
  {
    type: "interaction-surface",
    targetKind: "interaction-surface",
    label: INTERACTION_SURFACE_LABEL,
    agentDescription: INTERACTION_SURFACE_AGENT_DESCRIPTION,
    patchOps: STRUCTURAL_OPS,
    render: (block, ctx) => {
      const operations = interactionSurfaceOperations(block);
      if (!operations) return invalidBlockPlaceholder(block, ctx, INTERACTION_SURFACE_LABEL);
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        createElement(InteractionSurfaceBlock, {
          id: block.id,
          title: stringProp(block, "title"),
          operations,
        }),
        ctx.renderChildren(block),
      );
    },
  },
];
