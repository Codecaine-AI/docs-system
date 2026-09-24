"use client";

import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { CalloutDocsBlock } from "./CalloutDocsBlock";

const callout = new CalloutDocsBlock();

/** Reuse the approved renderer; ProseMirror owns only the editable body. */
export function CalloutEditorNodeView({ node }: ReactNodeViewProps) {
  const props = node.attrs.blockProps ?? {};
  const data = {
    id: node.attrs.blockId ?? undefined,
    tone: typeof props.tone === "string" ? props.tone : "info",
    title: typeof props.title === "string" ? props.title : undefined,
    kind: typeof props.kind === "string" ? props.kind : undefined,
    // Empty editor nodes still need a contentDOM for typing their first character.
    body: node.textContent || "\n",
  };
  return (
    <NodeViewWrapper data-doc-type="callout" data-block-id={data.id} contentEditable={false}>
      {callout.render(
        { tag: "Callout", type: "callout", targetKind: "callout", sourceId: data.id ?? null, data },
        { renderMarkdown: () => <NodeViewContent contentEditable={true} /> },
      )}
    </NodeViewWrapper>
  );
}
