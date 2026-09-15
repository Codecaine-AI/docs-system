"use client";
import { useState } from "react";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useDocEditorNodeViewContext } from "../../editor/views/node-view-context";
import { ImageGrid, type ImageGridItem } from "./image-grid";

export function ImageGridEditorNodeView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const props = node.attrs.blockProps ?? {};
  const images: ImageGridItem[] = props.images ?? [];
  const { resolveAssetSrc } = useDocEditorNodeViewContext();
  const [newSrc, setNewSrc] = useState("");
  const set = (patch: Record<string, unknown>) => updateAttributes({ blockProps: { ...props, ...patch } });
  const update = (index: number, patch: Partial<ImageGridItem>) => set({ images: images.map((item, i) => i === index ? { ...item, ...patch } : item) });
  const move = (index: number, offset: number) => {
    const next = [...images];
    [next[index], next[index + offset]] = [next[index + offset]!, next[index]!];
    set({ images: next });
  };
  return <NodeViewWrapper contentEditable={false} data-doc-node="docImageGrid" data-doc-block-type="image-grid" data-doc-lane="wide" className="w-full">
    <ImageGrid images={images} columns={props.columns} resolveAssetSrc={resolveAssetSrc} />
    {editor.isEditable && <details className="rounded-md border p-3 text-sm">
      <summary className="cursor-pointer">Edit image grid</summary>
      <label className="mt-3 block">Columns <select aria-label="Grid columns" value={props.columns ?? "auto"} onChange={e => set({ columns: e.target.value === "auto" ? "auto" : Number(e.target.value) })}>
        <option value="auto">Auto</option>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
      </select></label>
      {images.map((image, index) => <fieldset className="mt-3 rounded border p-2" key={index}>
        <legend>Image {index + 1}</legend>
        {(["heading", "src", "alt", "caption"] as const).map(field => <label className="block" key={field}>{({ heading: "Heading", src: "Image path", alt: "Alt text", caption: "Caption" })[field]}
          <input className="block w-full rounded border bg-background p-1" value={image[field] ?? ""} onChange={e => { if (field !== "src" || e.target.value.trim()) update(index, { [field]: e.target.value }); }} />
        </label>)}
        <div className="mt-2 flex gap-3">
          <button type="button" disabled={index === 0} aria-label={`Move image ${index + 1} earlier`} onClick={() => move(index, -1)}>Move earlier</button>
          <button type="button" disabled={index === images.length - 1} aria-label={`Move image ${index + 1} later`} onClick={() => move(index, 1)}>Move later</button>
          <button type="button" aria-label={`Remove image ${index + 1}`} onClick={() => set({ images: images.filter((_, i) => i !== index) })}>Remove</button>
        </div>
      </fieldset>)}
      <label className="mt-3 block">New image path<input className="block w-full rounded border bg-background p-1" placeholder="./assets/images/example.png" value={newSrc} onChange={e => setNewSrc(e.target.value)} /></label>
      <button className="mt-2" type="button" disabled={!newSrc.trim()} onClick={() => { set({ images: [...images, { src: newSrc.trim(), alt: "" }] }); setNewSrc(""); }}>Add image</button>
      <p className="mt-2 text-xs text-muted-foreground">Use an uploaded image's bundle path. Headings appear above images; captions appear below. Columns reduce automatically in narrow panes.</p>
    </details>}
  </NodeViewWrapper>;
}
