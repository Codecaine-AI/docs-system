import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLinkIcon, Maximize2Icon, PencilIcon, XIcon } from "lucide-react";
import type { CanvasEmbedProps } from "@codecaine-ai/docs-viewer/client";
import {
  InteractiveCanvasViewer,
  syntheticInteractiveCanvas,
  validateInteractiveCanvasDocument,
  type InteractiveCanvasDocument,
} from "@codecaine-ai/canvas";

import { getCanvasBySrc } from "../data/api";

/**
 * Read-only standalone canvas embed, wired into DocBlockRenderer through
 * DocsClientProvider's `canvasEmbed` slot.
 *
 *  - `src` (docs-root-relative, already bundle-canonicalized by
 *    DocBlockRenderer) loads through the serve/export canvas data layer.
 *  - `canvasId === "synthetic"` uses the canvas package's bundled fixture.
 *  - loaded canvases render as inert inline previews (bare static viewer in a
 *    rounded border) that open an in-app full-screen viewer with real pan and
 *    zoom; annotation targeting keeps inline clicks live so canvas objects
 *    remain selectable.
 *  - any other `canvasId` has no docs-server backing board, so it renders an
 *    honest unavailable card with a link to Canvas Studio.
 *
 * No editing, no saving — this viewer is read-only by design.
 */
type StandaloneCanvasEmbedProps = CanvasEmbedProps & {
  /** Authoring-only action; read/annotate surfaces keep the embed view-only. */
  showEditAction?: boolean;
};

