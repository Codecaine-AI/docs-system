"use client";

import type { DocBlockDescriptor } from "../../render/block-registry";
import { STRUCTURAL_OPS, blockAttrs, el } from "../../render/descriptor-helpers";
import { atomBlockNode } from "../../editor/core/node-helpers";

/** `divider` — read-surface descriptor + ProseMirror editor node (atom leaf; NodeView attached in editor/views/node-views.tsx). */

export const DocDivider = atomBlockNode("docDivider");

/**
 * The `<hr>` — one string for both surfaces (the editor's atom node view
 * renders this same descriptor). Color, thickness and spacing follow the
 * divider tokens.
 *
 * Spacing is a unitless em multiplier written as `mt-[…] mb-[…]` (see the
 * knob notes in render/block-classes.ts): fallback 1.3333333em = the 24px
 * (`my-6`) unthemed hosts rendered, and the workbench default (semantic.css)
 * is 2.8571429em, the `prose-sm` rule margin it showed before the knob. The
 * rule has no text, so the font-size utility exists only to pin what `1em`
 * means — the reading size, which is what an `<hr>` inherited already.
 *
 * Thickness is an arbitrary `border-top-width` property rather than
 * `border-t-[…]`, which would also set a border style: only the width is a
 * knob, and the rule keeps whatever style the host gave it.
 */
export const DIVIDER_CLASSES =
  "mt-[calc(var(--docs-divider-spacing,1.3333333)*1em)] mb-[calc(var(--docs-divider-spacing,1.3333333)*1em)] text-[length:var(--style-font-size,18px)] [border-top-width:var(--docs-divider-thickness,1px)] border-[color:var(--docs-divider-color,var(--border))]";

export const dividerDescriptor: DocBlockDescriptor = {
  type: "divider",
  targetKind: "divider",
  label: "Divider",
  agentDescription: "A horizontal rule separating sections.",
  patchOps: STRUCTURAL_OPS,
  render: (block) =>
    el("hr", {
      key: block.id,
      ...blockAttrs(block),
      className: DIVIDER_CLASSES,
    }),
};
