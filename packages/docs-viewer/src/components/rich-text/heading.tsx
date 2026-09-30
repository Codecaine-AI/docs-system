"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { TEXT_OPS, blockAttrs, el } from "../../render/descriptor-helpers";
import { HEADING_LEVEL_CLASSES } from "../../render/block-classes";
import { blockAttrs as nodeBlockAttrs } from "../../editor/core/node-helpers";

/** `heading` — read-surface descriptor + ProseMirror editor node. */

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** The level both surfaces render: an integer 1-6, else 2 (an absent or malformed `level` reads as h2). Shared so the read descriptor and the editor node pick the same tag AND the same per-level class string. */
function headingLevel(raw: unknown): HeadingLevel {
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 6
    ? (raw as HeadingLevel)
    : 2;
}

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
    const level = headingLevel(node.attrs.level);
    return [`h${level}`, mergeAttributes(HTMLAttributes, { class: HEADING_LEVEL_CLASSES[level] }), 0];
  },
});

export const headingDescriptor: DocBlockDescriptor = {
  type: "heading",
  targetKind: "heading",
  label: "Heading",
  agentDescription: "A section heading; props.level selects h1-h6.",
  patchOps: TEXT_OPS,
  render: (block, ctx) => {
    const level = headingLevel(block.props.level);
    return el(
      "div",
      { key: block.id, ...blockAttrs(block) },
      el(`h${level}`, { className: HEADING_LEVEL_CLASSES[level] }, ctx.renderText(block.text)),
      ctx.renderChildren(block),
    );
  },
};
