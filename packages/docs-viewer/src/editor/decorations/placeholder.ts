"use client";

import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { NODE_TYPE_TO_BLOCK_TYPE } from "../core/schema";

/**
 * Notion-style gray placeholder hints on empty blocks, as a ProseMirror node
 * decoration plugin (same technique as changed-flash.ts — inside the editor
 * PM owns the DOM, so the hint attribute must be part of PM's own notion of
 * the rendered node, not a host-set attribute its DOMObserver would strip).
 *
 * The decoration adds `data-placeholder="<text>"` + class
 * `doc-block-placeholder` to the BLOCK node's element (the `<h1>`/`<p>`/`<li>`
 * itself), and injected CSS renders it via `::before` with the
 * float/height-0 trick so the hint overlays the empty line without affecting
 * layout.
 *
 * Which blocks get a hint (all only when the block's `docBlockText` wrapper
 * is empty):
 * - docHeading: ALWAYS — "Heading N" (null level renders as 2).
 * - docParagraph: only when the cursor sits inside it AND the editor is
 *   focused (and the paragraph has no nested children) —
 *   "Type '/' for commands".
 * - docListItem: NO hint — a gray "List" next to the marker read as
 *   phantom content while typing (Ford, dogfood review 2026-07-16); an
 *   empty item is self-explanatory, the marker is already visible.
 * - docCallout: editor focused and no nested children — its block type
 *   name capitalized ("Callout"), set on the empty `docBlockText` wrapper
 *   rather than the block so it sits on the body line, below the header.
 *   With nested children, that empty line is collapsed instead
 *   (`doc-block-text-collapsed`) unless the caret is on it.
 *
 * Focus changes recompute correctly because TipTap's core FocusEvents
 * extension dispatches a meta transaction on focus/blur (keeping
 * `editor.isFocused` in sync), which re-runs the `decorations` prop.
 */

const STYLE_ID = "doc-editor-placeholder-style";

const PLACEHOLDER_CSS = `
.docs-editor-prosemirror .doc-block-placeholder::before {
  content: attr(data-placeholder);
  color: color-mix(in srgb, currentColor 35%, transparent);
  pointer-events: none;
  float: left;
  height: 0;
}
.docs-editor-prosemirror .doc-block-text-collapsed {
  display: none;
}
`;

/** Injects the placeholder stylesheet once per document (SSR-safe; the docs-viewer package ships no stylesheet of its own). */
function injectPlaceholderStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = PLACEHOLDER_CSS;
  document.head.appendChild(style);
}

/** Node type names that show their block type name when empty and the editor is focused (callout). */
const FOCUS_LABELED_NODE_NAMES: ReadonlySet<string> = new Set([
  "docCallout",
]);

/** Node type names whose empty text line is hidden while nested blocks carry the body (callout). */
const COLLAPSIBLE_TEXT_NODE_NAMES: ReadonlySet<string> = new Set([
  "docCallout",
]);

/** "Empty" = the block's mandatory docBlockText wrapper (content[0]) holds no inline content. */
function hasEmptyWrapper(node: PMNode): boolean {
  const wrapper = node.firstChild;
  return wrapper !== null && wrapper.type.name === "docBlockText" && wrapper.content.size === 0;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildDecorations(state: EditorState, editorFocused: boolean): DecorationSet | null {
  const { selection } = state;
  const cursorPos = selection.empty ? selection.from : null;
  const decorations: Decoration[] = [];

  state.doc.descendants((node, pos) => {
    const name = node.type.name;
    const cursorInside =
      cursorPos !== null && cursorPos > pos && cursorPos < pos + node.nodeSize;

    let text: string | null = null;
    if (name === "docHeading" && hasEmptyWrapper(node)) {
      text = `Heading ${(node.attrs.level as number | null) ?? 2}`;
    } else if (name === "docParagraph") {
      // Only a fully empty paragraph (no nested children either), and only
      // while the user is actually there — Notion's "Type '/' ..." hint.
      if (node.childCount === 1 && hasEmptyWrapper(node) && cursorInside && editorFocused) {
        text = "Type '/' for commands";
      }
    } else if (
      FOCUS_LABELED_NODE_NAMES.has(name) &&
      node.childCount === 1 &&
      hasEmptyWrapper(node) &&
      editorFocused
    ) {
      // Decorate the empty docBlockText line, not the block: the callout node
      // view renders its eyebrow header above the editable body, so a
      // block-level ::before floated over "Info · Title". A callout whose body
      // lives in nested children is not empty, so it gets no hint at all.
      const wrapper = node.firstChild!;
      decorations.push(
        Decoration.node(pos + 1, pos + 1 + wrapper.nodeSize, {
          class: "doc-block-placeholder",
          "data-placeholder": capitalize(NODE_TYPE_TO_BLOCK_TYPE[name] ?? name),
        }),
      );
    } else if (COLLAPSIBLE_TEXT_NODE_NAMES.has(name) && node.childCount > 1 && hasEmptyWrapper(node)) {
      // A callout whose body is nested blocks keeps a mandatory, empty text
      // line above them; ProseMirror's trailing <br> gives it a full blank
      // line under the header. Collapse it unless the caret is on it.
      const wrapper = node.firstChild!;
      const wrapperFrom = pos + 1;
      const wrapperTo = wrapperFrom + wrapper.nodeSize;
      const caretOnLine = cursorPos !== null && cursorPos > wrapperFrom && cursorPos < wrapperTo;
      if (!caretOnLine) {
        decorations.push(Decoration.node(wrapperFrom, wrapperTo, { class: "doc-block-text-collapsed" }));
      }
    }

    if (text !== null) {
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: "doc-block-placeholder",
          "data-placeholder": text,
        }),
      );
    }
    return true;
  });

  return decorations.length > 0 ? DecorationSet.create(state.doc, decorations) : null;
}

export const docPlaceholderPluginKey = new PluginKey("docPlaceholder");

export const DocPlaceholder = Extension.create({
  name: "docPlaceholder",

  addProseMirrorPlugins() {
    const { editor } = this;
    return [
      new Plugin({
        key: docPlaceholderPluginKey,
        // Style injection rides the plugin's view lifecycle, NOT the
        // extension's `onCreate`: TipTap emits `create` from a setTimeout(0)
        // after view construction, so the tag wouldn't exist for anything
        // that reads the DOM synchronously after mount. `view()` runs
        // synchronously when the EditorView is created — which also makes it
        // inherently client-only (SSR never constructs a view).
        view() {
          injectPlaceholderStyles();
          return {};
        },
        props: {
          decorations(state) {
            return buildDecorations(state, editor.isFocused);
          },
        },
      }),
    ];
  },
});
