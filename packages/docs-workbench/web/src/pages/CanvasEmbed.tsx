import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2Icon, PencilIcon, XIcon } from "lucide-react";
import type { CanvasEmbedProps } from "@codecaine-ai/docs-viewer/client";
import {
  InteractiveCanvasViewer,
  syntheticInteractiveCanvas,
  validateInteractiveCanvasDocument,
  type InteractiveCanvasDocument,
} from "@codecaine-ai/canvas";

import { getCanvasBySrc } from "../data/api";

/**
 * Read-only standalone counterpart of Spectre's CanvasSidecarEmbed, wired
 * into DocBlockRenderer through DocsClientProvider's `canvasEmbed` slot.
 *
 *  - `src` (docs-root-relative, already bundle-canonicalized by
 *    DocBlockRenderer) loads through the serve/export canvas data layer and
 *    renders with InteractiveCanvasViewer (view-cropping + object select
 *    supported).
 *  - `canvasId === "synthetic"` renders the canvas package's synthetic
 *    fixture — the same fallback Spectre uses without a project backend.
 *  - any other `canvasId` renders its section-cropped static preview inline;
 *    explicit expansion opens Canvas Studio's interactive `/embed/:id`
 *    route full-screen while the source board remains editable in Studio.
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
    const studioOrigin =
      typeof __CANVAS_STUDIO_URL__ !== "undefined"
        ? __CANVAS_STUDIO_URL__
        : "http://localhost:3999";
    const embedUrl = new URL(`/embed/${encodeURIComponent(canvasId)}`, studioOrigin);
    const editorUrl = new URL(`/canvas/${encodeURIComponent(canvasId)}`, studioOrigin);
    const previewUrl = new URL(
      `/api/canvases/${encodeURIComponent(canvasId)}/preview.svg`,
      studioOrigin,
    );
    if (view) embedUrl.searchParams.set("view", view);
    if (view) previewUrl.searchParams.set("section", view);
    // Section previews fit the member objects (no frame, tight padding) —
    // the docs page supplies its own framing (R2-D3/D4).
    if (view) previewUrl.searchParams.set("fit", "content");
    previewUrl.searchParams.set("w", "1280");

    const fullscreenViewer = viewerOpen && typeof window.document !== "undefined"
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${title ?? canvasId} canvas viewer`}
            className="fixed inset-0 z-[100] flex flex-col bg-background"
          >
            <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background px-4">
              <div className="min-w-0">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Canvas viewer
                </div>
                <div className="truncate text-sm font-medium">{title ?? canvasId}</div>
              </div>
              <div className="flex items-center gap-2">
                {showEditAction ? (
                  <a
                    href={editorUrl.toString()}
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
            <iframe
              src={embedUrl.toString()}
              title={`${title ?? canvasId} viewer`}
              sandbox="allow-same-origin allow-scripts"
              className="min-h-0 flex-1 border-0 bg-[#F5F5F5]"
            />
          </div>,
          window.document.body,
        )
      : null;

    return (
      <>
        <section
          className="group relative not-prose my-4 overflow-hidden rounded-md border bg-background"
          data-docs-block-type="canvas"
          data-source-id={id}
          data-canvas-id={canvasId}
        >
          <img
            src={previewUrl.toString()}
            alt={title ?? `Canvas ${canvasId}`}
            draggable={false}
            className="block h-auto w-full select-none"
          />
          <div className="absolute right-2 top-2 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {showEditAction ? (
              <a
                href={editorUrl.toString()}
                target="_blank"
                rel="noreferrer"
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
        </section>
        {fullscreenViewer}
      </>
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

  return (
    <InteractiveCanvasViewer
      document={{ ...document, title: title ?? document.title }}
      view={view}
      onObjectSelect={onObjectSelect}
    />
  );
}
