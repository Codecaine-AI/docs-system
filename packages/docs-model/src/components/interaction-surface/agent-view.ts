"use client";

import type { DocBlock } from "../../doc-schema";
import { stringProp } from "../projection-utils";
import { fieldLines } from "../shared/field";
import type { Field } from "../shared/field";
import type { ComponentBundle } from "../types";

type InteractionSurfaceOperation = {
  name: string;
  description?: string;
  params?: Field[];
  returns?: string;
  kind?: "action" | "query" | "event";
};

const INTERACTION_SURFACE_KINDS = ["action", "query", "event"] as const;

function isInteractionSurfaceKind(value: unknown): value is "action" | "query" | "event" {
  return typeof value === "string" && (INTERACTION_SURFACE_KINDS as readonly string[]).includes(value);
}

function readParams(raw: unknown): Field[] {
  return (Array.isArray(raw) ? raw : [])
    .filter(
      (param): param is Record<string, unknown> =>
        !!param && typeof param === "object" && typeof (param as { name?: unknown }).name === "string",
    )
    .map((param) => {
      const field: Field = { name: param.name as string };
      if (typeof param.type === "string" && param.type.trim()) field.type = param.type.trim();
      if (typeof param.required === "boolean") field.required = param.required;
      if (typeof param.description === "string" && param.description.trim()) {
        field.description = param.description.trim();
      }
      if (Array.isArray(param.fields)) field.fields = readParams(param.fields);
      return field;
    });
}

function interactionSurfaceOperations(block: DocBlock): InteractionSurfaceOperation[] {
  const raw = block.props.operations;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === "object" && typeof (entry as { name?: unknown }).name === "string",
    )
    .map((entry) => ({
      name: entry.name as string,
      description:
        typeof entry.description === "string" && entry.description.trim()
          ? entry.description.trim()
          : undefined,
      params: readParams(entry.params),
      returns: typeof entry.returns === "string" && entry.returns.trim() ? entry.returns.trim() : undefined,
      kind: isInteractionSurfaceKind(entry.kind) ? entry.kind : undefined,
    }));
}

/**
 * Signature-line rendering (see the module header for the format):
 * `[kind] name(param: type, optional?: type) -> returns  # description` —
 * the `[kind]` prefix only for query/event, ` -> returns` and
 * `  # description` only when present. One line per operation, document order.
 * Beneath a signature line, each param that carries a description or nested
 * fields adds indented detail lines in the shared field-line grammar
 * (two-space indent per depth, `<name><?>: <type>  # <description>`); params
 * with neither emit nothing extra.
 */
function projectInteractionSurface(block: DocBlock): string {
  const title = stringProp(block, "title");
  const lines = interactionSurfaceOperations(block).flatMap((operation) => {
    const kindPrefix =
      operation.kind === "query" || operation.kind === "event" ? `[${operation.kind}] ` : "";
    const params = (operation.params ?? [])
      .map((param) => {
        const optional = param.required === false ? "?" : "";
        return param.type ? `${param.name}${optional}: ${param.type}` : `${param.name}${optional}`;
      })
      .join(", ");
    const returns = operation.returns ? ` -> ${operation.returns}` : "";
    const description = operation.description ? `  # ${operation.description}` : "";
    const detailLines = (operation.params ?? [])
      .filter((param) => param.description || (param.fields && param.fields.length > 0))
      .flatMap((param) => fieldLines([param], 1));
    return [`${kindPrefix}${operation.name}(${params})${returns}${description}`, ...detailLines];
  });
  const fence = lines.length > 0 ? "```\n" + lines.join("\n") + "\n```" : "";
  if (title && fence) return `**${title}**\n\n${fence}`;
  return title ? `**${title}**` : fence;
}

export const interactionSurfaceAgentView: ComponentBundle["agentView"] = (block) => {
  switch (block.type) {
    case "interaction-surface":
      return projectInteractionSurface(block);
    default:
      return null;
  }
};
