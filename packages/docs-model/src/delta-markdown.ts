"use client";

import type { DeltaSpan } from "./doc-schema";

/**
 * Shared delta <-> markdown-inline helpers (M2, D20/D26/D35).
 *
 * This module is deliberately dependency-light and pure: no React, no DOM,
 * safe to import from both the Next.js frontend and the Bun data-backend
 * (relative import — see project-markdown.ts header for why) and from the
 * standalone `docs render`/`docs grep` CLI (scripts/docs-cli).
 *
 * Two inline-markdown projections already exist in this codebase and they
 * are NOT duplicates of this one — they serve different consumers with
 * deliberately different semantics:
 *
 * - `block-registry.ts`'s `deltaToMarkdown` feeds MDX-adapter block bodies
 *   that get rendered back through `react-markdown` in the browser; it
 *   renders `reference` marks as markdown links (`[label](path)`) because a
 *   real link is useful there.
 * - `deltaToMarkdownInline` here feeds the runtime markdown *projection*
 *   used by the CLI/backend/grep surface (D20/D26). Per D35, reference marks
 *   render as **plain text** in v1 (label, falling back to the reference
 *   path) — no link syntax — because the projection is a greppable terminal
 *   artifact, not a rendered document; a bare bracket-and-paren pair would
 *   just be noise for `docs grep`.
 *
 * If a future checkpoint decides these two should converge, do it there —
 * don't silently reconcile them here and break the block-registry test
 * that locks its link-producing behavior.
 */

/**
 * Wraps a single span's text in the standard markdown mark syntax for
 * bold/italic/strike/code/link (nesting: code innermost, then bold/italic/
 * strike, link outermost of those). Shared by both projections below AND by
 * block-registry's `deltaToMarkdown` (M2 consolidation) — the `reference`
 * mark is deliberately NOT handled here since the two callers render it
 * differently (see module header); each caller applies its own reference
 * handling on top of this shared wrap.
 */
export function wrapMarkdownMarks(text: string, attrs: DeltaSpan["attributes"]): string {
  let out = text;
  if (!attrs) return out;
  if (attrs.code) out = `\`${out}\``;
  if (attrs.bold) out = `**${out}**`;
  if (attrs.italic) out = `*${out}*`;
  if (attrs.strike) out = `~~${out}~~`;
  if (attrs.link) out = `[${out}](${attrs.link})`;
  return out;
}

/**
 * Projects delta spans to inline markdown text for the runtime docs
 * projection (D20/D26/D35):
 * - bold/italic/strike/code/link marks render as standard markdown syntax
 *   (nesting order: code innermost, then bold/italic/strike, link outermost
 *   of those, matching DocBlockRenderer's inline React nesting).
 * - `reference` marks render PLAIN — the span's own text (which by the
 *   cross-doc-linking standard is the target doc's name), else the legacy
 *   label, else the reference path — no link syntax. This is a v1 scope
 *   decision (D35): the projection is meant to be grepped, and a bracketed
 *   pseudo-link to a repo-relative path is not clickable in a terminal.
 *   Inline marks (e.g. `code` on a source-path reference) still wrap the
 *   display text so a typed code link keeps its backticks.
 */
export function deltaToMarkdownInline(spans: DeltaSpan[] | undefined): string {
  if (!spans || spans.length === 0) return "";
  return spans
    .map((span) => {
      const attrs = span.attributes;
      if (attrs?.reference) {
        const display = span.insert || attrs.reference.label || attrs.reference.path;
        return wrapMarkdownMarks(display, attrs);
      }
      return wrapMarkdownMarks(span.insert, attrs);
    })
    .join("");
}

/** Plain-text projection of delta spans (no marks at all) — code blocks, alt text, grep-friendly fallbacks. */
export function deltaToPlainTextInline(spans: DeltaSpan[] | undefined): string {
  return (spans ?? []).map((span) => span.insert).join("");
}
