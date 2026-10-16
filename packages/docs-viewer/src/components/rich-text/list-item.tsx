"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
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
 * surfaces share the marker contract: every item ships an EMPTY marker plus
 * exactly one kind attribute — `data-doc-ordered`, `data-doc-bullet`, or
 * (task items) `data-doc-checked="true"|"false"` — and the marker glyph
 * arrives via the host stylesheet's `::before` rules (styles/list-markers.css).
 *
 * A task item (`props.checked` boolean) replaces its bullet or number with a
 * checkbox: the marker span itself becomes `role="checkbox"`. It carries
 * `data-doc-checked` INSTEAD of the bullet/ordered attribute, so none of the
 * depth-cycled bullet or counter rules reach its marker; an ordered task
 * keeps its `ordered` prop through `data-doc-task-ordered` (clipboard round
 * trip only — the checkbox stands in for the number).
 */

/** `checked` as stored on the block / PM node: a boolean makes a task item; anything else is an ordinary item. */
function taskState(checked: unknown): boolean | null {
  return typeof checked === "boolean" ? checked : null;
}

/** The item's marker-kind attribute(s), shared by both surfaces. */
function itemKindAttrs(ordered: boolean, checked: boolean | null): Record<string, string> {
  if (checked !== null) {
    return {
      "data-doc-checked": checked ? "true" : "false",
      ...(ordered ? { "data-doc-task-ordered": "true" } : {}),
    };
  }
  return ordered ? { "data-doc-ordered": "true" } : { "data-doc-bullet": "true" };
}

/**
 * The marker's accessibility attrs. An ordinary marker is decoration; a task
 * marker is the checkbox. The read surface has no op channel (static export,
 * publish, PDF, annotate), so its checkbox is `aria-disabled`; the editor's
 * is toggled by the DocTaskToggle plugin (click) and Mod-Enter (keymap.ts).
 */
function markerA11yAttrs(checked: boolean | null, readOnly: boolean): Record<string, string> {
  if (checked === null) return { "aria-hidden": "true" };
  return {
    role: "checkbox",
    "aria-checked": checked ? "true" : "false",
    "aria-label": "Done",
    ...(readOnly ? { "aria-disabled": "true" } : {}),
  };
}

/**
 * Flips a task item's `checked` in one transaction. The node keeps its type
 * and `blockId`, so the autosave diff is a single props-only `updateBlock`.
 * Returns false (no dispatch) when `pos` is not a task item.
 */
export function toggleTaskItemAt(view: EditorView, pos: number): boolean {
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "docListItem") return false;
  const checked = taskState(node.attrs.checked);
  if (checked === null) return false;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !checked }));
  return true;
}

/** The PM position of the task item whose marker `target` sits in, or null. */
function taskItemPosForMarker(view: EditorView, target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;
  const marker = target.closest("[data-doc-list-marker]");
  const item = marker?.parentElement;
  if (!marker || !item || !item.hasAttribute("data-doc-checked") || !view.dom.contains(item)) return null;
  const content = item.querySelector(":scope > [data-doc-list-content]");
  if (!content) return null;
  const $inside = view.state.doc.resolve(view.posAtDOM(content, 0));
  for (let depth = $inside.depth; depth > 0; depth -= 1) {
    if ($inside.node(depth).type.name !== "docListItem") continue;
    const pos = $inside.before(depth);
    if (view.nodeDOM(pos) === item) return pos;
  }
  return null;
}

export const docTaskTogglePluginKey = new PluginKey("docTaskToggle");

/**
 * Click-to-toggle on a task item's checkbox (the marker span). Claims the
 * mousedown so ProseMirror neither moves the caret nor starts a drag, and
 * only while the editor is editable — a read-only editor's checkbox is
 * display only, like the read surface's.
 */
const docTaskTogglePlugin = () =>
  new Plugin({
    key: docTaskTogglePluginKey,
    props: {
      handleDOMEvents: {
        mousedown: (view, event) => {
          if (!view.editable || event.button !== 0) return false;
          const pos = taskItemPosForMarker(view, event.target);
          if (pos === null) return false;
          event.preventDefault();
          return toggleTaskItemAt(view, pos);
        },
      },
    },
  });

