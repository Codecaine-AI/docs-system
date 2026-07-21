import { createElement } from "react";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { CODE_BLOCK_CLASSES } from "../../render/block-classes";
import {
  TEXT_OPS,
  blockAttrs,
  deltaToPlainText,
  el,
  stringProp,
} from "../../render/descriptor-helpers";
import { parseCodeAnnotations } from "./annotations";
import { CODE_CELL_CLASSES } from "./classes";
import { AnnotatedCodeBlock } from "./CodeAnnotations";
import { CodeShell } from "./CodeShell";
import { highlightCode, prettyPrintIfJson, resolveDisplayLanguage } from "./highlight";

export const descriptors: DocBlockDescriptor[] = [
  {
    type: "code",
    targetKind: "code",
    label: "Code",
    agentDescription:
      "A code block; props.language for syntax hint, text is the source. Optional props.annotations — [{ lines, label?, note }] with 1-indexed lines like \"4\", \"4-9\", or \"1,4-6\" — render as side notes next to the code, each opening with an L#–# range chip; hovering a note or line lights the annotation's full extent and clicking pins it.",
    patchOps: TEXT_OPS,
    render: (block, ctx) => {
      const annotations = parseCodeAnnotations(block.props.annotations);
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
          "div",
          { className: `group/code ${CODE_BLOCK_CLASSES}`, "data-language": language },
          createElement(CodeShell, {
            languageLabel: resolveDisplayLanguage(displayCode, language),
            copyText: () => displayCode,
            lineCount: displayCode.split("\n").length,
            children: el(
              "pre",
              { className: CODE_CELL_CLASSES },
              el("code", {
                className: "hljs",
                dangerouslySetInnerHTML: {
                  __html: highlightCode(displayCode, language).join("\n"),
                },
              }),
            ),
          }),
        ),
        ctx.renderChildren(block),
      );
    },
  },
];
