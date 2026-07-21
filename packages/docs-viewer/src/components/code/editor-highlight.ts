"use client";

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { highlightCodeTokens } from "./highlight";

/**
 * Live syntax highlighting for `docCodeBlock` nodes in the editor, as
 * ProseMirror inline decorations (owned by the code component — the editor
 * aggregates it like the component's input rules).
 *
 * Tokens come from highlightCodeTokens (highlight.ts) — the SAME curated
 * grammar registry and language resolution the read surface renders with,
 * emitting the same `hljs-*` classes the host stylesheet already themes for
 * light and dark (--syntax-* vars in docs-workbench index.css). Decorations
 * are display-only: the stored block text never changes.
 *
 * The set is fully recomputed on every doc-changing transaction (docs hold
 * a handful of small code blocks — recomputing is cheaper than diffing
 * which blocks a transaction touched) and cheaply mapped otherwise.
 */

export const docCodeBlockHighlightPluginKey = new PluginKey<DecorationSet>(
  "docCodeBlockHighlight",
);

/** Exported for tests — the plugin below is the only runtime caller. */
export function buildDecorations(state: EditorState): DecorationSet {
  const decorations: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "docCodeBlock") return true;
    const tokens = highlightCodeTokens(
      node.textContent,
      (node.attrs.language as string | null) ?? undefined,
    );
    for (const token of tokens) {
      decorations.push(
        // pos is the code block's own position; its flat text content
        // starts at pos + 1.
        Decoration.inline(pos + 1 + token.from, pos + 1 + token.to, {
          class: token.className,
        }),
      );
    }
    return false; // code blocks are flat — nothing to descend into
  });
  return DecorationSet.create(state.doc, decorations);
}

export const DocCodeBlockHighlight = Extension.create({
  name: "docCodeBlockHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: docCodeBlockHighlightPluginKey,
        state: {
          init: (_, state) => buildDecorations(state),
          apply: (tr, old, _oldState, newState) =>
            tr.docChanged ? buildDecorations(newState) : old.map(tr.mapping, tr.doc),
        },
        props: {
          decorations(state) {
            return docCodeBlockHighlightPluginKey.getState(state);
          },
        },
      }),
    ];
  },
});
