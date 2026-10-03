import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Renderer, { DOC_SURFACE_TYPOGRAPHY_CLASSES } from "@codecaine-ai/docs-viewer/doc-block-renderer";
import { DocsClientProvider } from "@codecaine-ai/docs-viewer/client";
import { resolveBundleAssetSrc } from "@codecaine-ai/docs-viewer/bundle-src";
import { validateDocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { DOCS_DEFAULT_FONTS } from "@codecaine-ai/docs-model/layout";
import { renderDocumentToSvg } from "@codecaine-ai/canvas/render";
import { validateInteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
import { renderSequenceSvgString, validateSequenceDocument, type SequenceDocument } from "@codecaine-ai/sequence";
import { assetUrl, getBundle, getCanvasBySrc, getSequenceBySrc } from "../data/api";
import { loadDocsFonts } from "./docs-fonts";
import { scopeSvgIds } from "./inline-svg";

/**
 * Print typography is fixed, whatever the theme or style rail picked: the
 * faces docs text is measured with (DOCS_DEFAULT_FONTS, bundled with
 * @codecaine-ai/text-measure), Inter for text and IBM Plex Mono for code. The
 * tokens sit on :root so values derived there (Tailwind's --font-sans) follow.
 */
const PDF_SANS = DOCS_DEFAULT_FONTS.sans.stack;
const PDF_MONO = DOCS_DEFAULT_FONTS.code.stack;

export const PDF_CSS = `
:root{--font-tx02:${PDF_SANS};--font-display:${PDF_SANS};--style-heading-font:${PDF_SANS};--docs-font-code:${PDF_MONO}}
html,body{margin:0!important;padding:0!important;height:auto!important;overflow:visible!important;background:white!important;color:#20252b!important;color-scheme:light}
body{font:11pt/1.5 ${PDF_SANS}}*{box-sizing:border-box;animation:none!important;transition:none!important}
.pdf-document{width:100%;max-width:none!important}.pdf-document h1{font-size:24pt;margin:0 0 18pt}.pdf-document h2{font-size:17pt}.pdf-document h3{font-size:13pt}
h1,h2,h3,h4,summary{break-after:avoid}p{orphans:3;widows:3}a{color:#24557a;text-decoration:underline}
img,svg:not(svg svg){max-width:100%!important;height:auto}figure{margin:12pt 0;break-inside:avoid}figure img{max-height:225mm;object-fit:contain}figcaption{font-size:10pt;margin-bottom:6pt;color:#555}
.pdf-diagram>svg{display:block;margin:0 auto;max-height:225mm;letter-spacing:normal;word-spacing:normal}
table{width:100%!important;border-collapse:collapse;table-layout:fixed}th,td{overflow-wrap:anywhere;white-space:normal!important;border-bottom:1px solid #ddd;padding:6pt;vertical-align:top}thead{display:table-header-group}tr{break-inside:avoid}
pre,code{color:#20252b!important;font-size:9pt!important;white-space:pre-wrap!important;overflow-wrap:anywhere}pre{padding:10pt;background:#f5f6f8;border:1px solid #e0e2e5}
[data-code-copy],video,dialog{display:none!important}button,[role=button]{pointer-events:none}iframe{display:block;width:100%;border:0;max-width:100%;break-inside:avoid}
.pdf-document [data-doc-block],.pdf-document [data-doc-lane]{max-width:100%!important;min-width:0!important}
.pdf-document [class*=overflow]{overflow:visible!important}.pdf-document [class*=max-h-]{max-height:none!important}
.pdf-document .docs-block-layout{display:block!important;width:100%!important}.pdf-document [data-doc-block=divider]{margin:14pt 0}
`;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Settles like `promise`, but rejects as soon as `signal` aborts, even when the work ignores the signal. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/** One @font-face rule the snapshot can embed: its descriptors and its first same-origin (or data:) source. */
type PrintFontFace = {
  family: string;
  /** Declared weight; null for a range, which is kept whenever its family renders. */
  weight: number | null;
  rule: string;
  /** The rule's `src` declaration, replaced by the embedded file. */
  source: string;
  url: URL;
  format?: string;
};

/**
 * One export's print inputs, shared by every page: the app's CSS, the font
 * faces it declares, and one download per font file.
 */
export type PrintContext = {
  /** The app stylesheets without their @font-face rules (each page embeds the faces it renders). */
  css: string;
  faces: PrintFontFace[];
  /** Cancels the export: font downloads stop and buildPdfHtml rejects with the abort reason. */
  signal?: AbortSignal;
  files: Map<string, Promise<string | null>>;
  /** Faces that could not be embedded ("IBM Plex Mono 600"): their text prints in a fallback font. */
  missingFonts: Set<string>;
};

/** An @font-face `src` declaration: its first url() and format(), then any further sources. */
const FONT_FACE_SOURCE = /src:\s*url\(\s*(["']?)(.*?)\1\s*\)(?:\s*format\(\s*["']?([\w-]+)["']?\s*\))?[^;}]*/;
/** Font downloads per export are bounded: a stalled file degrades to a fallback font instead of hanging the export. */
const FONT_TIMEOUT_MS = 10_000;
/** How long the hidden frame that reports a page's fonts may take to load before every face is embedded instead. */
const RENDER_TIMEOUT_MS = 5_000;

/** The first family of a font-family value, unquoted. */
const firstFamily = (stack: string) => (stack.split(",")[0] ?? "").trim().replace(/^(["'])(.*)\1$/, "$2");

function cssWeight(value: string): number {
  if (value === "normal") return 400;
  if (value === "bold") return 700;
  const weight = Number.parseFloat(value);
  return Number.isFinite(weight) ? weight : 400;
}

/** The declared weight CSS font matching paints for `desired` (CSS Fonts 4, 5.2). */
function matchedWeight(available: number[], desired: number): number | undefined {
  if (available.includes(desired)) return desired;
  const below = available.filter(weight => weight < desired).sort((a, b) => b - a);
  const above = available.filter(weight => weight > desired).sort((a, b) => a - b);
  if (desired >= 400 && desired <= 500) return above.find(weight => weight <= 500) ?? below[0] ?? above[0];
  return desired < 400 ? below[0] ?? above[0] : above[0] ?? below[0];
}

function readFontFace(rule: CSSRule, base: string): PrintFontFace | null {
  const text = rule.cssText;
  const match = FONT_FACE_SOURCE.exec(text);
  const family = /font-family:\s*([^;]+);/.exec(text)?.[1];
  if (!match || !family) return null;
  let url: URL;
  try { url = new URL(match[2] ?? "", base); }
  catch { return null; }
  // The printer has no network: a face on another origin cannot be embedded.
  if (url.protocol !== "data:" && url.origin !== window.location.origin) return null;
  const weights = (/font-weight:\s*([^;]+);/.exec(text)?.[1] ?? "normal").trim().split(/\s+/);
  return {
    family: firstFamily(family),
    weight: weights.length === 1 ? cssWeight(weights[0]!) : null,
    rule: text,
    source: match[0],
    url,
    ...(match[3] ? { format: match[3] } : {}),
  };
}

/** Starts one export: collects the app CSS and its font faces from the live page. */
export function createPrintContext(signal?: AbortSignal): PrintContext {
  const css: string[] = [];
  const faces: PrintFontFace[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRule[];
    try { rules = Array.from(sheet.cssRules); }
    catch { continue; }
    const base = sheet.href ?? document.baseURI;
    for (const rule of rules) {
      if (!rule.cssText.startsWith("@font-face")) css.push(rule.cssText);
      else {
        const face = readFontFace(rule, base);
        if (face) faces.push(face);
      }
    }
  }
  return { css: css.join("\n"), faces, signal, files: new Map(), missingFonts: new Set() };
}

/**
 * The family and weight of every visible text run, styled the way the
 * printer styles it: the page renders in a hidden same-origin frame without
 * scripts or fonts, and each element with its own text (or a ::before /
 * ::after) reports its computed font. Null without a DOM to render in.
 */
async function renderedFonts(html: string): Promise<Map<string, Set<number>> | null> {
  if (typeof document === "undefined" || !document.body) return null;
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:688px;height:994px;border:0;visibility:hidden";
  const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), { once: true }));
  frame.srcdoc = html;
  document.body.append(frame);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ready = await Promise.race([
      loaded.then(() => true),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), RENDER_TIMEOUT_MS); }),
    ]);
    const page = frame.contentDocument;
    const view = frame.contentWindow;
    if (!ready || !page?.body || !view) return null;
    const fonts = new Map<string, Set<number>>();
    const record = (style: CSSStyleDeclaration) => {
      const family = firstFamily(style.fontFamily).toLowerCase();
      const weights = fonts.get(family) ?? new Set<number>();
      weights.add(cssWeight(style.fontWeight));
      fonts.set(family, weights);
    };
    for (const element of [page.body, ...Array.from(page.body.querySelectorAll("*"))]) {
      if (element.checkVisibility?.() === false) continue;
      const ownText = Array.from(element.childNodes).some(node => node.nodeType === 3 && node.textContent?.trim());
      if (ownText) record(view.getComputedStyle(element));
      for (const pseudo of ["::before", "::after"]) {
        const style = view.getComputedStyle(element, pseudo);
        if (style.content && style.content !== "none" && style.content !== "normal" && style.content !== '""') record(style);
      }
    }
    return fonts;
  } finally {
    clearTimeout(timer);
    frame.remove();
  }
}

