"use client";

import { mergeAttributes } from "@tiptap/core";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { mdxAdapterDescriptor, stringProp } from "../../render/descriptor-helpers";
import { CARD_BODY_TEXT_CLASSES, SEMANTIC_CARD_CLASSES } from "../../render/block-classes";
import { textBlockNode } from "../../editor/core/node-helpers";
import { CalloutDocsBlock } from "./CalloutDocsBlock";

/** `callout` — read-surface descriptor (via the CalloutDocsBlock MDX adapter) + ProseMirror editor node. */

/**
 * Card-styled text block — `docBlockText block*` content like every other
 * text block. The DOM carries the read surface's card-container styling
 * (block-classes.ts) so a callout LOOKS like a card while editing; the
 * badge/label header row the read surface adds is presentation the editor
 * intentionally omits (it would be static non-editable furniture inside a
 * text block).
 */
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
