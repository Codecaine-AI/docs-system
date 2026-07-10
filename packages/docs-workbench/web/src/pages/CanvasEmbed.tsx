import { useEffect, useRef, useState } from "react";
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
 *  - any other `canvasId` is a Spectre-central canvas (database-backed);
 *    those cannot exist standalone, so a neutral card explains that.
 *
 * No editing, no saving — this viewer is read-only by design.
 */
export function StandaloneCanvasEmbed({ src, canvasId, id, title, view, onObjectSelect }: CanvasEmbedProps) {
  const [document, setDocument] = useState<InteractiveCanvasDocument | null>(
    canvasId === "synthetic" && !src ? syntheticInteractiveCanvas : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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
        ? `Canvas "${canvasId}" lives in a Spectre project database and is not available in the standalone viewer.`
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
