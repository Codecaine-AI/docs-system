"use client";

import { Fragment, type ReactNode } from "react";
import type { DeltaSpan } from "@codecaine-ai/docs-model/doc-schema";
import {
  DOC_REFERENCE_CLASSES,
  DOC_REFERENCE_LABEL_CLASSES,
  INLINE_CODE_CLASSES,
  INLINE_CODE_KIND_CLASSES,
  LINK_CLASSES,
  SOURCE_REFERENCE_CLASSES,
} from "./block-classes";
import { chipKind } from "../components/typed-chip";
import { chipBreaks } from "../components/mono-breaks";

/**
 * The class string and `data-chip-kind` for one inline code chip holding
 * `text` — shared by every renderer that emits a chip (delta spans here, the
 * markdown renderer's rehype pass), so a chip reads the same everywhere.
 */
export function inlineCodeChipProps(text: string): { className: string; "data-chip-kind": string } {
  const kind = chipKind(text);
  const kindClasses = INLINE_CODE_KIND_CLASSES[kind];
  return {
    className: kindClasses ? `${INLINE_CODE_CLASSES} ${kindClasses}` : INLINE_CODE_CLASSES,
    "data-chip-kind": kind,
  };
}

/**
 * Delta spans -> inline React. Marks nest deterministically: reference/link
 * outermost, then bold/italic/strike, code innermost.
 *
 * Lives in its own module (not DocBlockRenderer.tsx, which re-exports it for
 * compatibility) so block components that render inline spans OUTSIDE the
 * registry's `ctx.renderText` path — structured-table cells — can import it
 * without creating a DocBlockRenderer -> block-registry -> descriptor ->
 * component -> DocBlockRenderer import cycle.
 *
 * Inline marks are told apart by SHAPE, not color alone: code is a soft
 * neutral chip (its text colored by what it holds), an external link is
 * underlined, a doc reference is a sans link on a dotted underline, and a
 * source reference is a mono link on a hairline rule.
 */
export function renderDeltaSpans(text: DeltaSpan[] | undefined): ReactNode {
  if (!text || text.length === 0) return null;
  const spans = text.map((span) => ({ ...span }));
  // Punctuation next to a chip stays on the chip's line (see CHIP_GLUE_BEFORE and CHIP_GLUE_AFTER).
  // In reading order, so punctuation between two chips goes to one of them only.
  const glue = spans.map((span, index) => {
    if (!span.attributes?.code) return null;
    const prev = spans[index - 1];
    const next = spans[index + 1];
    // A reference span prints its label, not its insert, so slicing it would print the label twice. It never glues.
    const plain = (s: DeltaSpan | undefined): s is DeltaSpan => !!s && !s.attributes?.code && !s.attributes?.reference;
    const before = plain(prev) ? CHIP_GLUE_BEFORE.exec(prev.insert)?.[0] ?? "" : "";
    const after = plain(next) ? CHIP_GLUE_AFTER.exec(next.insert)?.[0] ?? "" : "";
    if (before) prev!.insert = prev!.insert.slice(0, -before.length);
    if (after) next!.insert = next!.insert.slice(after.length);
    return before || after ? { before, after, prev, next } : null;
  });
  return spans.map((span, index) => {
    const g = glue[index];
    if (!g) return <Fragment key={index}>{markedSpan(span)}</Fragment>;
    return (
      <span
        key={index}
        data-chip-glue="true"
        data-chip-glue-before={g.before ? "true" : undefined}
        data-chip-glue-after={g.after ? "true" : undefined}
        className="whitespace-nowrap"
      >
        {g.before && markedSpan({ ...g.prev!, insert: g.before })}
        {markedSpan(span)}
        {g.after && markedSpan({ ...g.next!, insert: g.after })}
      </span>
    );
  });
}

/**
 * Punctuation that a chip keeps on its own line. A prose chip is an inline-block that moves whole to the next
 * line (styles/rich-text.css), and a browser may break between an inline-block and the punctuation beside it.
 * The renderers wrap a chip, an opening bracket or quote right before it, and closing punctuation right after
 * it in one nowrap span, so a line never ends with "(" or starts with ". The".
 */
export const CHIP_GLUE_BEFORE = /[(\[{"'\u2018\u201c]+$/;
export const CHIP_GLUE_AFTER = /^[.,;:!?)\]}"'\u2019\u201d]+/;

/** One span with its marks applied, code innermost. */
function markedSpan(span: DeltaSpan): ReactNode {
  let node: ReactNode = span.insert;
  const attrs = span.attributes;
  if (attrs) {
    if (attrs.code) {
      // Pieces, so the chip never breaks mid-token (mono-breaks.tsx chipBreaks).
      node = <code {...inlineCodeChipProps(span.insert)}>{chipBreaks(span.insert)}</code>;
    }
    if (attrs.bold) node = <strong>{node}</strong>;
    if (attrs.italic) node = <em>{node}</em>;
    if (attrs.strike) node = <del>{node}</del>;
    if (attrs.link) {
      node = (
        <a href={attrs.link} target="_blank" rel="noreferrer" className={LINK_CLASSES}>
          {node}
        </a>
      );
    } else if (attrs.reference) {
      // Doc/code mention (D27) — inert in the tracer; deep-link
      // navigation arrives with the Plannotator/backlinks work.
      const isSource = attrs.reference.kind === "source";
      const label = attrs.reference.label ?? node;
      node = (
        <span
          data-spectre-ref="true"
          data-ref-kind={attrs.reference.kind}
          data-ref-path={attrs.reference.path}
          data-ref-symbol={attrs.reference.symbol}
          data-ref-section={attrs.reference.section}
          title={attrs.reference.path}
          className={isSource ? SOURCE_REFERENCE_CLASSES : DOC_REFERENCE_CLASSES}
        >
          {isSource ? label : <span className={DOC_REFERENCE_LABEL_CLASSES}>{label}</span>}
        </span>
      );
    }
  }
  return node;
}
