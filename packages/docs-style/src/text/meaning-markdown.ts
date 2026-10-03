/**
 * The meaning view of block text, for every check that compares a change's meaning: the Jev fact
 * check, the meaning verifier, and the autofix checks.
 * - Inline markdown that shows where each link and reference points. The docs projection
 *   (deltaToMarkdownInline) renders a reference as its label alone, so two references with one
 *   label that swap targets would read as no change at all.
 * - A change's blocks as a lead line plus "- " bullet lines, two spaces of indent per level below
 *   the first, so a fact moved to another level is visible.
 */
import { wrapMarkdownMarks, type DeltaSpan, type SpectreRef } from "@codecaine-ai/docs-model";

/** One block of a change: depth 0 is the lead (or the block itself), 1 a bullet, 2 a sub-bullet. */
export interface MeaningBlock {
  spans: readonly DeltaSpan[];
  depth: number;
}

/** A reference's target, such as "10-system-design/30-data-model#ops". A label is not part of it. */
export const referenceTarget = (ref: SpectreRef): string =>
  `${ref.path}${ref.section ? `#${ref.section}` : ""}${ref.symbol ? `#${ref.symbol}` : ""}${ref.line !== undefined ? `:${ref.line}` : ""}`;

/** One block's text as inline markdown: "[label](href)" for a link, "[label](ref:target)" for a reference. */
export function meaningInline(spans: readonly DeltaSpan[]): string {
  return spans
    .map(({ insert, attributes }) => {
      const { link, reference, ...marks } = attributes ?? {};
      const text = wrapMarkdownMarks(reference ? insert || reference.label || reference.path : insert, marks);
      if (reference) return `[${text}](ref:${referenceTarget(reference)})`;
      return link ? `[${text}](${link})` : text;
    })
    .join("")
    .trim();
}

/** A change's blocks as text: one line per block, a bullet as "- " and a sub-bullet as "  - ". */
export function meaningMarkdown(blocks: readonly MeaningBlock[]): string {
  return blocks
    .map(({ spans, depth }) => {
      const text = meaningInline(spans);
      return depth > 0 ? `${"  ".repeat(depth - 1)}- ${text}` : text;
    })
    .join("\n");
}
