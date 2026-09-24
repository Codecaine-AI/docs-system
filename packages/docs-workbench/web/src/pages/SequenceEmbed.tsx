import { useCallback, useEffect, useRef, useState } from "react";
import { useViewerMotion } from "@codecaine-ai/docs-viewer/viewer-motion";
import { createPortal } from "react-dom";
import { ExternalLinkIcon, Maximize2Icon, XIcon } from "lucide-react";
import type { SequenceEmbedProps } from "@codecaine-ai/docs-viewer/client";
import {
  SequenceViewer,
  validateSequenceDocument,
  type SequenceDocument,
} from "@codecaine-ai/sequence";

import { getSequenceBySrc } from "../data/api";
import "./sequence-embed.css";

/**
 * Read-only standalone sequence embed, wired into DocBlockRenderer through
 * DocsClientProvider's `sequenceEmbed` slot — the sequence counterpart of
 * `StandaloneCanvasEmbed`.
 *
 *  - `src` (docs-root-relative, already bundle-canonicalized by
 *    DocBlockRenderer) loads through the serve/export sequence data layer,
 *    validates with `validateSequenceDocument`, and renders with the
 *    read-only SequenceViewer.
 *  - a `sequenceId` without a `src` references a diagram living in Sequence
 *    Studio. Unlike Canvas Studio, Sequence Studio exposes no preview/embed
 *    server endpoints, so instead of canvas's inline preview + iframe
 *    viewer this renders a plain "Open in Sequence Studio" affordance
 *    (build define `__SEQUENCE_STUDIO_URL__`, default http://localhost:3998).
 *
 * No editing, no saving — this viewer is read-only by design.
 */
