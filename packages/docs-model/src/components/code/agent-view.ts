"use client";

import { deltaToPlainTextInline } from "../../delta-markdown";
import type { DocBlock } from "../../doc-schema";
import { stringProp } from "../projection-utils";
import type { ComponentBundle } from "../types";
import type { CodeAnnotation } from "./state";

function codeAnnotations(block: DocBlock): CodeAnnotation[] {
  const raw = block.props.annotations;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (entry): entry is Record<string, unknown> =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as { lines?: unknown }).lines === "string" &&
        typeof (entry as { note?: unknown }).note === "string",
    )
    .map((entry) => ({
      lines: entry.lines as string,
      label: typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : undefined,
      note: entry.note as string,
    }));
}

export const codeAgentView: ComponentBundle["agentView"] = (block) => {
  switch (block.type) {
    case "code": {
      const language = stringProp(block, "language") ?? "";
      const fence = "```" + language + "\n" + deltaToPlainTextInline(block.text) + "\n```";
      const annotations = codeAnnotations(block);
      if (annotations.length === 0) return fence;
      const annotationLines = annotations.map(
        (annotation) =>
          `> **L${annotation.lines}${annotation.label ? ` (${annotation.label})` : ""}:** ${annotation.note}`,
      );
      return fence + "\n" + annotationLines.join("\n");
    }
    default:
      return null;
  }
};
