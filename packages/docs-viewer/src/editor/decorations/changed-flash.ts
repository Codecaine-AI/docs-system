"use client";

import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Editor-side "recently changed" flash (the SSE change-highlight surface,
 * see DocPage's `useTransientHighlights` wiring).
 *
 * Why a ProseMirror decoration and not a host-set DOM attribute: the read
 * surfaces let the host mark `[data-block-id]` wrappers with
 * `data-docs-changed` directly, but inside the editor ProseMirror OWNS the
 * contenteditable DOM — its DOMObserver treats a foreign attribute mutation
 * as drift and redraws the node from its spec, stripping the mark within
 * milliseconds (observed empirically; timing-dependent on MutationObserver
 * delivery). A node decoration makes the attribute part of PM's OWN notion
 * of the rendered DOM, so it persists until the id set clears and the same
 * `[data-docs-changed]` CSS animation applies in and out of edit mode.
 *
 * The highlighted-id set lives in plugin state and is swapped via a
 * meta-only transaction (`setChangedFlashIds`) — no doc change, so it never
 * fires `onUpdate`/dirty tracking.
 */
export const changedFlashPluginKey = new PluginKey<ReadonlySet<string>>("docChangedFlash");

export const ChangedFlash = Extension.create({
  name: "docChangedFlash",
  addProseMirrorPlugins() {
    return [
      new Plugin<ReadonlySet<string>>({
        key: changedFlashPluginKey,
        state: {
          init: () => new Set<string>(),
          apply: (tr, previous) =>
            (tr.getMeta(changedFlashPluginKey) as ReadonlySet<string> | undefined) ?? previous,
        },
        props: {
          decorations(state) {
            const ids = changedFlashPluginKey.getState(state);
            if (!ids || ids.size === 0) return null;
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              const blockId = node.attrs?.blockId as string | null | undefined;
              if (blockId && ids.has(blockId)) {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, { "data-docs-changed": "true" }),
                );
              }
              return true;
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

/** Replaces the flashed-id set. Meta-only dispatch — never marks the doc dirty. */
export function setChangedFlashIds(editor: Editor, ids: ReadonlySet<string>): void {
  if (editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(changedFlashPluginKey, new Set(ids)));
}
