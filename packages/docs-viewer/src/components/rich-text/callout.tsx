"use client";

import { mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { CalloutEditorNodeView } from "./callout-editor-node-view";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { mdxAdapterDescriptor, stringProp } from "../../render/descriptor-helpers";
import { CARD_BODY_TEXT_CLASSES, SEMANTIC_CARD_CLASSES } from "../../render/block-classes";
import { textBlockNode } from "../../editor/core/node-helpers";
import { CalloutDocsBlock } from "./CalloutDocsBlock";

/** `callout` — read-surface descriptor (via the CalloutDocsBlock MDX adapter) + ProseMirror editor node. */

/** Keep the clipboard schema unchanged; the live editor shares the read renderer. */
export const DocCallout = textBlockNode("docCallout", {
  parseHTML: () => [{ tag: 'div[data-doc-type="callout"]' }],
  renderHTML: ({ HTMLAttributes }) => [
    "div",
    mergeAttributes(HTMLAttributes, {
      "data-doc-type": "callout",
      class: `${SEMANTIC_CARD_CLASSES} ${CARD_BODY_TEXT_CLASSES}`,
    }),
    0,
  ],
}).extend({
  addNodeView() { return ReactNodeViewRenderer(CalloutEditorNodeView); },
});

export const calloutDescriptor: DocBlockDescriptor = mdxAdapterDescriptor({
  type: "callout",
  block: new CalloutDocsBlock(),
  data: (block, body) => ({
    id: block.id,
    tone: stringProp(block, "tone") ?? "info",
    kind: stringProp(block, "kind"),
    title: stringProp(block, "title"),
    body,
  }),
});
