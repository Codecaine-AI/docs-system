import { createElement } from "react";
import { CODE_LEFT_BLOCK_LAYOUT } from "../../render/block-layout";
import type { DocBlockDescriptor } from "../../render/block-registry";
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
      "A code block; props.language for syntax hint, text is the source. Optional props.annotations — [{ lines, label?, note }] with 1-indexed lines like \"4\", \"4-9\", or \"1,4-6\" — render as a notes column inside the code panel, on a slightly lighter surface beside the code (under it in a narrow block); each note shows an L#–# range chip and its bold label on one row with the note text below; hovering a note or line lights the annotation's full extent and clicking pins it.",
    patchOps: TEXT_OPS,
    // The code measure (block-layout.ts): ~110 mono columns at the stock sizes.
    // An annotated block keeps the same lane; at the stock 88ch it clears the
    // 760px notes breakpoint, so its notes column sits beside the code.
    layout: CODE_LEFT_BLOCK_LAYOUT,
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
        // CodeShell renders the frame: a [data-code-surface] code panel, so
        // the host's "code panels" setting renders it dark on a light page.
        createElement(CodeShell, {
          languageLabel: resolveDisplayLanguage(displayCode, language),
          copyText: () => displayCode,
          lineCount: displayCode.split("\n").length,
          frameAttributes: { "data-language": language },
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
        ctx.renderChildren(block),
      );
    },
  },
];
