"use client";

import type { DocBlockDescriptor } from "../../render/block-registry";
import { STRUCTURAL_OPS, blockAttrs, el } from "../../render/descriptor-helpers";
import { atomBlockNode } from "../../editor/core/node-helpers";

/** `divider` — read-surface descriptor + ProseMirror editor node (atom leaf; NodeView attached in editor/views/node-views.tsx). */

export const DocDivider = atomBlockNode("docDivider");

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
      className: "my-6 border-[color:var(--docs-divider-color,var(--border))]",
    }),
};
