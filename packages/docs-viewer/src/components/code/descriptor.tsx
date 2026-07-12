import { createElement } from "react";
import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { CODE_BLOCK_CLASSES } from "../../render/block-classes";
import {
  TEXT_OPS,
  blockAttrs,
  deltaToPlainText,
  el,
  stringProp,
} from "../../render/descriptor-helpers";
import { AnnotatedCodeBlock, type CodeAnnotation } from "./CodeAnnotations";
import { highlightCode, prettyPrintIfJson } from "./highlight";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function codeAnnotations(block: DocBlock): CodeAnnotation[] | null {
  const raw = block.props.annotations;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const annotations: CodeAnnotation[] = [];
  for (const entry of raw) {
    if (!isPlainRecord(entry)) continue;
    const { lines, label, note } = entry;
    if (typeof lines !== "string" || !lines.trim()) continue;
    if (typeof note !== "string" || !note.trim()) continue;
    annotations.push({ lines, note, ...(typeof label === "string" && label ? { label } : {}) });
  }
  return annotations.length > 0 ? annotations : null;
}

export const descriptors: DocBlockDescriptor[] = [
  {
    type: "code",
    targetKind: "code",
    label: "Code",
    agentDescription:
      "A code block; props.language for syntax hint, text is the source. Optional props.annotations — [{ lines, label?, note }] with 1-indexed lines like \"4\", \"4-9\", or \"1,4-6\" — render as click-pairable side notes next to the code.",
    patchOps: TEXT_OPS,
    render: (block, ctx) => {
      const annotations = codeAnnotations(block);
      if (annotations) {
        return el(
          "div",
          { key: block.id, ...blockAttrs(block) },
          createElement(AnnotatedCodeBlock, {
            id: block.id,
            language: stringProp(block, "language"),
            code: deltaToPlainText(block.text),
            annotations,
          }),
          ctx.renderChildren(block),
        );
      }
      const language = stringProp(block, "language");
      const displayCode = prettyPrintIfJson(deltaToPlainText(block.text), language);
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        el(
          "pre",
          { className: CODE_BLOCK_CLASSES, "data-language": language },
          el("code", {
            className: "hljs",
            dangerouslySetInnerHTML: { __html: highlightCode(displayCode, language).join("\n") },
          }),
        ),
        ctx.renderChildren(block),
      );
    },
  },
];
