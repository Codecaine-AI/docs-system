"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Code2Icon, GitBranchIcon } from "lucide-react";
import { Badge } from "../../ui/badge";
import { cn } from "../../ui/cn";
import {
  DocsMdxBlock,
  type DocsMdxParsedBlock,
} from "../base";

/**
 * Local copy of the shared `attr` helper (docs-blocks/attrs.ts is being
 * restored separately — keep this file decoupled from that landing).
 */
function attr(attrs: Record<string, string>, key: string): string | undefined {
  const value = attrs[key]?.trim();
  return value || undefined;
}

export type MermaidData = {
  id: string;
  title?: string;
  caption?: string;
  diagramType?: string;
  source: string;
};

/**
 * Mermaid requires globally-unique element ids for every render call, and the
 * same block can render (and re-render) many times. Combine the block id with
 * a module-level counter to guarantee uniqueness.
 */
let mermaidRenderSeq = 0;

/**
 * initialize() must run before the first render(), and re-run only when the
 * app theme flips (light <-> dark) so diagrams rendered after a toggle pick
 * up the matching mermaid theme. Tracks the last theme passed to initialize;
 * null means mermaid has never been initialized.
 */
let mermaidCurrentTheme: "neutral" | "dark" | null = null;

/**
 * Dark mode is a `.dark` class on the document root (see the workbench shell).
 * The class is toggled imperatively (outside React data flow), so subscribe to
 * it with a MutationObserver via useSyncExternalStore: diagrams re-render with
 * the matching mermaid theme when the app theme flips. SSR-safe: defaults to
 * light on the server snapshot.
 */
function isDarkTheme(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

function subscribeToRootClass(onChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function useIsDarkTheme(): boolean {
  return useSyncExternalStore(subscribeToRootClass, isDarkTheme, () => false);
}

function firstLine(message: string): string {
  return message.split("\n", 1)[0].trim();
}

/**
 * Mermaid injects a temporary element with the render id (and an error
 * placeholder prefixed with "d") into document.body; on parse failure it can
 * leave them behind. Sweep both so failed renders don't litter the document.
 */
function removeMermaidArtifacts(renderId: string) {
  if (typeof document === "undefined") return;
  document.getElementById(renderId)?.remove();
  document.getElementById(`d${renderId}`)?.remove();
}

export type MermaidDiagramProps = {
  /** Mermaid grammar to render. */
  source: string;
  /** Stable block id — seeds the unique element ids mermaid requires. */
  blockId: string;
};

/**
 * Client-side Mermaid renderer. The `mermaid` package is imported dynamically
 * inside the effect — never at module top level — so it stays out of SSR and
 * out of test import graphs. While loading (and on ANY failure: import error,
 * parse error) it falls back to showing the raw source in a <pre>, with a
 * one-line muted notice on error. It never throws and never leaves a rejected
 * promise unhandled.
 */
export function MermaidDiagram({ source, blockId }: MermaidDiagramProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dark = useIsDarkTheme();

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setError(null);

    const safeId = blockId.replace(/[^a-zA-Z0-9_-]/g, "-") || "block";
    const renderId = `docs-mermaid-${safeId}-${++mermaidRenderSeq}`;

    async function renderDiagram() {
      try {
        const { default: mermaid } = await import("mermaid");
        const desiredTheme = dark ? "dark" : "neutral";
        if (mermaidCurrentTheme !== desiredTheme) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: desiredTheme,
          });
          mermaidCurrentTheme = desiredTheme;
        }
        const rendered = await mermaid.render(renderId, source);
        if (!cancelled) setSvg(rendered.svg);
      } catch (err) {
        removeMermaidArtifacts(renderId);
        if (!cancelled) {
          setError(firstLine(err instanceof Error ? err.message : String(err)));
        }
      }
    }

    // renderDiagram catches everything internally; void the settled promise.
    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [source, blockId, dark]);

  if (svg) {
    return (
      <div
        className="overflow-auto bg-background p-3 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
        data-mermaid-rendered="true"
        // Mermaid runs with securityLevel "strict", which sanitizes the
        // generated SVG before it is handed back to us.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  return (
    <div data-mermaid-fallback={error ? "error" : "loading"}>
      {error && (
        <div className="border-b border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300">
          Mermaid render failed: {error}
        </div>
      )}
      <pre
        className={cn(
          "max-h-[360px] overflow-auto bg-background p-3 font-mono text-xs leading-relaxed",
          !error && "animate-pulse text-muted-foreground",
        )}
      >
        <code>{source}</code>
      </pre>
    </div>
  );
}

export class MermaidDocsBlock extends DocsMdxBlock<MermaidData> {
  readonly tag = "Mermaid";
  readonly type = "mermaid";
  readonly targetKind = "mermaid";
  readonly label = "Mermaid";
  readonly agentDescription =
    "A Mermaid diagram block. The body/source is Mermaid grammar; the viewer renders it to an SVG diagram client-side, falling back to the raw source while loading or when rendering fails.";

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<MermaidData> | null {
    const id = attr(attrs, "id");
    const sourceText = body.trim();
    if (!id || !sourceText) return null;
    return {
      tag: this.tag,
      type: this.type,
      targetKind: this.targetKind,
      sourceId: id,
      data: {
        id,
        title: attr(attrs, "title"),
        caption: attr(attrs, "caption"),
        diagramType: attr(attrs, "diagramType") ?? sourceText.split(/\s+/)[0],
        source: sourceText,
      },
    };
  }

  render(block: DocsMdxParsedBlock<MermaidData>) {
    const { data } = block;
    return (
      <section
        className="not-prose my-4 overflow-hidden rounded-md border bg-muted/20"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-teal-500/20 bg-teal-500/10 px-3 py-2 dark:border-teal-400/20 dark:bg-teal-400/10">
          <GitBranchIcon className="h-4 w-4 text-teal-600 dark:text-teal-400" />
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Mermaid
          </span>
          {data.title && <span className="text-sm font-medium">{data.title}</span>}
          {data.diagramType && (
            <Badge
              variant="outline"
              className="border-teal-500/40 bg-teal-500/10 text-teal-700 dark:border-teal-400/30 dark:bg-teal-400/10 dark:text-teal-300"
            >
              {data.diagramType}
            </Badge>
          )}
          <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
        </div>
        <MermaidDiagram source={data.source} blockId={data.id} />
        {data.caption && (
          <div className="border-t bg-background px-3 py-2 text-xs text-muted-foreground">
            <Code2Icon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
            {data.caption}
          </div>
        )}
      </section>
    );
  }
}
