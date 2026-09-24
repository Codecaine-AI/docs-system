"use client";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { HtmlBlock } from "./html";

export function HtmlEditorNodeView({ node }: ReactNodeViewProps) {
  const props = node.attrs.blockProps ?? {};
  return <NodeViewWrapper contentEditable={false} data-doc-node="docHtml" data-doc-block-type="html" data-doc-lane="wide" className="w-full">
    <HtmlBlock html={props.html ?? ""} title={props.title ?? "HTML content"} height={props.height} allowScripts={props.allowScripts === true} />
  </NodeViewWrapper>;
}
