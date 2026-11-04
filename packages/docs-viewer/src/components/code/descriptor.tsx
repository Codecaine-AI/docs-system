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
import { AnnotatedCodeBlock } from "./CodeAnnotations";

export const descriptors: DocBlockDescriptor[] = [
  {
    type: "code",
    targetKind: "code",
    label: "Code",
    agentDescription:
      "A code block; props.language for syntax hint, text is the source. Optional props.annotations — [{ lines, label?, note }] with 1-indexed lines like \"4\", \"4-9\", or \"1,4-6\" — render as a notes column inside the code panel, on a slightly lighter surface beside the code (under it in a narrow block); each note shows an L#–# range chip and its bold label on one row with the note text below; hovering a note or line lights the annotation's full extent and clicking pins it.",
    patchOps: TEXT_OPS,
    // The code measure (block-layout.ts): 118 mono columns at the stock sizes
    // (docs-model layout CODE_VISIBLE_COLUMNS; 82 beside the notes column).
    // An annotated block keeps the same lane; at the stock 88ch it clears the
    // 760px notes breakpoint, so its notes column sits beside the code.
    layout: CODE_LEFT_BLOCK_LAYOUT,
    render: (block, ctx) => {
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        // The frame is a [data-code-surface] code panel, so the host's
        // "code panels" setting renders it dark on a light page.
        createElement(AnnotatedCodeBlock, {
          id: block.id,
          language: stringProp(block, "language"),
          code: deltaToPlainText(block.text),
          annotations: parseCodeAnnotations(block.props.annotations) ?? [],
        }),
        ctx.renderChildren(block),
      );
    },
  },
];
