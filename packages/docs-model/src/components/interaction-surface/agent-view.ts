"use client";

import type { DocBlock } from "../../doc-schema";
import { stringProp } from "../projection-utils";
import { fieldLines } from "../shared/field";
import type { ComponentBundle } from "../types";

import { isCallFormName, readInteractionSurfaceOperations as interactionSurfaceOperations } from "./state";

/**
 * Signature-line rendering (see the module header for the format):
 * `[kind] name(param: type, optional?: type) -> returns  # description` —
 * the `[kind]` prefix on every line (action when unset), ` -> returns` and
 * `  # description` only when present. One line per operation, document order.
 * Beneath a signature line, the params add indented detail lines in the
 * shared field-line grammar (two-space indent per depth,
 * `<name><?>: <type>  # <description>`) once any one of them carries a
 * description or nested fields: then every param gets its line, so the
 * detail list never looks shorter than the signature. A call-form name
 * (`reducer(state, { type: "open" })`, see isCallFormName) prints as written,
 * with no parameter list after it, and always lists its params as lines. An authored `exampleCall` follows the
 * param lines as an indented `Example call:` block, mirroring the returnShape
 * `Example:` block.
 */
function projectInteractionSurface(block: DocBlock): string {
  const title = stringProp(block, "title");
  const lines = interactionSurfaceOperations(block).flatMap((operation) => {
    // Every line names its kind, as the viewer's row chip does: an operation without one is an action.
    const kindPrefix = `[${operation.kind ?? "action"}] `;
    const params = (operation.params ?? [])
      .map((param) => {
        const optional = param.required === false ? "?" : "";
        return param.type ? `${param.name}${optional}: ${param.type}` : `${param.name}${optional}`;
      })
      .join(", ");
    const returns = operation.returns ? ` -> ${operation.returns}` : "";
    const description = operation.description ? `  # ${operation.description}` : "";
    const callForm = isCallFormName(operation.name);
    const allParams = operation.params ?? [];
    const detailed = callForm || allParams.some((param) => param.description || (param.fields && param.fields.length > 0));
    const detailLines = detailed ? fieldLines(allParams, 1) : [];
    return [`${kindPrefix}${operation.name}${callForm ? "" : `(${params})`}${returns}${description}`, ...detailLines,
      ...(operation.exampleCall !== undefined ? ["  Example call:", ...operation.exampleCall.split("\n").map(line => "    " + line)] : []),
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
