"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import type { DeltaSpan } from "@codecaine-ai/docs-model/doc-schema";

/** Plain-object check shared by the clipboard attr parsers and convert.ts's props guard. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** True when `value` is a structurally valid DeltaSpan[] (each span an object with a string `insert`) — the shape gate both the clipboard parse and convert.ts's atom-node path apply so corrupted clipboard data can never ride into a block's `text`. */
export function isDeltaSpanArray(value: unknown): value is DeltaSpan[] {
  return Array.isArray(value) && value.every((span) => isRecord(span) && typeof span.insert === "string");
}

/** Defensive JSON.parse for clipboard data attributes: null on missing/malformed input or when the parsed value fails `check` — never lets junk into a node attr. */
function parseJsonAttr<T>(raw: string | null, check: (value: unknown) => value is T): T | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return check(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

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
  // JSON-encoded into `data-block-props` for the clipboard round trip.
  // TipTap's default attribute handling can't carry an object (it would
  // stringify to "[object Object]"), and the previous approach — keeping the
  // attr out of the DOM entirely (`rendered: false`) — made copy/paste
  // silently RESET every unpromoted prop to `{}`: a pasted callout lost its
  // tone/title. The parse side is defensive: a missing or malformed payload
  // falls back to the `{}` default rather than letting junk into the blob.
  blockProps: {
    default: {} as Record<string, unknown>,
    parseHTML: (element: HTMLElement) =>
      parseJsonAttr(element.getAttribute("data-block-props"), isRecord),
    renderHTML: (attributes: Record<string, unknown>) => {
      const props = attributes.blockProps;
      return isRecord(props) && Object.keys(props).length > 0
        ? { "data-block-props": JSON.stringify(props) }
        : {};
    },
  },
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
      // content) so convert.ts's atom-node path stays lossless. Same
      // clipboard treatment as `blockProps` above: a DeltaSpan[] can't ride
      // a default-rendered DOM attribute (it stringifies to
      // "[object Object]"), so it's JSON-encoded into `data-block-text` and
      // shape-checked on the way back in.
      return {
        ...blockAttrs,
        blockText: {
          default: null as unknown,
          parseHTML: (element: HTMLElement) =>
            parseJsonAttr(element.getAttribute("data-block-text"), isDeltaSpanArray),
          renderHTML: (attributes: Record<string, unknown>) => {
            const spans = attributes.blockText;
            return isDeltaSpanArray(spans) && spans.length > 0
              ? { "data-block-text": JSON.stringify(spans) }
              : {};
          },
        },
      };
    },
    parseHTML() {
      return [{ tag: `div[data-doc-node="${name}"]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-doc-node": name })];
    },
  });
}
