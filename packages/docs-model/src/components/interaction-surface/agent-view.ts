"use client";

import type { DocBlock } from "../../doc-schema";
import { stringProp } from "../projection-utils";
import { fieldLines } from "../shared/field";
import type { ComponentBundle } from "../types";

import { readInteractionSurfaceOperations as interactionSurfaceOperations } from "./state";

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
    return [`${kindPrefix}${operation.name}(${params})${returns}${description}`, ...detailLines,
      ...(operation.returnShape ? [
        `  Returns ${operation.returns || "Result"}:`,
        ...fieldLines(operation.returnShape.fields, 2),
        ...(operation.returnShape.example !== undefined ? ["  Example:", ...operation.returnShape.example.split("\n").map(line => "    " + line)] : []),
      ] : []),
    ];
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