export function StandaloneCanvasEmbed({
  src,
  canvasId,
  id,
  title,
  view,
  onObjectSelect,
  showEditAction = false,
}: StandaloneCanvasEmbedProps) {
  const [document, setDocument] = useState<InteractiveCanvasDocument | null>(
    canvasId === "synthetic" && !src ? syntheticInteractiveCanvas : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const loadSeqRef = useRef(0);
  const studioOrigin =
    typeof __CANVAS_STUDIO_URL__ !== "undefined"
      ? __CANVAS_STUDIO_URL__
      : "http://localhost:3999";
  const studioUrl = new URL("/", studioOrigin);
  /** Deep link into Studio's editor for sidecar canvases; plain root otherwise. */
  const studioEditUrl = src
    ? `${studioUrl.toString()}?src=${encodeURIComponent(src)}`
    : studioUrl.toString();

  useEffect(() => {
    if (!src) return;
    const seq = ++loadSeqRef.current;
    const isCurrent = () => seq === loadSeqRef.current;
    setIsLoading(true);
    setError(null);
    void (async () => {
      try {
        const payload = await getCanvasBySrc(src);
        if (!isCurrent()) return;
        const validation = validateInteractiveCanvasDocument(payload.canvas);
        if (!validation.ok) {
          setError(validation.issues.map((issue) => issue.message).join("; "));
          return;
        }
        setDocument(validation.document);
      } catch (loadError) {
        if (!isCurrent()) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load canvas");
      } finally {
        if (isCurrent()) setIsLoading(false);
      }
    })();
  }, [src]);

  useEffect(() => {
    if (!viewerOpen) return;
    const previousOverflow = window.document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewerOpen(false);
    };
    window.document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [viewerOpen]);

  if (canvasId && canvasId !== "synthetic" && !src) {
    return (
      <section
        className="not-prose my-4 rounded-md border bg-background p-4 text-sm"
        data-docs-block-type="canvas"
        data-source-id={id}
        data-canvas-id={canvasId}
      >
        <div className="font-medium text-foreground">{title ?? canvasId}</div>
        <div className="mt-1 text-muted-foreground">
          This block references central board &quot;{canvasId}&quot;, which isn&apos;t stored in
          this docs repo — canvas embeds render from .canvas.json sidecars in the docs tree.
        </div>
        <a
          href={studioUrl.toString()}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-sm font-medium text-foreground hover:bg-muted"
        >
          <ExternalLinkIcon className="h-4 w-4" />
          Open Canvas Studio
        </a>
      </section>
    );
  }

  if (error) {
    return (
      <section
        className="not-prose my-4 rounded-md border bg-background p-4 text-sm"
        data-docs-block-type="canvas"
        data-source-id={id}
      >
        <div className="font-medium text-destructive">Canvas failed to load</div>
        <div className="mt-1 text-muted-foreground">{error}</div>
      </section>
    );
  }

  if (!document) {
    const detail = src
      ? isLoading
        ? "Loading canvas..."
        : "Canvas cannot load."
      : canvasId
        ? `Canvas "${canvasId}" could not load.`
        : "Canvas block is missing a src or canvasId.";
    return (
      <section
        className="not-prose my-4 rounded-md border bg-background p-4 text-sm text-muted-foreground"
        data-docs-block-type="canvas"
        data-source-id={id}
      >
        {detail}
      </section>
    );
  }

  const viewerDocument = { ...document, title: title ?? document.title };
  const viewerTitle = viewerDocument.title ?? viewerDocument.id;
  // Inline renders are always the bare static viewer inside this embed's
  // single rounded border — the viewer itself carries no framing. Annotation
  // targeting wires onObjectSelect so canvas objects stay selectable; the
  // inert path wraps the same render and adds the full-screen affordance.
  const inlineViewer = (
    <div className="not-prose my-4 overflow-hidden rounded-md border">
      <InteractiveCanvasViewer
        document={viewerDocument}
        view={view}
        onObjectSelect={onObjectSelect}
      />
    </div>
  );
  const fullscreenViewer =
    viewerOpen && typeof window.document !== "undefined"
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${viewerTitle} canvas viewer`}
            className="fixed inset-0 z-[100] flex flex-col bg-background"
          >
            <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background px-4">
              <div className="min-w-0">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Canvas viewer
                </div>
                <div className="truncate text-sm font-medium">{viewerTitle}</div>
              </div>
              <div className="flex items-center gap-2">
                {showEditAction ? (
                  <a
                    href={studioEditUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Edit in Canvas"
                    title="Edit in Canvas (opens in a new window)"
                    className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium text-foreground hover:bg-muted"
                  >
                    <PencilIcon className="h-4 w-4" />
                    Edit in Canvas
                  </a>
                ) : null}
                <button
                  type="button"
                  aria-label="Close canvas viewer"
                  title="Close"
                  onClick={() => setViewerOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border text-foreground hover:bg-muted"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            </header>
            <div className="min-h-0 flex-1 bg-muted/30 p-4">
              <InteractiveCanvasViewer
                document={viewerDocument}
                view={view}
                interactive
                onObjectSelect={onObjectSelect}
              />
            </div>
          </div>,
          window.document.body,
        )
      : null;

  return (
    <>
      <div
        className="group relative"
        data-docs-block-type="canvas"
        data-source-id={id}
        data-canvas-id={canvasId}
      >
        {onObjectSelect ? (
          inlineViewer
        ) : (
          <>
            <div inert aria-hidden="true" className="pointer-events-none">
              {inlineViewer}
            </div>
            <button
              type="button"
              aria-label={`Open ${viewerTitle} in full-screen viewer`}
              title="Open full-screen viewer"
              onClick={() => setViewerOpen(true)}
              className="absolute inset-0 z-10 cursor-zoom-in rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </>
        )}
        <div className="absolute right-2 top-6 z-20 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {showEditAction ? (
            <a
              href={studioEditUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Edit in Canvas"
              title="Edit in Canvas (opens in a new window)"
              className="inline-flex h-8 items-center gap-2 rounded-md border bg-background/90 px-2.5 text-sm font-medium text-foreground shadow-sm backdrop-blur hover:bg-muted"
            >
              <PencilIcon className="h-4 w-4" />
              Edit in Canvas
            </a>
          ) : null}
          <button
            type="button"
            aria-label="Open canvas viewer"
            title="Open full-screen viewer"
            onClick={() => setViewerOpen(true)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background/90 text-foreground shadow-sm backdrop-blur hover:bg-muted"
          >
            <Maximize2Icon className="h-4 w-4" />
          </button>
        </div>
      </div>
      {fullscreenViewer}
    </>
  );
}
