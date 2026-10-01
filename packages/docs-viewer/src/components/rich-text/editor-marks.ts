"use client";

import { Extension } from "@tiptap/core";
import Italic from "@tiptap/extension-italic";
import Strike from "@tiptap/extension-strike";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  INLINE_CODE_KIND_CLASSES,
  INLINE_CODE_KIND_TEXT_CLASSES,
} from "../../render/block-classes";
import { chipKind } from "../typed-chip";

/**
 * Editor MARK overrides owned by the rich-text component (kept separate
 * from editor-nodes.ts, whose exports must be exactly the block NODES —
 * see editor-nodes-sync.test.ts).
 *
 * Italic/strike stay in the schema (existing docs carry the marks; the
 * Cmd-I / Cmd-Shift-S shortcuts and paste conversion still work) but their
 * markdown TYPING shortcuts are stripped — bold + inline code are the only
 * auto-converting marks (Ford, dogfood review 2026-07-16). StarterKit's
 * stock Italic/Strike would re-add the input rules, so DocEditor disables
 * those and registers these instead.
 */
export const DocItalic = Italic.extend({ addInputRules: () => [] });
export const DocStrike = Strike.extend({ addInputRules: () => [] });

/**
 * Typed inline code in the editor. A mark's DOM is fixed by its attrs, not
 * its text, so the kind (components/typed-chip.ts) cannot ride the `code`
 * mark itself: each run of code-marked text gets an inline decoration
 * instead — a span inside the chip carrying `data-chip-kind` and the kind's
 * color classes — so a chip reads the same in edit mode as on the read
 * surface. A run is the longest stretch of adjacent code-marked text in one
 * textblock (a chip split by bold still classifies as one).
 */
export function inlineCodeKindDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let runFrom = -1;
    let runText = "";
    const closeRun = (to: number) => {
      if (runFrom >= 0) {
        const kind = chipKind(runText);
        if (kind !== "other") {
          decorations.push(
            Decoration.inline(runFrom, to, {
              "data-chip-kind": kind,
              class: `${INLINE_CODE_KIND_CLASSES[kind]} ${INLINE_CODE_KIND_TEXT_CLASSES}`,
            }),
          );
        }
      }
      runFrom = -1;
      runText = "";
    };
    node.forEach((child, offset) => {
      const from = pos + 1 + offset;
      if (child.isText && child.marks.some((mark) => mark.type.name === "code")) {
        if (runFrom < 0) runFrom = from;
        runText += child.text ?? "";
      } else {
        closeRun(from);
      }
    });
    closeRun(pos + 1 + node.content.size);
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

const inlineCodeKindsKey = new PluginKey<DecorationSet>("docInlineCodeKinds");

export const DocInlineCodeKinds = Extension.create({
  name: "docInlineCodeKinds",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: inlineCodeKindsKey,
        state: {
          init: (_, state) => inlineCodeKindDecorations(state.doc),
          apply: (tr, previous) => (tr.docChanged ? inlineCodeKindDecorations(tr.doc) : previous),
        },
        props: {
          decorations: (state) => inlineCodeKindsKey.getState(state),
        },
      }),
    ];
  },
});
