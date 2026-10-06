"use client";

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useViewerMotion } from "../../transitions/useViewerMotion";
import { fitHtmlScale, HTML_FRAME_BRIDGE, HTML_FRAME_BRIDGE_HASH } from "./html-frame";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { STRUCTURAL_OPS, blockAttrs, el, stringProp } from "../../render/descriptor-helpers";
import { WIDE_LEFT_BLOCK_LAYOUT } from "../../render/block-layout";
import { atomBlockNode } from "../../editor/core/node-helpers";
import { AppWindowIcon, Maximize2Icon, XIcon } from "lucide-react";
import {
  MEDIA_FOCUS_RING,
  MEDIA_GHOST_BUTTON,
  MEDIA_HEAD_CLASSES,
  MEDIA_HEAD_TEXT,
  MEDIA_PANEL_CLASS,
  MEDIA_PANEL_FILL,
  MediaHeadContent,
} from "./media-panel";

export const DocHtml = atomBlockNode("docHtml");

/**
 * The bridge is hash-authorized; author scripts still require explicit opt-in.
 * The base sheet makes the artifact follow the PAGE theme, not the OS: an
 * iframe's prefers-color-scheme tracks the OS, so the host writes the page's
 * scheme into `color-scheme` and gives the iframe element the same one (a
 * match keeps the frame transparent, so the artifact sits on the panel fill).
 * Text defaults to the scheme's ink.
 */
export function htmlEmbedDocument(html: string, allowScripts = false, colorScheme: HtmlColorScheme = "light"): string {
  const policy = `default-src 'none'; script-src ${allowScripts ? "'unsafe-inline'" : "'sha256-" + HTML_FRAME_BRIDGE_HASH + "'"}; style-src 'unsafe-inline'; img-src data:; media-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html{color-scheme:${colorScheme};background:transparent}body{margin:0;padding:0;box-sizing:border-box;font:15px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;color:CanvasText}img,svg,video{max-width:100%}</style><script>${HTML_FRAME_BRIDGE}</script></head><body>${html}</body></html>`;
}

type Size = { width: number; height: number };
export type HtmlColorScheme = "light" | "dark";

/** The page's color scheme: dark under the workbench's `.dark` root, light otherwise (and on static pages). */
function readPageColorScheme(): HtmlColorScheme {
  if (typeof document === "undefined") return "light";
  const root = document.documentElement;
  return root.classList.contains("dark") || root.dataset.theme === "dark" ? "dark" : "light";
}

function usePageColorScheme(): HtmlColorScheme {
  const [scheme, setScheme] = useState(readPageColorScheme);
  useEffect(() => {
    const update = () => setScheme(readPageColorScheme());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => observer.disconnect();
  }, []);
  return scheme;
}

/*
 * The HTML block is one media panel (media-panel.tsx): text-family tile, the
 * frame title, a mono sandbox note and the Expand ghost button in the head;
 * the artifact sits on the panel fill in the body, inset by the body's 12px
 * padding (nothing is injected into the artifact itself). The iframe takes the
 * page's color scheme, not the OS's (usePageColorScheme, htmlEmbedDocument).
 */
const HTML_PANEL_CLASSES = `not-prose my-6 min-w-0 rounded-[var(--radius,2px)] border border-[color:var(--docs-rule,#e6e5e3)] ${MEDIA_PANEL_CLASS} ${MEDIA_PANEL_FILL}`;
const HTML_BUTTON_CLASSES = `${MEDIA_GHOST_BUTTON} ${MEDIA_FOCUS_RING}`;
const HTML_FRAME_CLASSES = "block border-0 bg-transparent";

