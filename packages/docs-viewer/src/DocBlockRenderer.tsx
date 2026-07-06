"use client";

import { Fragment, useMemo, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import type { DeltaSpan, DocBlock, DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { DocFlavourRenderContext } from "./flavour-registry";
import { getDocFlavourDescriptor } from "./flavour-registry";
import { CanvasEmbedUnavailable, useCanvasEmbed } from "./client";
import { resolveBundleCanvasSrc } from "./bundle-src";

/**
 * M2 tracer read surface: walks a validated DocDocument from its root and
 * renders every block through the flavour registry (D28). The root block is
 * the page container — its own chrome is skipped, its children are the page.
 *
 * This sits BESIDE MdxDocumentRenderer (which stays untouched until the M2
 * migration flips docs to doc.json); both share the docs-blocks component
 * implementations via the flavour registry adapters.
 */
export interface DocBlockRendererProps {
  document: DocDocument;
  /** Wiring for the default (provider-injected) canvas embed rendering. */
  projectId?: string | null;
  documentPath?: string | null;
  /**
   * The bundle's docs-root-relative folder path (CP5 bundle-aware tree).
   * When set, bundle-relative canvas srcs (`./assets/...`) canonicalize via
   * `resolveBundleCanvasSrc` to root-relative form — served by
   * `/docs/canvas-by-src` from the bundle's OWN assets copy, which survives
   * twin retirement. The canonical form is also what `onCanvasObjectSelect`
   * reports as `canvasSrc`, so comment targets stay unambiguous across docs.
   */
  bundlePath?: string | null;
  /** Overrides canvas embedding (tests, previews). Defaults to the provider-injected `CanvasEmbedComponent`. */
  renderCanvas?: DocFlavourRenderContext["renderCanvas"];
  /**
   * Resolves `image`/`attachment` block `src` props to a fetchable URL
   * (e.g. via the `/docs/asset` GET route). Purely passed through to the
   * flavour registry's `ctx.resolveAssetSrc` — same philosophy as
   * `renderCanvas` above: this component owns no HTTP-fetching logic of its
   * own, it just wires whatever the host provides. Omit to keep existing
   * callers' raw-`src` behavior unchanged.
   */
  resolveAssetSrc?: DocFlavourRenderContext["resolveAssetSrc"];
  /**
   * Canvas-object selection for Plannotator targeting (M2 Checkpoint 5,
   * TG5.3): only wired into the DEFAULT injected-embed rendering (not
   * applied when `renderCanvas` is overridden, since the caller then owns
   * canvas embedding entirely). Called with the clicked object's id and the
   * embedding block's `src`, so the host can build a
   * `{ kind: "canvas-object", canvasSrc, objectId }` selection.
   */
  onCanvasObjectSelect?: (input: { canvasSrc: string; objectId: string }) => void;
  /**
   * Block selection for Plannotator targeting (M2 Checkpoint 5, TG5.3).
   * Every flavour descriptor's wrapper already carries `data-block-id`
   * (see flavour-registry.ts) — rather than adding a new DOM wrapper around
   * every block (risking layout regressions in adapted MDX block styling),
   * this uses event delegation: a single click listener on the root
   * container walks up to the nearest `[data-block-id]` ancestor, mirroring
   * DocsViewer's existing `resolveDocsTargetElement`/`closest(...)` pattern.
   * Only fires when `editable`/comment mode is enabled by the host — pass
   * this prop only when block-click-to-comment should be active.
   */
  onBlockSelect?: (input: { blockId: string; label?: string }) => void;
}

export type DocBlockSaveResult =
  | { ok: true }
  | { ok: false; stale: boolean; message: string };

function nearestBlockId(element: Element | null): string | null {
  const match = element?.closest("[data-block-id]");
  return match instanceof HTMLElement ? (match.dataset.blockId ?? null) : null;
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
      {content}
    </ReactMarkdown>
  );
}

/**
 * Delta spans -> inline React (mirrors MdxDocumentRenderer's inline markdown
 * approach, but over structured spans instead of a markdown string). Marks
 * nest deterministically: reference/link outermost, then bold/italic/strike,
 * code innermost.
 */
export function renderDeltaSpans(text: DeltaSpan[] | undefined): ReactNode {
  if (!text || text.length === 0) return null;
  return text.map((span, index) => {
    let node: ReactNode = span.insert;
    const attrs = span.attributes;
    if (attrs) {
      if (attrs.code) {
        node = (
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{node}</code>
        );
      }
      if (attrs.bold) node = <strong>{node}</strong>;
      if (attrs.italic) node = <em>{node}</em>;
      if (attrs.strike) node = <del>{node}</del>;
      if (attrs.link) {
        node = (
          <a
            href={attrs.link}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            {node}
          </a>
        );
      } else if (attrs.reference) {
        // Doc/code mention chip (D27) — inert in the tracer; deep-link
        // navigation arrives with the Plannotator/backlinks work.
        node = (
          <span
            data-spectre-ref="true"
            data-ref-kind={attrs.reference.kind}
            data-ref-path={attrs.reference.path}
            data-ref-symbol={attrs.reference.symbol}
            data-ref-section={attrs.reference.section}
            title={attrs.reference.path}
            className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/5 px-1 py-0.5 font-mono text-[0.85em] text-foreground"
          >
            {attrs.reference.label ?? node}
          </span>
        );
      }
    }
    return <Fragment key={index}>{node}</Fragment>;
  });
}

function UnknownFlavourBlock({ block }: { block: DocBlock }) {
  return (
    <section
      className="not-prose my-4 rounded-md border border-dashed bg-muted/30 p-3"
      data-doc-block="unknown"
      data-block-id={block.id}
    >
      <div className="font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Unknown block flavour: {block.flavour}
      </div>
    </section>
  );
}

export default function DocBlockRenderer({
  document,
  projectId,
  documentPath,
  bundlePath,
  renderCanvas,
  resolveAssetSrc,
  onCanvasObjectSelect,
  onBlockSelect,
}: DocBlockRendererProps) {
  // The default canvas embedding is the host-injected `CanvasEmbedComponent`
  // slot (DocsClientProvider's `canvasEmbed`) — in Spectre that's
  // CanvasSidecarEmbed; standalone viewers may omit it and get the neutral
  // "canvas embed unavailable" card instead.
  const CanvasEmbed = useCanvasEmbed();

  // Stable identity per prop set — a fresh fallback closure every render
  // would give every canvas block a new `renderCanvas` and defeat
  // descendant memoization.
  const renderCanvasEmbed = useMemo<DocFlavourRenderContext["renderCanvas"]>(
    () =>
      renderCanvas ??
      ((input) => {
        const canvasSrc = input.src ? resolveBundleCanvasSrc(bundlePath, input.src) : undefined;
        if (!CanvasEmbed) {
          return <CanvasEmbedUnavailable title={input.title} src={canvasSrc} />;
        }
        return (
          <CanvasEmbed
            projectId={projectId}
            documentPath={documentPath}
            id={input.id}
            canvasId={input.canvasId}
            src={canvasSrc}
            title={input.title}
            view={input.view}
            onObjectSelect={
              onCanvasObjectSelect && canvasSrc
                ? (objectId) => onCanvasObjectSelect({ canvasSrc, objectId })
                : undefined
            }
          />
        );
      }),
    [renderCanvas, bundlePath, projectId, documentPath, onCanvasObjectSelect, CanvasEmbed],
  );

  // One shared ctx + renderBlock pair per (document, canvas, asset) triple
  // instead of a fresh ctx object (with fresh renderChildren/renderText/
  // renderMarkdown closures) per block per render. `ctx.renderChildren` and
  // `renderBlock` are mutually recursive, so both are built inside a single
  // useMemo (the hoisted function declaration resolves the cycle).
  const renderBlock = useMemo(() => {
    const ctx: DocFlavourRenderContext = {
      renderText: renderDeltaSpans,
      renderChildren: (parent) => (
        <>{parent.children.map((childId) => renderBlock(childId))}</>
      ),
      renderMarkdown: (markdown) => <MarkdownContent content={markdown} />,
      renderCanvas: renderCanvasEmbed,
      resolveAssetSrc,
    };
    function renderBlock(blockId: string): ReactNode {
      const block = document.blocks[blockId];
      if (!block) return null;
      const descriptor = getDocFlavourDescriptor(block.flavour);
      if (!descriptor) return <UnknownFlavourBlock key={blockId} block={block} />;
      return <Fragment key={blockId}>{descriptor.render(block, ctx)}</Fragment>;
    }
    return renderBlock;
  }, [document, renderCanvasEmbed, resolveAssetSrc]);

  const root = document.blocks[document.root];
  if (!root) return null;

  const handleClick = onBlockSelect
    ? (event: ReactMouseEvent<HTMLDivElement>) => {
        if (!(event.target instanceof Element)) return;
        const blockId = nearestBlockId(event.target);
        if (!blockId) return;
        const block = document.blocks[blockId];
        if (!block) return;
        onBlockSelect({ blockId, label: `${block.flavour} block` });
      }
    : undefined;

  return (
    <div
      data-doc-id={document.id}
      data-doc-root={document.root}
      onClick={handleClick}
      className={onBlockSelect ? "cursor-pointer" : undefined}
    >
      {root.children.map((childId) => renderBlock(childId))}
    </div>
  );
}
