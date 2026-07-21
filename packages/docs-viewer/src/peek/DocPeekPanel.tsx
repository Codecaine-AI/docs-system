"use client";

/**
 * Notion-style side peek: a right-docked push drawer previewing a referenced
 * doc read-only. Place it as a FLEX SIBLING of the main content column — it
 * is always mounted at `w-0` and animates its width open (same push-drawer
 * idiom as the workbench annotate pane: the content column reflows beside
 * it, never underneath it). Open width is host-tunable via the
 * `--docs-peek-width` CSS variable.
 *
 * The panel is fully self-managing: it listens on `document` for
 * `DOC_REFERENCE_NAVIGATE_EVENT` (peek intent opens/replaces, navigate
 * intent — and peeks in hosts without `DocsClient.getDocBundle` — forwards
 * to `onNavigate`), closes on Escape, and loads content through the
 * host-provided DocsClient. The host only supplies identity (`projectId`),
 * a full-navigation callback, and optional asset resolution.
 */

import { useMemo } from "react";
import { ExternalLinkIcon, XIcon } from "lucide-react";
import type { SpectreRef } from "@codecaine-ai/docs-model/spectre-ref";
import DocBlockRenderer, { type DocBlockRendererProps } from "../render/DocBlockRenderer";
import { DOC_SURFACE_TYPOGRAPHY_CLASSES } from "../render/block-classes";
import { resolveBundleAssetSrc } from "../render/bundle-src";
import { docTitleFromPath } from "../render/doc-title";
import { cn } from "../ui/cn";
import { useDocPeek } from "./use-doc-peek";

export type DocPeekPanelProps = {
  projectId: string;
  /** Full navigation to a ref: Cmd/Ctrl-click, source refs, "Open in full", downgraded peeks. */
  onNavigate: (ref: SpectreRef) => void;
  /**
   * Host asset resolver for `image`/`video` block srcs — a plain
   * `(src) => string` with no bundle awareness required: the panel
   * canonicalizes the peeked doc's bundle-relative `./assets/...` srcs to
   * docs-root-relative form before calling it.
   */
  resolveAssetSrc?: DocBlockRendererProps["resolveAssetSrc"];
};

const OPEN_WIDTH_CLASS = "w-[var(--docs-peek-width,min(48rem,45vw))]";

export function DocPeekPanel({ projectId, onNavigate, resolveAssetSrc }: DocPeekPanelProps) {
  const { state, close } = useDocPeek({ projectId, onNavigate });

  // Hosts pass a PLAIN resolver with no bundle context (the block registry
  // calls it with the raw block src), so a peeked doc's bundle-relative
  // `./assets/...` srcs would reach the host uncanonicalized and 404. Wrap
  // the resolver to canonicalize against the peeked ref's bundle path first;
  // docs-root-relative srcs pass through `resolveBundleAssetSrc` unchanged.
  const peekedPath = state.open ? state.ref.path : null;
  const resolvePeekedAssetSrc = useMemo<DocBlockRendererProps["resolveAssetSrc"]>(() => {
    if (!resolveAssetSrc) return undefined;
    return (src: string) => resolveAssetSrc(resolveBundleAssetSrc(peekedPath, src));
  }, [resolveAssetSrc, peekedPath]);

  const openInFull = () => {
    if (!state.open) return;
    onNavigate(state.ref);
    close();
  };

  return (
    <aside
      data-doc-peek-panel={state.open ? "" : undefined}
      aria-label="Doc preview"
      aria-hidden={!state.open}
      className={cn(
        // Divider + open/close transition are theme-driven: the workbench
        // StyleRail (or any host) tunes them via the --docs-peek-* variables.
        "shrink-0 overflow-hidden bg-background transition-[width] ease-in-out",
        "duration-[var(--docs-peek-duration,300ms)]",
        "[border-left-style:var(--docs-peek-divider-style,solid)] [border-left-width:var(--docs-peek-divider-width,1px)]",
        state.open
          ? cn(OPEN_WIDTH_CLASS, "[border-left-color:var(--docs-peek-divider-color,var(--border))]")
          : "w-0 border-l-transparent",
      )}
    >
      {state.open && (
        <div className={cn("flex h-full flex-col", OPEN_WIDTH_CLASS)}>
          {/* No title text here — the fixed page title renders in the doc
              column below, exactly like the main surface (icons-only
              header). The header's vertical metrics (h-11 + border-b)
              deliberately mirror the workbench DocPage toolbar
              (docs-workbench web/src/pages/DocPage.tsx: `flex h-11 ...
              border-b px-3`) so, docked as a flex sibling of the doc column,
              both bottom borders sit at the same y. */}
          <header className="flex h-11 shrink-0 items-center justify-between border-b px-3">
            <button
              type="button"
              onClick={close}
              aria-label="Close preview"
              title="Close preview"
              className="shrink-0 rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <XIcon aria-hidden className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={openInFull}
              aria-label="Open in full"
              title="Open in full"
              className="shrink-0 rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ExternalLinkIcon aria-hidden className="h-4 w-4" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Parity contract: same typography + vertical rhythm as the main
                doc surface — this column + the DOC_SURFACE_TYPOGRAPHY_CLASSES
                wrapper mirror the DocPage wrapper (docs-workbench
                web/src/pages/DocPage.tsx: `mx-auto w-full max-w-[var(
                --style-content-width,100ch)] px-[var(--style-content-margin,
                2rem)] pt-[var(--style-content-top,1.5rem)] pb-[var(
                --style-content-bottom,1.5rem)]` around the docs-markdown
                prose wrapper), so a peeked doc reads as a secondary document
                beside the main one. Horizontal padding is the ONLY
                peek-specific spacing: `--docs-peek-padding` replaces
                DocPage's `--style-content-margin`. Keep the rest in sync
                with DocPage. */}
            <div className="mx-auto w-full max-w-[var(--style-content-width,100ch)] px-[var(--docs-peek-padding,1.5rem)] pt-[var(--style-content-top,1.5rem)] pb-[var(--style-content-bottom,1.5rem)]">
              {/* Fixed page title, same furniture as the main doc surface
                  (DocPage's h1: class + margin come from the host-global
                  `.docs-page-title` rule) and the SAME derivation
                  (docTitleFromPath on the bundle path), so a peeked doc
                  opens with the identical title the full page shows.
                  Read-only here — no rename affordance in a preview. */}
              <h1 className="docs-page-title">{docTitleFromPath(state.ref.path)}</h1>
              {state.load.status === "loading" && (
                <div className="text-sm text-muted-foreground">Loading preview…</div>
              )}
              {state.load.status === "error" && (
                <div className="text-sm text-muted-foreground">{state.load.message}</div>
              )}
              {state.load.status === "loaded" && (
                <div className={DOC_SURFACE_TYPOGRAPHY_CLASSES}>
                  <DocBlockRenderer
                    document={state.load.document}
                    projectId={projectId}
                    documentPath={state.load.documentPath ?? null}
                    bundlePath={state.ref.path}
                    resolveAssetSrc={resolvePeekedAssetSrc}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

export default DocPeekPanel;
