"use client";

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useViewerMotion } from "../../transitions/useViewerMotion";
import { fitHtmlScale, HTML_FRAME_BRIDGE, HTML_FRAME_BRIDGE_HASH } from "./html-frame";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { STRUCTURAL_OPS, blockAttrs, el, stringProp } from "../../render/descriptor-helpers";
import { WIDE_LEFT_BLOCK_LAYOUT } from "../../render/block-layout";
import { atomBlockNode } from "../../editor/core/node-helpers";

export const DocHtml = atomBlockNode("docHtml");

/** The bridge is hash-authorized; author scripts still require explicit opt-in. */
export function htmlEmbedDocument(html: string, allowScripts = false): string {
  const policy = `default-src 'none'; script-src ${allowScripts ? "'unsafe-inline'" : "'sha256-" + HTML_FRAME_BRIDGE_HASH + "'"}; style-src 'unsafe-inline'; img-src data:; media-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html{color-scheme:light dark}body{margin:0;padding:0;box-sizing:border-box;font-family:system-ui,sans-serif}img,svg,video{max-width:100%}</style><script>${HTML_FRAME_BRIDGE}</script></head><body>${html}</body></html>`;
}

type Size = { width: number; height: number };
const controlStyle = { border: "1px solid var(--border, #aaa)", borderRadius: 4, padding: "4px 8px", fontSize: 12, cursor: "pointer" };

export function HtmlBlock({ html, title, height = 400, allowScripts = false }: {
  html: string; title: string; height?: number; allowScripts?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
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
  const srcDoc = useMemo(() => htmlEmbedDocument(html, allowScripts), [html, allowScripts]);

  const closeViewer = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    animateClose(dialog, hostRef.current, () => setExpanded(false));
  }, [animateClose]);

  useEffect(() => { setMeasured(null); }, [srcDoc, initialHeight]);
  useEffect(() => {
    setReady(true);
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      const nextWidth = host.getBoundingClientRect().width;
      if (layoutWidthRef.current !== nextWidth) {
        layoutWidthRef.current = nextWidth;
        setMeasured(null);
        setWidth(nextWidth);
      }
      setWindowHeight(window.innerHeight);
    };
    const observer = new ResizeObserver(update);
    observer.observe(host);
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
  return <div ref={hostRef} className="not-prose my-4" data-docs-block-type="html"
    style={{ minWidth: 0, height: expanded ? inlineRectRef.current?.height ?? previewHeight + 36 : undefined }}>
    <dialog ref={dialogRef} role={expanded ? "dialog" : "group"} aria-label={title || "HTML content"}
      onCancel={event => { event.preventDefault(); closeViewer(); }}
      style={{ display: "flex", flexDirection: "column", position: expanded ? "fixed" : "relative",
        inset: expanded ? 0 : "auto", width: expanded ? "100vw" : "100%", height: expanded ? "100dvh" : "auto",
        maxWidth: "none", maxHeight: "none", margin: 0, padding: 0, border: 0,
        transformOrigin: "top left", color: "inherit", background: expanded ? "var(--background, white)" : "transparent", overflow: "hidden" }}>
      <div style={{ display: ready ? "flex" : "none", flexShrink: 0, alignItems: "center", justifyContent: "flex-end", gap: 6, padding: expanded ? 12 : "0 0 6px", flexWrap: "wrap" }}>
        {expanded && <>
          <span style={{ marginRight: "auto", fontSize: 14 }}>{title || "HTML content"}</span>
          <button type="button" style={controlStyle} onClick={() => setZoom(null)}>Fit</button>
          <button type="button" style={controlStyle} onClick={() => setZoom(1)}>100%</button>
          <button type="button" style={controlStyle} aria-label="Zoom out" onClick={() => setZoom(Math.max(0.05, scale / 1.25))}>−</button>
          <output aria-label="Zoom level" style={{ fontSize: 12 }}>{Math.round(scale * 100)}%</output>
          <button type="button" style={controlStyle} aria-label="Zoom in" onClick={() => setZoom(Math.min(4, scale * 1.25))}>+</button>
        </>}
        <button ref={expandRef} type="button" style={controlStyle} aria-label={expanded ? "Close HTML viewer" : "Expand HTML content"}
          onClick={() => {
            if (expanded) { closeViewer(); return; }
            captureOrigin(dialogRef.current);
            setZoom(null);
            setExpanded(true);
          }}>{expanded ? "Close" : "Expand"}</button>
      </div>
      <div ref={areaRef} style={{ minHeight: 0, flex: expanded ? 1 : undefined, overflow: expanded ? "auto" : "hidden", height: expanded ? undefined : (width ? previewHeight : initialHeight) }}>
        <div style={{ position: "relative", width: width ? naturalWidth * scale : "100%", height: naturalHeight * scale, margin: "0 auto", overflow: "hidden" }}>
          <iframe ref={frameRef} title={title || "HTML content"} srcDoc={srcDoc}
            onLoad={() => frameRef.current?.contentWindow?.postMessage({ type: "docs-html-measure" }, "*")}
            sandbox="allow-scripts" referrerPolicy="no-referrer" loading="lazy" scrolling={ready && measured ? "no" : "auto"}
            style={{ display: "block", width: width ? naturalWidth : "100%", height: naturalHeight,
              maxWidth: "none", border: 0, transform: `scale(${scale})`, transformOrigin: "top left" }} />
        </div>
      </div>
    </dialog>
  </div>;
}

export const htmlDescriptor: DocBlockDescriptor = {
  type: "html", targetKind: "html", label: "HTML",
  agentDescription: "Self-contained HTML/CSS artifact. Props: html (max 1 MiB), title (required accessible label), height? (120–2000px; default 400), allowScripts? (default false). Fits interactive HTML within the document width and a 600px/70vh height cap. A separate Expand button opens Fit and zoom controls without resetting state. Height is the initial layout height and no-JavaScript fallback. No caption, frame border, or added content padding. Put any visible labels and captions inside html. Inline CSS and data: media work offline. Explicit scripts run only inside an opaque-origin sandbox; fetch, external subresources, nested frames, forms, popups, and parent access are blocked. No external or relative assets. Use code for displayed source examples. Insert/update through typed block operations.",
  patchOps: STRUCTURAL_OPS, layout: WIDE_LEFT_BLOCK_LAYOUT,
  render: (block, ctx) => el("div", { key: block.id, ...blockAttrs(block) }, createElement(HtmlBlock, {
    html: stringProp(block, "html") ?? "", title: stringProp(block, "title") ?? "HTML content",
    height: typeof block.props.height === "number" ? block.props.height : undefined,
    allowScripts: block.props.allowScripts === true,
  }), ctx.renderChildren(block)),
};