type StandaloneSequenceEmbedProps = SequenceEmbedProps & {
  /** Static hosts reuse this UI without a workbench transport. */
  initialDocument?: SequenceDocument;
  initiallyOpen?: boolean;
  /** Published pages keep their existing preview outside this React root. */
  expansionSource?: HTMLElement;
  onViewerClose?: () => void;
};
export function StandaloneSequenceEmbed({ src, sequenceId, id, title, initialDocument, initiallyOpen = false, expansionSource, onViewerClose }: StandaloneSequenceEmbedProps) {
  const [document, setDocument] = useState<SequenceDocument | null>(initialDocument ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const loadSeqRef = useRef(0);
  const [viewerOpen, setViewerOpen] = useState(initiallyOpen);
  useEffect(() => { if (!viewerOpen) onViewerClose?.(); }, [viewerOpen, onViewerClose]);
  const [zoom, setZoom] = useState(1);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previewRef = useRef<HTMLButtonElement>(null);
  const { captureOrigin, animateOpen, animateClose, cancel } = useViewerMotion();
  const closeViewer = useCallback(() => {
    animateClose(dialogRef.current, expansionSource ?? previewRef.current, () => setViewerOpen(false));
  }, [animateClose, expansionSource]);

  useEffect(() => {
    if (!viewerOpen) return;
    const dialog = dialogRef.current;
    const previousOverflow = window.document.body.style.overflow;
    dialog?.showModal();
    if (expansionSource) captureOrigin(expansionSource);
    animateOpen(dialog);
    window.document.body.style.overflow = "hidden";
    return () => {
      cancel();
      dialog?.close();
      window.document.body.style.overflow = previousOverflow;
      (expansionSource ?? previewRef.current)?.focus();
    };
  }, [viewerOpen, animateOpen, cancel, captureOrigin, expansionSource]);

  useEffect(() => {
    if (initialDocument && !src) return;
    setViewerOpen(false);
    setDocument(null);
    if (!src) return;
    const seq = ++loadSeqRef.current;
    const isCurrent = () => seq === loadSeqRef.current;
    setIsLoading(true);
    setError(null);
    void (async () => {
      try {
        const payload = await getSequenceBySrc(src);
        if (!isCurrent()) return;
        const validation = validateSequenceDocument(payload.sequence);
        if (!validation.ok) {
          setError(validation.errors.join("; "));
          return;
        }
        setDocument(payload.sequence as SequenceDocument);
      } catch (loadError) {
        if (!isCurrent()) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load sequence");
      } finally {
        if (isCurrent()) setIsLoading(false);
      }
    })();
    return () => { loadSeqRef.current += 1; };
  }, [src, initialDocument]);

  if (sequenceId && !src) {
    const studioOrigin =
      typeof __SEQUENCE_STUDIO_URL__ !== "undefined"
        ? __SEQUENCE_STUDIO_URL__
        : "http://localhost:3998";
    const studioUrl = new URL("/", studioOrigin);

    return (
      <section
        className="not-prose my-4 flex items-center justify-between gap-3 rounded-md border border-[color:var(--docs-sequence-border,var(--border))] bg-background p-4 text-sm"
        data-docs-block-type="sequence"
        data-source-id={id}
        data-sequence-id={sequenceId}
      >
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Sequence diagram
          </div>
          <div className="truncate font-medium">{title ?? sequenceId}</div>
        </div>
        <a
          href={studioUrl.toString()}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border px-2.5 text-sm font-medium text-foreground hover:bg-muted"
        >
          <ExternalLinkIcon className="h-4 w-4" />
          Open in Sequence Studio
        </a>
      </section>
    );
  }

  if (error) {
    return (
      <section
        className="not-prose my-4 rounded-md border border-[color:var(--docs-sequence-border,var(--border))] bg-background p-4 text-sm"
        data-docs-block-type="sequence"
        data-source-id={id}
      >
        <div className="font-medium text-destructive">Sequence failed to load</div>
        <div className="mt-1 text-muted-foreground">{error}</div>
      </section>
    );
  }

  if (!document) {
    const detail = src
      ? isLoading
        ? "Loading sequence..."
        : "Sequence cannot load."
      : "Sequence block is missing a src or sequenceId.";
    return (
      <section
        className="not-prose my-4 rounded-md border border-[color:var(--docs-sequence-border,var(--border))] bg-background p-4 text-sm text-muted-foreground"
        data-docs-block-type="sequence"
        data-source-id={id}
      >
        {detail}
      </section>
    );
  }

  const viewerDocument = { ...document, title: title ?? document.title };
  const viewerTitle = viewerDocument.title ?? "Sequence diagram";

  return (
    <>
      <section
        className="not-prose my-4 docs-sequence-preview"
        data-docs-block-type="sequence"
        data-source-id={id}
      >
        <button
          ref={previewRef}
          type="button"
          className="docs-sequence-preview-button"
          aria-label={`Open ${viewerTitle} in full-screen viewer`}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); captureOrigin(previewRef.current); setZoom(1); setViewerOpen(true); }}
        >
          <SequenceViewer document={viewerDocument} />
          <span className="docs-sequence-expand"><Maximize2Icon size={14} /> View larger</span>
        </button>
      </section>
      {viewerOpen && createPortal(
        <dialog
          ref={dialogRef}
          style={{ transformOrigin: "top left" }}
          className="docs-sequence-dialog not-prose bg-background text-foreground"
          aria-label={`${viewerTitle} sequence viewer`}
          onCancel={event => { event.preventDefault(); closeViewer(); }}
          onClose={() => setViewerOpen(false)}
        >
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b p-3">
            <div className="min-w-0 flex-1 truncate font-medium">{viewerTitle}</div>
            <div className="flex items-center gap-2">
              <button type="button" className="rounded border px-3 py-1 disabled:opacity-40" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - 0.5))}>−</button>
              <output className="w-12 text-center text-sm" aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
              <button type="button" className="rounded border px-3 py-1 disabled:opacity-40" aria-label="Zoom in" disabled={zoom >= 4} onClick={() => setZoom(value => Math.min(4, value + 0.5))}>+</button>
              <button type="button" className="rounded border px-3 py-1" onClick={() => setZoom(1)}>Fit</button>
              <button type="button" className="rounded border p-2" aria-label="Close sequence viewer" onClick={closeViewer}><XIcon size={18} /></button>
            </div>
          </header>
          <div className="docs-sequence-viewport" tabIndex={0} aria-label="Scrollable sequence diagram">
            <div className="docs-sequence-expanded" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
              <SequenceViewer document={viewerDocument} />
            </div>
          </div>
        </dialog>, window.document.body,
      )}
    </>
  );
}
