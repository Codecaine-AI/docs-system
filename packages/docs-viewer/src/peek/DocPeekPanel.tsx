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
 * intent — and peeks in hosts with no loader — forwards to `onNavigate`),
 * closes on Escape and on `DOC_PEEK_CLOSE_EVENT`, and loads content through
 * `loadPeek` or the host-provided DocsClient. A load that fails or returns
 * null closes the panel and forwards the ref to `onNavigate`. The host only
 * supplies identity (`projectId`), a full-navigation callback, and optional
 * loading, Escape ownership and asset resolution.
 */

import { useEffect, useMemo } from "react";
import { ExternalLinkIcon, XIcon } from "lucide-react";
import type { SpectreRef } from "@codecaine-ai/docs-model/spectre-ref";
import DocBlockRenderer, { type DocBlockRendererProps } from "../render/DocBlockRenderer";
import { DOC_SURFACE_TYPOGRAPHY_CLASSES } from "../render/block-classes";
import { resolveBundleAssetSrc } from "../render/bundle-src";
import { docPageTitle } from "../render/doc-title";
import { cn } from "../ui/cn";
import { PageTransition } from "../transitions/PageTransition";
import { useDocPeek } from "./use-doc-peek";
import type { DocBundle } from "./peek-state";

export type DocPeekPanelProps = {
  projectId: string;
  /** Full navigation to a ref: Cmd/Ctrl-click, source refs, "Open in full", downgraded peeks. */
  onNavigate: (ref: SpectreRef) => void;
  /** Reports visibility so a host can hide competing docked UI. */
  onOpenChange?: (open: boolean) => void;
  /**
   * Loads a peeked ref instead of `DocsClient.getDocBundle`, so a host can
   * peek refs outside `projectId`. Null or a rejection forwards the ref to
   * `onNavigate` and closes the panel.
   */
  loadPeek?: (ref: SpectreRef) => Promise<DocBundle | null>;
  /**
   * The host handles Escape. The panel adds no Escape listener, and the host
   * closes it by dispatching `DOC_PEEK_CLOSE_EVENT` on `document`.
   */
  hostOwnsEscape?: boolean;
  /**
   * Host asset resolver for `image`/`video` block srcs — a plain
   * `(src) => string` with no bundle awareness required: the panel
   * canonicalizes the peeked doc's bundle-relative `./assets/...` srcs to
   * docs-root-relative form before calling it.
   */
  resolveAssetSrc?: DocBlockRendererProps["resolveAssetSrc"];
  /**
   * "drawer" (default): a framed right drawer with a header bar for Close
   * and Open in full. "page": a second page column with no frame and no
   * header bar. A pinned row holds Open in full and Close at its top right
   * (data-doc-peek-controls), and below it the doc scrolls on its own, title
   * first with no top padding. The host gives the column its surface, place
   * and edge.
   */
  layout?: "drawer" | "page";
};

const OPEN_WIDTH_CLASS = "w-[var(--docs-peek-width,min(48rem,45vw))]";

