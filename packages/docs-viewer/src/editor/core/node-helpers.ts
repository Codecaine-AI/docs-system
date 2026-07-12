"use client";

import { Node, mergeAttributes } from "@tiptap/core";

/** Shared attrs every block-carrying node needs: the stable id + typed props blob. */
export const blockAttrs = {
  // Rendered to the DOM as `data-block-id` — the SAME wrapper attribute the
  // block-registry descriptors emit on the read surface, so host features
  // that LOCATE blocks by id (scroll-to-block, test selectors) work
  // identically over the editor's DOM. Note the SSE change flash cannot ride
  // this alone: hosts must not SET attributes inside the editor (PM's DOM
  // observer strips foreign mutations) — that half goes through the
  // changed-flash.ts decoration instead.
  blockId: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => element.getAttribute("data-block-id"),
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes.blockId ? { "data-block-id": attributes.blockId } : {},
  },
  // Kept out of the DOM entirely: an object attr would stringify to
  // "[object Object]" and the props blob only matters to convert.ts's PM
  // JSON round trip, never to rendering.
  blockProps: { default: {} as Record<string, unknown>, rendered: false },
};

export type DomOutputSpec =
  | [string, Record<string, unknown>, number]
  | [string, Record<string, unknown>];

/** Common factory for the "docBlockText block*" text block nodes — same shape, distinguished by node name/block type and (for heading) one extra attr. */
export function textBlockNode(
  name: string,
  options: {
    addAttributes?: () => Record<string, { default: unknown }>;
    parseHTML: () => Array<{ tag: string; attrs?: Record<string, unknown> }>;
    renderHTML: (props: {
      node: { attrs: Record<string, unknown> };
      HTMLAttributes: Record<string, unknown>;
    }) => DomOutputSpec;
  },
) {
  return Node.create({
    name,
    group: "block",
    content: "docBlockText block*",
    addAttributes() {
      return { ...blockAttrs, ...(options.addAttributes?.() ?? {}) };
    },
    parseHTML() {
      return options.parseHTML();
    },
    renderHTML({ node, HTMLAttributes }) {
      return options.renderHTML({ node, HTMLAttributes });
    },
  });
}

/** Factory for the atom (non-editable) leaf block nodes; NodeView wiring (`addNodeView`) is attached in node-views.tsx via `.extend()` to keep this module React-free. */
export function atomBlockNode(name: string) {
  return Node.create({
    name,
    group: "block",
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
      // Atom block types have no PM inline content slot, but doc-schema allows
      // ANY block (including atoms like mermaid, whose body
      // grammar lives in `text`) to carry a `text` DeltaSpan[]. `blockText`
      // rides that verbatim as a plain attr (never rendered as editable PM
      // content) so convert.ts's atom-node path stays lossless.
      return { ...blockAttrs, blockText: { default: null as unknown } };
    },
    parseHTML() {
      return [{ tag: `div[data-doc-node="${name}"]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-doc-node": name })];
    },
  });
}