export function HtmlBlock({ html, title, height = 400, allowScripts = false }: {
  html: string; title: string; height?: number; allowScripts?: boolean;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const { originRef: inlineRectRef, captureOrigin, animateOpen, animateClose, cancel } = useViewerMotion();
  const [expanded, setExpanded] = useState(false);
  const [ready, setReady] = useState(false);
  const [width, setWidth] = useState(0);
  const layoutWidthRef = useRef(0);
  const [windowHeight, setWindowHeight] = useState(800);
  const [area, setArea] = useState<Size>({ width: 0, height: 0 });
  const [measured, setMeasured] = useState<Size | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const initialHeight = Math.min(2000, Math.max(120, height));
  const colorScheme = usePageColorScheme();
  const srcDoc = useMemo(() => htmlEmbedDocument(html, allowScripts, colorScheme), [html, allowScripts, colorScheme]);
  const label = title || "HTML content";

  const closeViewer = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    animateClose(dialog, slotRef.current, () => setExpanded(false));
  }, [animateClose]);

  useEffect(() => { setMeasured(null); }, [srcDoc, initialHeight]);
  useEffect(() => {
    setReady(true);
    // The slot is the in-flow box the inline iframe occupies (inside the
    // panel's border and body padding); it keeps its place while expanded.
    const slot = slotRef.current;
    if (!slot) return;
    const update = () => {
      const nextWidth = slot.getBoundingClientRect().width;
      if (layoutWidthRef.current !== nextWidth) {
        layoutWidthRef.current = nextWidth;
        setMeasured(null);
        setWidth(nextWidth);
      }
      setWindowHeight(window.innerHeight);
    };
    const observer = new ResizeObserver(update);
    observer.observe(slot);
    window.addEventListener("resize", update);
    update();
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, []);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== "null") return;
      const data = event.data;
      if (data?.type === "docs-html-escape") { closeViewer(); return; }
      if (data?.type !== "docs-html-size" || !Number.isFinite(data.width) || !Number.isFinite(data.height)
        || data.width <= 0 || data.height <= 0 || data.width > 100000 || data.height > 100000) return;
      setMeasured(previous => previous && previous.width === data.width && previous.height === data.height
        ? previous : { width: data.width, height: data.height });
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [closeViewer]);

  // Request again after hydration, including when the frame loaded before React.
  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage({ type: "docs-html-measure" }, "*");
  }, [width, srcDoc]);

  useEffect(() => {
    if (!expanded) return;
    const dialog = dialogRef.current!;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    const measureArea = () => {
      const area = areaRef.current!;
      setArea({ width: area.clientWidth, height: area.clientHeight });
    };
    const observer = new ResizeObserver(measureArea);
    observer.observe(areaRef.current!);
    measureArea();
    animateOpen(dialog);
    return () => {
      cancel();
      observer.disconnect();
      dialog.close();
      document.body.style.overflow = previousOverflow;
      expandRef.current?.focus();
    };
  }, [expanded, animateOpen, cancel]);

  const naturalWidth = Math.max(1, width, measured?.width ?? 0);
  const naturalHeight = measured?.height ?? initialHeight;
  const inlineScale = width ? fitHtmlScale(naturalWidth, naturalHeight, width, Math.min(600, windowHeight * 0.7)) : 1;
  const scale = expanded ? zoom ?? fitHtmlScale(naturalWidth, naturalHeight, area.width || naturalWidth, area.height || naturalHeight) : inlineScale;
  const previewHeight = naturalHeight * inlineScale;

  // This dialog and iframe never move or remount. showModal promotes the existing
  // element to the top layer, preserving the artifact's DOM and script state.
  return <figure className={HTML_PANEL_CLASSES} data-docs-block-type="html">
    <div className={`${MEDIA_HEAD_CLASSES} ${MEDIA_HEAD_TEXT}`}>
      <MediaHeadContent icon={AppWindowIcon} title={label} meta={allowScripts ? "sandbox · scripts" : "sandbox"}>
        {/* Static pages never hydrate, so the control appears only once it works. */}
        {ready && <button ref={expandRef} type="button" className={HTML_BUTTON_CLASSES} aria-label="Expand HTML content"
          onClick={() => {
            captureOrigin(dialogRef.current);
            setZoom(null);
            setExpanded(true);
          }}><Maximize2Icon size={12} strokeWidth={2} aria-hidden />Expand</button>}
      </MediaHeadContent>
    </div>
    <div className="p-3">
      <div ref={slotRef} style={{ minWidth: 0, height: expanded ? inlineRectRef.current?.height ?? previewHeight : undefined }}>
        <dialog ref={dialogRef} role={expanded ? "dialog" : "group"} aria-label={label}
          onCancel={event => { event.preventDefault(); closeViewer(); }}
          style={{ display: "flex", flexDirection: "column", position: expanded ? "fixed" : "relative",
            inset: expanded ? 0 : "auto", width: expanded ? "100vw" : "100%", height: expanded ? "100dvh" : "auto",
            maxWidth: "none", maxHeight: "none", margin: 0, padding: 0, border: 0,
            transformOrigin: "top left", color: "inherit",
            background: expanded ? "var(--docs-page, #fdfdfd)" : "transparent", overflow: "hidden" }}>
          {expanded && <div className={`${MEDIA_HEAD_CLASSES} ${MEDIA_HEAD_TEXT} shrink-0 flex-wrap gap-y-2 py-2`}>
            <span className="mr-auto min-w-0 wrap-anywhere">{label}</span>
            <button type="button" className={HTML_BUTTON_CLASSES} onClick={() => setZoom(null)}>Fit</button>
            <button type="button" className={HTML_BUTTON_CLASSES} onClick={() => setZoom(1)}>100%</button>
            <button type="button" className={HTML_BUTTON_CLASSES} aria-label="Zoom out" onClick={() => setZoom(Math.max(0.05, scale / 1.25))}>−</button>
            <output aria-label="Zoom level" className="min-w-12 text-center font-mono text-[length:var(--ds-font-size-ui-xs)] font-[var(--ds-font-weight-regular)] text-[color:var(--docs-muted,#666562)]">{Math.round(scale * 100)}%</output>
            <button type="button" className={HTML_BUTTON_CLASSES} aria-label="Zoom in" onClick={() => setZoom(Math.min(4, scale * 1.25))}>+</button>
            <button type="button" className={HTML_BUTTON_CLASSES} aria-label="Close HTML viewer" onClick={closeViewer}><XIcon size={12} strokeWidth={2} aria-hidden />Close</button>
          </div>}
          <div ref={areaRef} style={{ minHeight: 0, flex: expanded ? 1 : undefined, overflow: expanded ? "auto" : "hidden", height: expanded ? undefined : (width ? previewHeight : initialHeight) }}>
            <div style={{ position: "relative", width: width ? naturalWidth * scale : "100%", height: naturalHeight * scale, margin: "0 auto", overflow: "hidden" }}>
              <iframe ref={frameRef} title={label} srcDoc={srcDoc} data-docs-html-frame=""
                className={HTML_FRAME_CLASSES}
                onLoad={() => frameRef.current?.contentWindow?.postMessage({ type: "docs-html-measure" }, "*")}
                sandbox="allow-scripts" referrerPolicy="no-referrer" loading="lazy" scrolling={ready && measured ? "no" : "auto"}
                style={{ colorScheme, width: width ? naturalWidth : "100%", height: naturalHeight,
                  maxWidth: "none", transform: `scale(${scale})`, transformOrigin: "top left" }} />
            </div>
          </div>
        </dialog>
      </div>
    </div>
  </figure>;
}

