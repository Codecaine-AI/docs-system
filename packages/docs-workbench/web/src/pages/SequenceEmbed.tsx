import { useEffect, useRef, useState } from "react";
import { ExternalLinkIcon } from "lucide-react";
import type { SequenceEmbedProps } from "@codecaine-ai/docs-viewer/client";
import {
  SequenceViewer,
  validateSequenceDocument,
  type SequenceDocument,
} from "@codecaine-ai/sequence";

import { getSequenceBySrc } from "../data/api";

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
export function StandaloneSequenceEmbed({ src, sequenceId, id, title }: SequenceEmbedProps) {
  const [document, setDocument] = useState<SequenceDocument | null>(null);
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
  }, [src]);

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

  return (
    <section
      className="not-prose my-4 overflow-x-auto"
      data-docs-block-type="sequence"
      data-source-id={id}
    >
      <SequenceViewer document={{ ...document, title: title ?? document.title }} />
    </section>
  );
}
