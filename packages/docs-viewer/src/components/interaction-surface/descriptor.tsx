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
      if (!Array.isArray(params)) return null;
      operationParams = [];
      for (const param of params) {
        if (!isPlainRecord(param)) return null;
        if (typeof param.name !== "string" || !param.name.trim()) return null;
        if (param.type !== undefined && typeof param.type !== "string") return null;
        if (param.required !== undefined && typeof param.required !== "boolean") return null;
        if (param.description !== undefined && typeof param.description !== "string") return null;
        operationParams.push({
          name: param.name,
          ...(param.type !== undefined ? { type: param.type } : {}),
          ...(param.required !== undefined ? { required: param.required } : {}),
          ...(param.description !== undefined ? { description: param.description } : {}),
        });
      }
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
