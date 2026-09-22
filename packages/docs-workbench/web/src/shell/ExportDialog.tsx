import { useEffect, useRef, useState } from "react";
import type { DocsTreeNode } from "@codecaine-ai/docs-viewer/client";
import { exportPages, pdfEntryPath } from "../lib/pdf-selection";
import "./export-dialog.css";

type Format = "zip" | "combined" | "separate";
type Download = { name: string; url: string };

function Selection({ nodes, selected, change }: { nodes: DocsTreeNode[]; selected: Set<string>; change: (paths: string[], on: boolean) => void }) {
  return <ul className="pdf-tree">{nodes.filter(node => node.kind !== "file").map(node => {
    const descendants = exportPages([node]).map(page => page.path);
    if (!descendants.length) return null;
    const checked = node.kind === "bundle" ? selected.has(node.path) : descendants.every(path => selected.has(path));
    const partial = node.kind === "dir" && !checked && descendants.some(path => selected.has(path));
    return <li key={node.path}>
      <div className="pdf-tree-row">
        <label title={node.path}><input type="checkbox" checked={checked} ref={el => { if (el) el.indeterminate = partial; }}
          onChange={e => change(node.kind === "bundle" ? [node.path] : descendants, e.target.checked)} />{node.name}</label>
        {node.kind === "bundle" && descendants.length > 1 && <button type="button" onClick={() => change(descendants, !descendants.every(path => selected.has(path)))}>{descendants.every(path => selected.has(path)) ? "Clear section" : "Select section"}</button>}
      </div>
      {node.children && <Selection nodes={node.children} selected={selected} change={change} />}
    </li>;
  })}</ul>;
}

export function ExportDialog({ tree, currentPath, onClose }: { tree: DocsTreeNode[]; currentPath: string | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);
  const [selected, setSelected] = useState(new Set(currentPath ? [currentPath] : []));
  const [format, setFormat] = useState<Format>("zip");
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [downloads, setDownloads] = useState<Download[]>([]);
  const pages = exportPages(tree);
  const selectedPages = pages.filter(page => selected.has(page.path));
  useEffect(() => {
    dialog.current?.showModal();
    return () => { controller.current?.abort(); urls.current.forEach(URL.revokeObjectURL); };
  }, []);
  const change = (paths: string[], on: boolean) => setSelected(previous => {
    const next = new Set(previous);
    paths.forEach(path => on ? next.add(path) : next.delete(path));
    return next;
  });
  const run = async () => {
    setBusy(true); setError(""); setDownloads([]);
    urls.current.forEach(URL.revokeObjectURL); urls.current = [];
    const abort = new AbortController(); controller.current = abort;
    try {
      const { buildPdfHtml, printStyles } = await import("../lib/pdf-document");
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const css = printStyles();
      const files: { path: string; bytes: Uint8Array }[] = [];
      for (const [index, page] of selectedPages.entries()) {
        abort.signal.throwIfAborted();
        setProgress(`Rendering ${index + 1} of ${selectedPages.length}: ${page.name}`);
        const html = await buildPdfHtml(page.path, css);
        abort.signal.throwIfAborted();
        const response = await fetch("api/export-pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ html, pageNumbers: format !== "combined" }), signal: abort.signal });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          throw new Error(detail.detail || `PDF export failed (${response.status}).`);
        }
        files.push({ path: pdfEntryPath(page.path), bytes: new Uint8Array(await response.arrayBuffer()) });
      }
      abort.signal.throwIfAborted();
      setProgress("Preparing download…");
      const result: Download[] = [];
      const add = (name: string, bytes: Uint8Array, type: string) => {
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
        urls.current.push(url); result.push({ name, url });
      };
      if (format === "combined") {
        const combined = await PDFDocument.create();
        for (const file of files) {
          const pdf = await PDFDocument.load(file.bytes);
          for (const page of await combined.copyPages(pdf, pdf.getPageIndices())) combined.addPage(page);
        }
        combined.setTitle("Docs export");
        const font = await combined.embedFont(StandardFonts.Helvetica);
        combined.getPages().forEach((page, index) => {
          const text = `${index + 1} / ${combined.getPageCount()}`;
          page.drawText(text, { x: (page.getWidth() - font.widthOfTextAtSize(text, 9)) / 2, y: 20, size: 9, font, color: rgb(.4, .4, .4) });
        });
        add("docs.pdf", await combined.save(), "application/pdf");
      } else if (format === "zip") {
        const { zip } = await import("fflate");
        const bytes = await new Promise<Uint8Array>((resolve, reject) => zip(Object.fromEntries(files.map(file => [file.path, file.bytes])), { level: 0 }, (error, data) => error ? reject(error) : resolve(data)));
        add("docs-pdfs.zip", bytes, "application/zip");
      } else {
        for (const [index, file] of files.entries()) add(`${String(index + 1).padStart(2, "0")}-${file.path.split("/").at(-1)}`, file.bytes, "application/pdf");
      }
      abort.signal.throwIfAborted();
      setDownloads(result);
      for (const file of result) {
        const link = document.createElement("a"); link.href = file.url; link.download = file.name;
        document.body.append(link); link.click(); link.remove();
      }
      setProgress(`${files.length} ${files.length === 1 ? "page" : "pages"} exported.`);
    } catch (error) {
      if (!abort.signal.aborted) setError(error instanceof Error ? error.message : String(error));
      else setProgress("Export canceled.");
    } finally { setBusy(false); }
  };
  return <dialog ref={dialog} className="pdf-export-dialog" aria-labelledby="pdf-export-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2 id="pdf-export-title">Export pages</h2><button type="button" aria-label="Close export" onClick={onClose}>×</button></header>
    <p>Export saved pages in sidebar order. Diagrams are static; videos remain viewable in Docs.</p>
    <fieldset disabled={busy}>
      <div className="pdf-selection-actions"><span>{selectedPages.length} selected</span><button type="button" onClick={() => setSelected(new Set(pages.map(page => page.path)))}>Select all</button><button type="button" onClick={() => setSelected(new Set())}>Clear</button></div>
      <div className="pdf-selection"><Selection nodes={tree} selected={selected} change={change} /></div>
      <label className="pdf-format">Download as<select value={format} onChange={e => setFormat(e.target.value as Format)}>
        <option value="zip">ZIP of PDFs · preserve folders</option><option value="combined">One combined PDF</option><option value="separate">Separate PDF files</option>
      </select></label>
      <p className="pdf-format-note">{format === "zip" ? "One PDF per docs page, keeping the original folder paths." : format === "combined" ? "Each docs page starts on a new sheet in one PDF." : "One download per docs page. Your browser may ask to allow multiple downloads."}</p>
    </fieldset>
    {selectedPages.length > 100 && <p role="alert">Select up to 100 pages per export.</p>}
    {error && <p role="alert" className="pdf-error">{error}</p>}
    <div role="status" aria-live="polite">{progress}</div>
    {downloads.length > 0 && <div className="pdf-downloads"><p>Downloads ready. If a download did not start, use its link:</p>{downloads.map(file => <a key={file.url} href={file.url} download={file.name}>{file.name}</a>)}</div>}
    <footer>{busy ? <button type="button" onClick={() => controller.current?.abort()}>Cancel export</button> : <button type="button" onClick={onClose}>Close</button>}
      <button type="button" className="pdf-primary" disabled={busy || selectedPages.length === 0 || selectedPages.length > 100} onClick={() => void run()}>{busy ? "Exporting…" : "Export"}</button></footer>
  </dialog>;
}
