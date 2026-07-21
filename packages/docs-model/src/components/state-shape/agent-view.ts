"use client";

import type { DocBlock } from "../../doc-schema";
import { stringProp } from "../projection-utils";
import { fieldLines } from "../shared/field";
import { printJsonLines } from "../shared/json-lines";
import type { ComponentBundle } from "../types";
import { readStateShapeExample, readStateShapeFields, readStateShapeSource } from "./state";

/**
 * Deterministic markdown projection:
 * - Header line: `**<name>**`, with ` — <path>` appended when a source is
 *   present (`#<symbol>` suffixed when the symbol is present). Without a name
 *   the source stands alone as `— <path>#<symbol>`. A blank line follows any
 *   header line.
 * - Then a bare fenced code block, one line per field in the shared
 *   field-line grammar: two-space indent per nesting depth,
 *   `<name><? when required: false>: <type>  # <description>`.
 * - Then, when a valid `example` is present, a blank line and a ```json fence
 *   holding the example pretty-printed through the shared printJsonLines
 *   canon (deterministic bytes; the tolerant read drops a non-JSON example,
 *   so a malformed prop renders no fence rather than crashing).
 */
function projectStateShape(block: DocBlock): string {
  const name = stringProp(block, "name");
  const source = readStateShapeSource(block);
  const sourceRef = source
    ? source.symbol
      ? `${source.path}#${source.symbol}`
      : source.path
    : undefined;
  const header = name
    ? sourceRef
      ? `**${name}** — ${sourceRef}`
      : `**${name}**`
    : sourceRef
      ? `— ${sourceRef}`
      : "";
  const lines = fieldLines(readStateShapeFields(block));
  const fence = lines.length > 0 ? "```\n" + lines.join("\n") + "\n```" : "";
  const example = readStateShapeExample(block);
  const exampleFence =
    example !== undefined
      ? "```json\n" + printJsonLines(JSON.parse(example)).lines.join("\n") + "\n```"
      : "";
  return [header, fence, exampleFence].filter((part) => part !== "").join("\n\n");
}

export const stateShapeAgentView: ComponentBundle["agentView"] = (block) => {
  switch (block.type) {
    case "state-shape":
      return projectStateShape(block);
    default:
      return null;
  }
};
