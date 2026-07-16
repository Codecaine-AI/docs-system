"use client";

import { mergeAttributes } from "@tiptap/core";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { TEXT_OPS, blockAttrs, el } from "../../render/descriptor-helpers";
import { QUOTE_CLASSES } from "../../render/block-classes";
import { textBlockNode } from "../../editor/core/node-helpers";

/** `quote` — read-surface descriptor + ProseMirror editor node. */

export const DocQuote = textBlockNode("docQuote", {
  parseHTML: () => [{ tag: "blockquote" }],
  renderHTML: ({ HTMLAttributes }) => [
    "blockquote",
    mergeAttributes(HTMLAttributes, { class: QUOTE_CLASSES }),
    0,
  ],
});

export const quoteDescriptor: DocBlockDescriptor = {
  type: "quote",
  targetKind: "quote",
  label: "Quote",
  agentDescription: "A block quote of rich text.",
  patchOps: TEXT_OPS,
  render: (block, ctx) =>
    el(
      "div",
      { key: block.id, ...blockAttrs(block) },
      el("blockquote", { className: QUOTE_CLASSES }, ctx.renderText(block.text)),
      ctx.renderChildren(block),
    ),
};
