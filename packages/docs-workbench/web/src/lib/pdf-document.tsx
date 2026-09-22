import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Renderer, { DOC_SURFACE_TYPOGRAPHY_CLASSES } from "@codecaine-ai/docs-viewer/doc-block-renderer";
import { DocsClientProvider } from "@codecaine-ai/docs-viewer/client";
import { resolveBundleAssetSrc } from "@codecaine-ai/docs-viewer/bundle-src";
import { validateDocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { renderDocumentToSvg } from "@codecaine-ai/canvas/render";
import { validateInteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
import { renderSequenceSvgString, validateSequenceDocument, type SequenceDocument } from "@codecaine-ai/sequence";
import { assetUrl, getBundle, getCanvasBySrc, getSequenceBySrc } from "../data/api";

export const PDF_CSS = `
html,body{margin:0!important;padding:0!important;height:auto!important;overflow:visible!important;background:white!important;color:#20252b!important;color-scheme:light}
body{font:11pt/1.5 system-ui,sans-serif}*{box-sizing:border-box;animation:none!important;transition:none!important}
.pdf-document{width:100%;max-width:none!important}.pdf-document h1{font-size:24pt;margin:0 0 18pt}.pdf-document h2{font-size:17pt}.pdf-document h3{font-size:13pt}
h1,h2,h3,h4,summary{break-after:avoid}p{orphans:3;widows:3}a{color:#24557a;text-decoration:underline}
img,svg{max-width:100%!important;height:auto}figure{margin:12pt 0;break-inside:avoid}figure img{max-height:225mm;object-fit:contain}figcaption{font-size:10pt;margin-bottom:6pt;color:#555}
table{width:100%!important;border-collapse:collapse;table-layout:fixed}th,td{overflow-wrap:anywhere;white-space:normal!important;border-bottom:1px solid #ddd;padding:6pt;vertical-align:top}thead{display:table-header-group}tr{break-inside:avoid}
pre,code{color:#20252b!important;font-size:9pt!important;white-space:pre-wrap!important;overflow-wrap:anywhere}pre{padding:10pt;background:#f5f6f8;border:1px solid #e0e2e5}
[data-code-copy],video,dialog{display:none!important}button,[role=button]{pointer-events:none}iframe{display:block;width:100%;border:0;max-width:100%;break-inside:avoid}
.pdf-document [data-doc-block],.pdf-document [data-doc-lane]{max-width:100%!important;min-width:0!important}
.pdf-document [class*=overflow]{overflow:visible!important}.pdf-document [class*=max-h-]{max-height:none!important}
.pdf-document .docs-block-layout{display:block!important;width:100%!important}.pdf-document [data-doc-block=divider]{margin:14pt 0}
`;

function dataSvg(svg: string) { return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; }

export function printStyles(): string {
  return Array.from(document.styleSheets, sheet => {
    try { return Array.from(sheet.cssRules, rule => rule.cssText).join("\n"); }
    catch { return ""; }
  }).join("\n");
}

/** Snapshot saved content and portable diagrams. Source documents are never changed. */
export async function buildPdfHtml(path: string, css: string): Promise<string> {
  const { doc } = await getBundle(path);
  const parsed = validateDocDocument(doc);
  if (!parsed.ok) throw new Error(`Cannot export invalid page: ${path}`);
  const documentModel = parsed.document;
  const diagrams = new Map<string, string>();
  for (const block of Object.values(documentModel.blocks)) {
    if (block.type !== "canvas" && block.type !== "sequence") continue;
    const src = typeof block.props.src === "string" ? resolveBundleAssetSrc(path, block.props.src) : "";
    if (!src) throw new Error(`“${documentModel.title}” has a ${block.type} without a saved sidecar. Save the diagram into this page before exporting.`);
    const key = `${src}:${String(block.props.view ?? "")}`;
    if (block.type === "canvas") {
      const result = validateInteractiveCanvasDocument((await getCanvasBySrc(src)).canvas);
      if (!result.ok) throw new Error(`Invalid canvas in ${path}`);
      diagrams.set(key, dataSvg(renderDocumentToSvg(result.document, { fit: "content", padding: 24,
        ...(typeof block.props.view === "string" ? { sectionId: block.props.view } : {}),
      }).svg));
    } else {
      const sequence = (await getSequenceBySrc(src)).sequence;
      const result = validateSequenceDocument(sequence);
      if (!result.ok) throw new Error(`Invalid sequence in ${path}`);
      diagrams.set(key, dataSvg(renderSequenceSvgString(sequence as SequenceDocument)));
    }
  }
  const Diagram = ({ src, title, view }: { src?: string; title?: string; view?: string }) =>
    <figure>{title && <figcaption>{title}</figcaption>}<img src={diagrams.get(`${src}:${view ?? ""}`)} alt={title ?? "Diagram"} /></figure>;
  const markup = renderToStaticMarkup(<DocsClientProvider canvasEmbed={Diagram} sequenceEmbed={Diagram}>
    <article className={`pdf-document ${DOC_SURFACE_TYPOGRAPHY_CLASSES}`}>
      <h1>{documentModel.title || path.split("/").at(-1)}</h1>
      <Renderer document={documentModel} bundlePath={path} resolveAssetSrc={src => assetUrl(resolveBundleAssetSrc(path, src))} />
    </article>
  </DocsClientProvider>);
  const output = new DOMParser().parseFromString(markup, "text/html");
  for (const block of Object.values(documentModel.blocks)) {
    if (block.type !== "html" && block.type !== "code") continue;
    const host = output.querySelector(`[data-block-id="${CSS.escape(block.id)}"]`);
    if (!host) continue;
    const children = (block.children ?? []).map(id => host.querySelector(`[data-block-id="${CSS.escape(id)}"]`)).filter(Boolean);
    host.replaceChildren();
    if (block.type === "code") {
      const pre = output.createElement("pre");
      const code = output.createElement("code");
      code.textContent = block.text?.map(span => span.insert).join("") ?? "";
      pre.append(code); host.append(pre);
      if (Array.isArray(block.props.annotations)) {
        for (const annotation of block.props.annotations as { lines: string; label?: string; note: string }[]) {
          const note = output.createElement("p");
          note.textContent = `Lines ${annotation.lines}${annotation.label ? ` · ${annotation.label}` : ""}: ${annotation.note}`;
          host.append(note);
        }
      }
      host.append(...children as Node[]);
      continue;
    }
    const frame = output.createElement("iframe");
    frame.title = String(block.props.title ?? "HTML content");
    frame.setAttribute("sandbox", "");
    frame.style.height = `${Number(block.props.height) || 400}px`;
    frame.srcdoc = String(block.props.html ?? "");
    host.append(frame, ...children as Node[]);
  }
  output.querySelectorAll("details").forEach(el => { el.open = true; });
  for (const video of output.querySelectorAll("video")) {
    const note = output.createElement("p");
    note.textContent = "Video: view this page in Docs to play the recording.";
    video.replaceWith(note);
  }
  // Only same-origin application assets can be read into the print snapshot.
  // The printer itself has no network access.
  for (const img of output.querySelectorAll("img")) {
    const src = img.getAttribute("src");
    if (!src) throw new Error(`Missing image or diagram in ${path}`);
    if (src.startsWith("data:")) continue;
    const url = new URL(src, window.location.href);
    if (url.origin !== window.location.origin) throw new Error(`Save the external image into Docs before exporting: ${src}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Cannot load image for PDF: ${src}`);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error(`Invalid image for PDF: ${src}`);
    img.src = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    img.removeAttribute("loading");
    img.removeAttribute("srcset");
  }
  const style = output.createElement("style");
  style.textContent = css + "\n" + PDF_CSS;
  output.head.append(style);
  output.title = documentModel.title || "Docs";
  return "<!doctype html>" + output.documentElement.outerHTML;
}
