"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { TEXT_OPS, blockAttrs, el } from "../../render/descriptor-helpers";
import {
  LIST_ITEM_BULLET_CLASSES,
  LIST_ITEM_CHILDREN_CLASSES,
  LIST_ITEM_CLASSES,
  LIST_ITEM_CONTENT_CLASSES,
} from "../../render/block-classes";
import { blockAttrs as nodeBlockAttrs } from "../../editor/core/node-helpers";

/**
 * `list-item` — read-surface descriptor + ProseMirror editor node. Both
 * surfaces share the marker contract: ordered items ship an EMPTY marker
 * plus `data-doc-ordered`, and the number arrives via the host
 * stylesheet's CSS counter over consecutive ordered siblings
 * (docs-workbench index.css).
 */

export const DocListItem = Node.create({
  name: "docListItem",
  group: "block",
  content: "docBlockText block*",
  addAttributes() {
    // `null` (not `false`) is the "absent in source props" sentinel — see
    // DocHeading's `level` attr for why this matters for round-trip
    // losslessness. Rendered/edited as unordered when null.
    return { ...nodeBlockAttrs, ordered: { default: null as boolean | null } };
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
  renderHTML({ node, HTMLAttributes }) {
    // Mirrors the registry's list-item shape (block-classes.ts): a flex row
    // with a marker box and a content column — `flex` also suppresses the
    // `<li>`'s native marker. The content hole stays the ONLY child of its
    // parent (PM toDOM rule); the marker is a static, non-editable sibling.
    // `order-first` keeps it ahead of the empty-item placeholder hint, which
    // renders as an `::before` flex item on the `<li>` itself (see
    // decorations/placeholder.ts).
    const ordered = node.attrs.ordered === true;
    const marker = ordered
      ? [
          "span",
          {
            class: `${LIST_ITEM_BULLET_CLASSES} order-first`,
            contenteditable: "false",
            "aria-hidden": "true",
            "data-doc-list-marker": "true",
          },
        ]
      : [
          "span",
          {
            class: `${LIST_ITEM_BULLET_CLASSES} order-first`,
            contenteditable: "false",
            "aria-hidden": "true",
            "data-doc-list-marker": "true",
          },
          "•",
        ];
    return [
      "li",
      mergeAttributes(
        HTMLAttributes,
        ordered
          ? { class: LIST_ITEM_CLASSES, "data-doc-ordered": "true" }
          : { class: LIST_ITEM_CLASSES },
      ),
      marker,
      ["div", { class: LIST_ITEM_CONTENT_CLASSES, "data-doc-list-content": "true" }, 0],
    ];
  },
});

export const listItemDescriptor: DocBlockDescriptor = {
  type: "list-item",
  targetKind: "list-item",
  label: "List Item",
  agentDescription: "A list item; nesting via child list-item blocks (D25 normalized tree).",
  patchOps: TEXT_OPS,
  render: (block, ctx) => {
    const ordered = block.props.ordered === true;
    return el(
      "div",
      {
        key: block.id,
        ...blockAttrs(block),
        role: "listitem",
        className: LIST_ITEM_CLASSES,
        ...(ordered ? { "data-doc-ordered": "true" } : {}),
      },
      el(
        "span",
        {
          className: LIST_ITEM_BULLET_CLASSES,
          "aria-hidden": "true",
          "data-doc-list-marker": "true",
        },
        ordered ? null : "•",
      ),
      el(
        "div",
        { className: LIST_ITEM_CONTENT_CLASSES },
        ctx.renderText(block.text),
        el("div", { className: LIST_ITEM_CHILDREN_CLASSES }, ctx.renderChildren(block)),
      ),
    );
  },
};
