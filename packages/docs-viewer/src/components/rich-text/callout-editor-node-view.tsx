"use client";

import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { CalloutDocsBlock } from "./CalloutDocsBlock";

const callout = new CalloutDocsBlock();

/**
 * Reuse the approved renderer; ProseMirror owns only the editable body.
 *
 * The body must stay inside ProseMirror's ONE editing host. Wrapping it in a
 * contentEditable={false} frame with a contentEditable={true} island made
 * the island its own editing host: focus left `view.dom` (so
 * `view.hasFocus()` was false and PM stopped syncing the selection), and
 * TipTap's NodeView.stopEvent swallowed every keydown targeting the
 * island, so Enter/Backspace/Tab inside the callout fell through to native
 * contenteditable editing. Only the head row is non-editable furniture.
 */
export function CalloutEditorNodeView({ node }: ReactNodeViewProps) {
  const props = node.attrs.blockProps ?? {};
  const data = {
    id: node.attrs.blockId ?? undefined,
    tone: typeof props.tone === "string" ? props.tone : "info",
    variant: typeof props.variant === "string" ? props.variant : undefined,
    title: typeof props.title === "string" ? props.title : undefined,
    kind: typeof props.kind === "string" ? props.kind : undefined,
    // Empty editor nodes still need a contentDOM for typing their first character.
    body: node.textContent || "\n",
  };
  return (
    <NodeViewWrapper data-doc-type="callout" data-block-id={data.id}>
      {callout.render(
        { tag: "Callout", type: "callout", targetKind: "callout", sourceId: data.id ?? null, data },
        { renderMarkdown: () => <NodeViewContent />, nonEditableFurniture: true },
      )}
    </NodeViewWrapper>
  );
}
