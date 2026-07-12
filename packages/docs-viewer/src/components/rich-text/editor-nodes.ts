"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import {
  CARD_BODY_TEXT_CLASSES,
  HEADING_CLASSES,
  LIST_ITEM_BULLET_CLASSES,
  LIST_ITEM_CLASSES,
  LIST_ITEM_CONTENT_CLASSES,
  PARAGRAPH_CLASSES,
  QUOTE_CLASSES,
  SEMANTIC_CARD_CLASSES,
} from "../../render/block-classes";
import {
  atomBlockNode,
  blockAttrs,
  textBlockNode,
} from "../../editor/core/node-helpers";

export const DocParagraph = textBlockNode("docParagraph", {
  parseHTML: () => [{ tag: "p" }],
  renderHTML: ({ HTMLAttributes }) => [
    "p",
    mergeAttributes(HTMLAttributes, { class: PARAGRAPH_CLASSES }),
    0,
  ],
});

export const DocHeading = Node.create({
  name: "docHeading",
  group: "block",
  content: "docBlockText block*",
  addAttributes() {
    // `null` (not `2`) is the "absent in source props" sentinel — convert.ts
    // only promotes/demotes `level` when it was actually present in the
    // DocBlock's `props`, so a heading block that never set `level` doesn't
    // grow a spurious `props.level` on round trip. The renderer/editing UI
    // still treats a null level as level 2 for display purposes.
    return { ...blockAttrs, level: { default: null as number | null } };
  },
  parseHTML() {
    return [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } }));
  },
  renderHTML({ node, HTMLAttributes }) {
    const level = (node.attrs.level as number) ?? 2;
    return [`h${level}`, mergeAttributes(HTMLAttributes, { class: HEADING_CLASSES }), 0];
  },
});

export const DocListItem = Node.create({
  name: "docListItem",
  group: "block",
  content: "docBlockText block*",
  addAttributes() {
    // `null` (not `false`) is the "absent in source props" sentinel — see
    // DocHeading's `level` attr above for why this matters for round-trip
    // losslessness. Rendered/edited as unordered when null.
    return { ...blockAttrs, ordered: { default: null as boolean | null } };
  },
  parseHTML() {
    // The serialized editor `<li>` carries a static bullet `<span>` before
    // its content column (see renderHTML below) — `contentElement` keeps the
    // clipboard round trip from re-parsing that "•" into the item's text.
    // Bare `<li>`s (external paste) have no content column and parse whole.
    return [
      {
        tag: "li",
        contentElement: (element: HTMLElement) =>
          element.querySelector<HTMLElement>(":scope > div[data-doc-list-content]") ?? element,
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    // Mirrors the registry's list-item shape (block-classes.ts): a flex row
    // with a hand-drawn bullet and a content column — `flex` also suppresses
    // the `<li>`'s native marker. The content hole stays the ONLY child of
    // its parent (PM toDOM rule); the bullet is a static, non-editable
    // sibling. `order-first` keeps the bullet ahead of the empty-item
    // placeholder hint, which renders as an `::before` flex item on the
    // `<li>` itself (see decorations/placeholder.ts).
    return [
      "li",
      mergeAttributes(HTMLAttributes, { class: LIST_ITEM_CLASSES }),
      [
        "span",
        {
          class: `${LIST_ITEM_BULLET_CLASSES} order-first`,
          contenteditable: "false",
          "aria-hidden": "true",
        },
        "•",
      ],
      ["div", { class: LIST_ITEM_CONTENT_CLASSES, "data-doc-list-content": "true" }, 0],
    ];
  },
});

export const DocQuote = textBlockNode("docQuote", {
  parseHTML: () => [{ tag: "blockquote" }],
  renderHTML: ({ HTMLAttributes }) => [
    "blockquote",
    mergeAttributes(HTMLAttributes, { class: QUOTE_CLASSES }),
    0,
  ],
});

/**
 * Card-styled text block factory (callout is the only remaining user) —
 * `docBlockText block*` content like every other text block. The DOM carries
 * the read surface's card-container chrome (block-classes.ts) so a card
 * block LOOKS like a card while editing; the badge/label header row the read
 * surface adds is presentation the editor intentionally omits (it would be
 * static non-editable furniture inside a text block).
 */
function semanticNode(
  name: string,
  blockType: string,
  cardClasses: string = SEMANTIC_CARD_CLASSES,
) {
  return textBlockNode(name, {
    parseHTML: () => [{ tag: `div[data-doc-type="${blockType}"]` }],
    renderHTML: ({ HTMLAttributes }) => [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-doc-type": blockType,
        class: `${cardClasses} ${CARD_BODY_TEXT_CLASSES}`,
      }),
      0,
    ],
  });
}

export const DocCallout = semanticNode("docCallout", "callout");

export const DocDivider = atomBlockNode("docDivider");
export const DocImage = atomBlockNode("docImage");
export const DocVideo = atomBlockNode("docVideo");
