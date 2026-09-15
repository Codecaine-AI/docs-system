"use client";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { HtmlBlock } from "./html";

export function HtmlEditorNodeView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const props = node.attrs.blockProps ?? {};
  const set = (patch: Record<string, unknown>) => updateAttributes({ blockProps: { ...props, ...patch } });
  return <NodeViewWrapper contentEditable={false} data-doc-node="docHtml" data-doc-block-type="html" data-doc-lane="wide" className="w-full">
    <HtmlBlock html={props.html ?? ""} title={props.title ?? "HTML content"} caption={props.caption} height={props.height} allowScripts={props.allowScripts === true} />
    {editor.isEditable && <details className="rounded-md border p-3 text-sm">
      <summary className="cursor-pointer">Edit HTML</summary>
      <label className="mt-3 block">Title<input className="block w-full rounded border bg-background p-2" value={props.title ?? ""} onChange={(e) => set({ title: e.target.value || "HTML content" })} /></label>
      <label className="mt-3 block">HTML source<textarea aria-label="HTML source" className="block min-h-48 w-full rounded border bg-background p-2 font-mono text-xs" spellCheck={false} value={props.html ?? ""} maxLength={1048576} onChange={(e) => set({ html: e.target.value })} /></label>
      <label className="mt-3 block">Height in pixels<input type="number" min={120} max={2000} className="ml-2 rounded border bg-background p-1" value={props.height ?? 400} onChange={(e) => set({ height: Math.max(120, Math.min(2000, Number(e.target.value) || 400)) })} /></label>
      <label className="mt-3 block"><input type="checkbox" checked={props.allowScripts === true} onChange={(e) => set({ allowScripts: e.target.checked })} /> Allow scripts inside this embed</label>
      <p className="mt-2 text-xs text-muted-foreground">Self-contained HTML only. Inline styles and data images work; external files and fetch requests are blocked.</p>
    </details>}
  </NodeViewWrapper>;
}
