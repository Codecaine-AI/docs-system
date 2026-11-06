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
      "A code block; props.language for syntax hint, text is the source. Optional props.annotations — [{ lines, label?, note }] with 1-indexed lines like \"4\", \"4-9\", or \"1,4-6\" — render inside the code panel on a slightly lighter surface: in a column beside the code when the widest line fits beside it, else each note in a row under the last line it explains; each note shows an L#–# range chip and its bold label on one row with the note text below; hovering a note or line lights the annotation's full extent and clicking pins it.",
    patchOps: TEXT_OPS,
    // The code measure (block-layout.ts): 118 mono columns at the stock sizes
    // (docs-model layout CODE_VISIBLE_COLUMNS). An annotated block keeps the
    // same lane; its notes sit beside the code only when its widest line fits
    // beside them (CodeAnnotations.tsx useNotePlacement).
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