export function DocPeekPanel({
  projectId,
  onNavigate,
  onOpenChange,
  loadPeek,
  hostOwnsEscape,
  resolveAssetSrc,
  layout = "drawer",
}: DocPeekPanelProps) {
  const { state, close } = useDocPeek({ projectId, onNavigate, loadPeek, hostOwnsEscape });

  useEffect(() => {
    onOpenChange?.(state.open);
  }, [onOpenChange, state.open]);

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

  const page = layout === "page";
  const buttonClass = "shrink-0 rounded-[var(--radius)] p-1 text-muted-foreground hover:bg-muted hover:text-foreground";
  const closeButton = (
    <button type="button" onClick={close} aria-label="Close preview" title="Close preview" className={buttonClass}>
      <XIcon aria-hidden className="h-4 w-4" />
    </button>
  );
  const openButton = (
    <button type="button" onClick={openInFull} aria-label="Open in full" title="Open in full" className={buttonClass}>
      <ExternalLinkIcon aria-hidden className="h-4 w-4" />
    </button>
  );
  const title = state.open
    ? docPageTitle(state.load.status === "loaded" ? state.load.document.title : undefined, state.ref.path)
    : "";

  return (
    <aside
      data-doc-peek-panel={state.open ? "" : undefined}
      data-doc-peek-layout={layout}
      aria-label="Doc preview"
      aria-hidden={!state.open}
      className={cn(
        "shrink-0 overflow-hidden transition-[width] ease-[var(--ds-motion-easing-emphasized)]",
        "duration-[var(--docs-peek-duration,300ms)]",
        // A page column has no frame: the host gives it the page's surface.
        page
          ? state.open ? OPEN_WIDTH_CLASS : "w-0"
          : cn(
              // Divider + open/close transition are theme-driven: the workbench
              // StyleRail (or any host) tunes them via the --docs-peek-* variables.
              "bg-background",
              // Style and width are arbitrary properties, as in divider.tsx: a
              // `border-l-[length:…]` utility would also set border-left-style, and the
              // style knob would then win only through Tailwind's utility order.
              "[border-left-style:var(--docs-peek-divider-style,solid)] [border-left-width:var(--docs-peek-divider-width,1px)]",
              state.open
                ? cn(OPEN_WIDTH_CLASS, "border-l-[color:var(--docs-peek-divider-color,var(--border))]")
                : "w-0 border-l-transparent",
            ),
      )}
    >
      {state.open && (
        <div className={cn("flex h-full flex-col", OPEN_WIDTH_CLASS)}>
          {/* Drawer: no title text in the header, the fixed page title renders
              in the doc column below, exactly like the main surface
              (icons-only header). The header's vertical metrics (h-11 +
              border-b) deliberately mirror the workbench DocPage toolbar
              (docs-workbench web/src/pages/DocPage.tsx: `flex h-11 ...
              border-b px-3`) so, docked as a flex sibling of the doc column,
              both bottom borders sit at the same y. A page column has no
              header bar, only the pinned row of its two buttons. */}
          {page ? (
            // Pinned above the column's own scroll, so Close and Open in full
            // stay in reach. The host sizes the row (--docs-peek-controls-height)
            // to line it up with its own top row.
            <div
              data-doc-peek-controls=""
              className="flex h-[var(--docs-peek-controls-height,2.75rem)] shrink-0 items-center justify-end gap-0.5 px-[var(--docs-peek-padding,1.5rem)]"
            >
              {openButton}
              {closeButton}
            </div>
          ) : (
            <header className="flex h-11 shrink-0 items-center justify-between border-b px-3">
              {closeButton}
              {openButton}
            </header>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Parity contract: same typography + vertical rhythm as the main
                doc surface — this column + the DOC_SURFACE_TYPOGRAPHY_CLASSES
                wrapper mirror the DocPage wrapper (docs-workbench
                web/src/pages/DocPage.tsx: `w-full px-[var(
                --style-content-margin,5.5rem)] pt-[var(--style-content-top,
                1.5rem)] pb-[var(--style-content-bottom,1.5rem)]` around the
                docs-markdown prose wrapper), so a peeked doc reads as a
                secondary document beside the main one. Like DocPage this is a
                left-anchored FULL-WIDTH page with no `mx-auto max-w-…`
                column: width is a per-block concern now (docs-viewer
                render/block-layout.ts), and the panel's own width is already
                the constraint here. Horizontal padding is the ONLY
                peek-specific spacing: `--docs-peek-padding` replaces
                DocPage's `--style-content-margin`. Keep the rest in sync
                with DocPage. A page column starts at its title (no top
                padding), so a host can line the title up with its own. */}
            <PageTransition pageKey={state.ref.path} ready={state.load.status !== "loading"}>
            <div className={cn("w-full px-[var(--docs-peek-padding,1.5rem)] pb-[var(--style-content-bottom,1.5rem)]", page ? "pt-0" : "pt-[var(--style-content-top,1.5rem)]")}>
              {/* Fixed page title, same furniture as the main doc surface
                  (DocPage's h1: class + margin come from the host-global
                  `.docs-page-title` rule) and the SAME derivation
                  (docPageTitle: doc.json's title), so a peeked doc
                  opens with the identical title the full page shows.
                  Read-only here — no rename affordance in a preview.
                  The body-font-size lane wrapper mirrors DocPage: it gives the
                  title the same text measure the prose gets, resolved at the
                  doc's base font size rather than the h1's own 2.25rem (the
                  measure is in `ch`). In a page column the host can give
                  the title its own page title's type through
                  data-doc-peek-title-row. */}
              {page ? (
                <div data-doc-peek-title-row="" className="w-full">
                  <h1 className="docs-page-title">{title}</h1>
                </div>
              ) : (
                <div className="w-full max-w-[var(--style-content-width,60ch)] text-[length:var(--style-font-size,18px)]">
                  <h1 className="docs-page-title">{title}</h1>
                </div>
              )}
              {state.load.status === "loading" && (
                <div className="text-[length:var(--ds-font-size-ui-lg)] text-muted-foreground">Loading preview…</div>
              )}
              {state.load.status === "error" && (
                <div className="text-[length:var(--ds-font-size-ui-lg)] text-muted-foreground">{state.load.message}</div>
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
            </PageTransition>
          </div>
        </div>
      )}
    </aside>
  );
}

export default DocPeekPanel;