/** GitHub-style task `<li>`: a leading checkbox input, bare or inside the item's first paragraph. */
function pastedTaskInput(element: HTMLElement): HTMLInputElement | null {
  return element.querySelector<HTMLInputElement>(
    ':scope > input[type="checkbox"], :scope > p:first-child > input[type="checkbox"]',
  );
}

export const DocListItem = Node.create({
  name: "docListItem",
  group: "block",
  content: "docBlockText block*",
  addAttributes() {
    // `null` (not `false`) is the "absent in source props" sentinel — see
    // DocHeading's `level` attr for why this matters for round-trip
    // losslessness. Rendered/edited as unordered when null.
    //
    // Clipboard encoding rides the marker-contract attribute the node's
    // renderHTML already emits (`data-doc-ordered`), never a raw `ordered`
    // attr: TipTap's default attr rendering leaked `ordered="true"` and
    // parsed it back as the STRING "true". External `<ol>/<ul>` paste maps
    // through the nearest list ancestor.
    return {
      ...nodeBlockAttrs,
      ordered: {
        default: null as boolean | null,
        parseHTML: (element: HTMLElement) => {
          if (element.getAttribute("data-doc-ordered") === "true") return true;
          if (element.getAttribute("data-doc-bullet") === "true") return null;
          if (element.hasAttribute("data-doc-checked")) {
            return element.getAttribute("data-doc-task-ordered") === "true" ? true : null;
          }
          const list = element.closest("ol, ul");
          return list?.tagName === "OL" ? true : null;
        },
        renderHTML: () => ({}),
      },
      // Same sentinel and encoding rules as `ordered`: null = not a task
      // (absent `props.checked`), and the clipboard rides `data-doc-checked`
      // — never a raw `checked` attr. A GitHub-style pasted task `<li>`
      // (leading `<input type="checkbox" [checked]>`) maps to a task item;
      // the input itself has no parse rule and drops out of the content.
      checked: {
        default: null as boolean | null,
        parseHTML: (element: HTMLElement) => {
          const encoded = element.getAttribute("data-doc-checked");
          if (encoded === "true") return true;
          if (encoded === "false") return false;
          const input = pastedTaskInput(element);
          return input ? input.hasAttribute("checked") || input.checked : null;
        },
        renderHTML: () => ({}),
      },
    };
  },
  addProseMirrorPlugins() {
    return [docTaskTogglePlugin()];
  },
  parseHTML() {
    // The serialized editor `<li>` carries a marker `<span>` before its
    // content column (see renderHTML below). `contentElement` keeps that
    // presentation-only sibling out of the editable content on clipboard
    // round trips. Bare `<li>`s (external paste) have no content column and
    // parse whole.
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
    const checked = taskState(node.attrs.checked);
    const marker = [
      "span",
      {
        class: `${LIST_ITEM_BULLET_CLASSES} order-first`,
        contenteditable: "false",
        ...markerA11yAttrs(checked, false),
        "data-doc-list-marker": "true",
      },
    ];
    return [
      "li",
      mergeAttributes(HTMLAttributes, { class: LIST_ITEM_CLASSES, ...itemKindAttrs(ordered, checked) }),
      marker,
      ["div", { class: LIST_ITEM_CONTENT_CLASSES, "data-doc-list-content": "true" }, 0],
    ];
  },
});

export const listItemDescriptor: DocBlockDescriptor = {
  type: "list-item",
  targetKind: "list-item",
  label: "List Item",
  agentDescription:
    "A list item; nesting via child list-item blocks (D25 normalized tree). Props: ordered? (numbered), checked? (a boolean makes a task item: false open, true done).",
  patchOps: TEXT_OPS,
  render: (block, ctx) => {
    const ordered = block.props.ordered === true;
    const checked = taskState(block.props.checked);
    return el(
      "div",
      {
        key: block.id,
        ...blockAttrs(block),
        role: "listitem",
        className: LIST_ITEM_CLASSES,
        ...itemKindAttrs(ordered, checked),
      },
      el(
        "span",
        {
          className: LIST_ITEM_BULLET_CLASSES,
          ...markerA11yAttrs(checked, true),
          "data-doc-list-marker": "true",
        },
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
