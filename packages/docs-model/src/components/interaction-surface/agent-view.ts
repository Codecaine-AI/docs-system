"use client";

import type { DocBlock } from "../../doc-schema";
import { stringProp } from "../projection-utils";
import type { ComponentBundle } from "../types";

type InteractionSurfaceParam = {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
};

type InteractionSurfaceOperation = {
  name: string;
  description?: string;
  params?: InteractionSurfaceParam[];
  returns?: string;
  kind?: "action" | "query" | "event";
};

const INTERACTION_SURFACE_KINDS = ["action", "query", "event"] as const;

function isInteractionSurfaceKind(value: unknown): value is "action" | "query" | "event" {
  return typeof value === "string" && (INTERACTION_SURFACE_KINDS as readonly string[]).includes(value);
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
      params: (Array.isArray(entry.params) ? entry.params : [])
        .filter(
          (param): param is Record<string, unknown> =>
            !!param && typeof param === "object" && typeof (param as { name?: unknown }).name === "string",
        )
        .map((param) => ({
          name: param.name as string,
          type: typeof param.type === "string" && param.type.trim() ? param.type.trim() : undefined,
          required: typeof param.required === "boolean" ? param.required : undefined,
          description:
            typeof param.description === "string" && param.description.trim()
              ? param.description.trim()
              : undefined,
        })),
      returns: typeof entry.returns === "string" && entry.returns.trim() ? entry.returns.trim() : undefined,
      kind: isInteractionSurfaceKind(entry.kind) ? entry.kind : undefined,
    }));
}

/**
 * Signature-line rendering (see the module header for the format):
 * `[kind] name(param: type, optional?: type) -> returns  # description` —
 * the `[kind]` prefix only for query/event, ` -> returns` and
 * `  # description` only when present. One line per operation, document order.
 */
function projectInteractionSurface(block: DocBlock): string {
  const title = stringProp(block, "title");
  const lines = interactionSurfaceOperations(block).map((operation) => {
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
    return `${kindPrefix}${operation.name}(${params})${returns}${description}`;
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
