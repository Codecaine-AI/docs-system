"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { TEXT_OPS, blockAttrs, el } from "../../render/descriptor-helpers";
import { HEADING_CLASSES } from "../../render/block-classes";
import { blockAttrs as nodeBlockAttrs } from "../../editor/core/node-helpers";

/** `heading` — read-surface descriptor + ProseMirror editor node. */

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
    //
    // Clipboard encoding is the TAG NAME (h1..h6), never an attribute:
    // TipTap's default attr rendering leaked `level="1"` into copy HTML and
    // parsed it back as the STRING "1" (overriding the parse rule's numeric
    // level), which corrupted `props.level` on save. renderHTML emits
    // nothing; parseHTML derives the number from the tag, so external
    // h1..h6 paste correctly too.
    return {
      ...nodeBlockAttrs,
      level: {
        default: null as number | null,
        parseHTML: (element: HTMLElement) => {
          const match = /^H([1-6])$/.exec(element.tagName);
          return match ? Number(match[1]) : null;
        },
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() {
    return [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } }));
  },
  renderHTML({ node, HTMLAttributes }) {
    const level = (node.attrs.level as number) ?? 2;
    return [`h${level}`, mergeAttributes(HTMLAttributes, { class: HEADING_CLASSES }), 0];
  },
});

export const headingDescriptor: DocBlockDescriptor = {
  type: "heading",
  targetKind: "heading",
  label: "Heading",
  agentDescription: "A section heading; props.level selects h1-h6.",
  patchOps: TEXT_OPS,
  render: (block, ctx) => {
    const rawLevel = block.props.level;
    const level =
      typeof rawLevel === "number" && Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= 6
        ? rawLevel
        : 2;
    return el(
      "div",
      { key: block.id, ...blockAttrs(block) },
      el(`h${level}`, { className: HEADING_CLASSES }, ctx.renderText(block.text)),
      ctx.renderChildren(block),
    );
  },
};
