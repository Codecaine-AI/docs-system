"use client";

import { mergeAttributes } from "@tiptap/core";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { TEXT_OPS, blockAttrs, el } from "../../render/descriptor-helpers";
import { PARAGRAPH_CLASSES } from "../../render/block-classes";
import { textBlockNode } from "../../editor/core/node-helpers";

/** `paragraph` — everything for the sub-component in one place: the read-surface descriptor and the ProseMirror editor node. */

export const DocParagraph = textBlockNode("docParagraph", {
  parseHTML: () => [{ tag: "p" }],
  renderHTML: ({ HTMLAttributes }) => [
    "p",
    mergeAttributes(HTMLAttributes, { class: PARAGRAPH_CLASSES }),
    0,
  ],
});

export const paragraphDescriptor: DocBlockDescriptor = {
  type: "paragraph",
  targetKind: "paragraph",
  label: "Paragraph",
  agentDescription: "A paragraph of rich text (delta spans).",
  patchOps: TEXT_OPS,
  render: (block, ctx) =>
    el(
      "div",
      { key: block.id, ...blockAttrs(block) },
      el("p", { className: PARAGRAPH_CLASSES }, ctx.renderText(block.text)),
      ctx.renderChildren(block),
    ),
};