export const htmlDescriptor: DocBlockDescriptor = {
  type: "html", targetKind: "html", label: "HTML",
  agentDescription: "Self-contained HTML/CSS artifact. Props: html (max 1 MiB), title (required; heads the panel and labels the frame), height? (120–2000px; default 400), allowScripts? (default false). Fits interactive HTML within the document width and a 600px/70vh height cap. The host draws a panel whose head shows the title, a sandbox note, and an Expand button that opens Fit and zoom controls without resetting state. Height is the initial layout height and no-JavaScript fallback. The frame follows the page's light or dark color-scheme on a transparent background; the host adds no caption and no padding inside the artifact. Put any visible captions inside html. Inline CSS and data: media work offline. Explicit scripts run only inside an opaque-origin sandbox; fetch, external subresources, nested frames, forms, popups, and parent access are blocked. No external or relative assets. Use code for displayed source examples. Insert/update through typed block operations.",
  patchOps: STRUCTURAL_OPS, layout: WIDE_LEFT_BLOCK_LAYOUT,
  render: (block, ctx) => el("div", { key: block.id, ...blockAttrs(block) }, createElement(HtmlBlock, {
    html: stringProp(block, "html") ?? "", title: stringProp(block, "title") ?? "HTML content",
    height: typeof block.props.height === "number" ? block.props.height : undefined,
    allowScripts: block.props.allowScripts === true,
  }), ctx.renderChildren(block)),
};