/** The declared faces a page renders with; every face when the page cannot be rendered to check. */
async function pageFaces(html: string, faces: PrintFontFace[]): Promise<PrintFontFace[]> {
  if (faces.length === 0) return faces;
  const rendered = await renderedFonts(html);
  if (!rendered) return faces;
  return faces.filter(face => {
    const used = rendered.get(face.family.toLowerCase());
    if (!used) return false;
    if (face.weight === null) return true;
    const declared = faces.flatMap(other =>
      other.family.toLowerCase() === face.family.toLowerCase() && other.weight !== null ? [other.weight] : []);
    return Array.from(used).some(weight => matchedWeight(declared, weight) === face.weight);
  });
}

async function downloadFont(url: URL, exportSignal: AbortSignal | undefined): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timed out after ${FONT_TIMEOUT_MS}ms`)), FONT_TIMEOUT_MS);
  const cancel = () => controller.abort(exportSignal?.reason);
  exportSignal?.addEventListener("abort", cancel, { once: true });
  try {
    exportSignal?.throwIfAborted();
    const response = await untilAborted(fetch(url, { signal: controller.signal }), controller.signal);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await untilAborted(response.blob().then(blobToDataUrl), controller.signal);
  } finally {
    clearTimeout(timer);
    exportSignal?.removeEventListener("abort", cancel);
  }
}

/**
 * @font-face rules for `faces` with their files embedded as data URLs, each
 * file downloaded once per export. A file that fails or times out is left
 * out and listed in `missingFonts`; a canceled export rejects.
 */
async function embeddedFontFaces(faces: PrintFontFace[], context: PrintContext): Promise<string> {
  const rules = await Promise.all(faces.map(async face => {
    if (face.url.protocol === "data:") return face.rule;
    let file = context.files.get(face.url.href);
    if (!file) {
      file = downloadFont(face.url, context.signal).catch((error: unknown) => {
        if (context.signal?.aborted) throw error;
        return null;
      });
      context.files.set(face.url.href, file);
    }
    const data = await file;
    if (data === null) {
      context.missingFonts.add(`${face.family} ${face.weight ?? ""}`.trim());
      return "";
    }
    const embedded = `src: url("${data}")${face.format ? ` format("${face.format}")` : ""}`;
    return face.rule.replace(face.source, () => embedded);
  }));
  return rules.filter(Boolean).join("\n");
}

/**
 * Snapshot saved content and portable diagrams, with the font files the page
 * renders embedded. Source documents are never changed. Rejects as soon as
 * the export is canceled, whichever step is waiting.
 */
export function buildPdfHtml(path: string, context: PrintContext): Promise<string> {
  return untilAborted(snapshotPage(path, context), context.signal);
}

async function snapshotPage(path: string, context: PrintContext): Promise<string> {
  const { doc } = await getBundle(path);
  const parsed = validateDocDocument(doc);
  if (!parsed.ok) throw new Error(`Cannot export invalid page: ${path}`);
  const documentModel = parsed.document;
  // Diagrams are laid out here, so measure with the faces the PDF paints.
  await loadDocsFonts();
  /** Diagram SVG markup by `src:view`, inlined so its text paints in the embedded faces. */
  const diagrams = new Map<string, string>();
  for (const block of Object.values(documentModel.blocks)) {
    if (block.type !== "canvas" && block.type !== "sequence") continue;
    const src = typeof block.props.src === "string" ? resolveBundleAssetSrc(path, block.props.src) : "";
    if (!src) throw new Error(`“${documentModel.title}” has a ${block.type} without a saved sidecar. Save the diagram into this page before exporting.`);
    const key = `${src}:${String(block.props.view ?? "")}`;
    if (block.type === "canvas") {
      const result = validateInteractiveCanvasDocument((await getCanvasBySrc(src)).canvas);
      if (!result.ok) throw new Error(`Invalid canvas in ${path}`);
      diagrams.set(key, renderDocumentToSvg(result.document, { fit: "content", padding: 24,
        ...(typeof block.props.view === "string" ? { sectionId: block.props.view } : {}),
      }).svg);
    } else {
      const sequence = (await getSequenceBySrc(src)).sequence;
      const result = validateSequenceDocument(sequence);
      if (!result.ok) throw new Error(`Invalid sequence in ${path}`);
      diagrams.set(key, renderSequenceSvgString(sequence as SequenceDocument));
    }
  }
  let diagramCount = 0;
  const Diagram = ({ src, title, view }: { src?: string; title?: string; view?: string }) => {
    const svg = diagrams.get(`${src}:${view ?? ""}`);
    if (svg === undefined) throw new Error(`Missing diagram in ${path}`);
    diagramCount += 1;
    return <figure>{title && <figcaption>{title}</figcaption>}
      <div className="pdf-diagram" dangerouslySetInnerHTML={{ __html: scopeSvgIds(svg, `pdf-diagram-${diagramCount}-`) }} />
    </figure>;
  };
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
    const response = await fetch(url, { signal: context.signal });
    if (!response.ok) throw new Error(`Cannot load image for PDF: ${src}`);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error(`Invalid image for PDF: ${src}`);
    img.src = await blobToDataUrl(blob);
    img.removeAttribute("loading");
    img.removeAttribute("srcset");
  }
  const style = output.createElement("style");
  style.textContent = context.css + "\n" + PDF_CSS;
  output.head.append(style);
  output.title = documentModel.title || "Docs";
  context.signal?.throwIfAborted();
  const fonts = await embeddedFontFaces(await pageFaces("<!doctype html>" + output.documentElement.outerHTML, context.faces), context);
  if (fonts) {
    const fontStyle = output.createElement("style");
    fontStyle.textContent = fonts;
    output.head.prepend(fontStyle);
  }
  return "<!doctype html>" + output.documentElement.outerHTML;
}
