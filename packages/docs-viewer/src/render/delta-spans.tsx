"use client";

import { Fragment, type ReactNode } from "react";
import type { DeltaSpan } from "@codecaine-ai/docs-model/doc-schema";
import { INLINE_CODE_CLASSES } from "./block-classes";

/**
 * Delta spans -> inline React. Marks nest deterministically: reference/link
 * outermost, then bold/italic/strike, code innermost.
 *
 * Lives in its own module (not DocBlockRenderer.tsx, which re-exports it for
 * compatibility) so block components that render inline spans OUTSIDE the
 * registry's `ctx.renderText` path — structured-table cells — can import it
 * without creating a DocBlockRenderer -> block-registry -> descriptor ->
 * component -> DocBlockRenderer import cycle.
 */
export function renderDeltaSpans(text: DeltaSpan[] | undefined): ReactNode {
  if (!text || text.length === 0) return null;
  return text.map((span, index) => {
    let node: ReactNode = span.insert;
    const attrs = span.attributes;
    if (attrs) {
      if (attrs.code) {
        node = (
          <code className={INLINE_CODE_CLASSES}>{node}</code>
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
            className="inline-flex items-baseline gap-1 rounded-sm border border-primary/30 bg-primary/5 px-1 py-0.5 font-mono text-[0.85em] text-foreground"
          >
            {attrs.reference.label ?? node}
          </span>
        );
      }
    }
    return <Fragment key={index}>{node}</Fragment>;
  });
}
