/**
 * Edit the prose spans of a block's text and leave code, references, and links alone. Every
 * autofix goes through editPlainSpans, so a fix can never change a code span, a reference chip,
 * or a link.
 */
import type { DeltaSpan } from "@codecaine-ai/docs-model";

/** Where a span sits in its block's text. */
export interface SpanAt {
  /** True when no text comes before the span, so offset 0 starts the block. */
  first: boolean;
  /** The offset of the span in spanProse(spans). */
  start: number;
}

/** True for a span with no code, reference, or link attribute: the only spans a fix may edit. */
export function isPlainSpan(span: DeltaSpan): boolean {
  const attributes = span.attributes;
  return !attributes?.code && !attributes?.reference && !attributes?.link;
}

/** True for a span that proseText collapses to one "\u0000". */
function isLiteral(span: DeltaSpan): boolean {
  return Boolean(span.attributes?.code || span.attributes?.reference);
}

/**
 * The block text in proseText form: each code or reference span is one "\u0000", and link text
 * stays. SpanAt.start counts offsets in this string. It equals proseText(spans) unless a plain
 * span holds a backtick pair, which proseText also masks.
 */
export function spanProse(spans: readonly DeltaSpan[]): string {
  return spans.map((span) => (isLiteral(span) ? "\u0000" : span.insert)).join("");
}

/** The [start, end) range of each plain span in spanProse(spans). A fix must fit in one range. */
export function plainRanges(spans: readonly DeltaSpan[]): [number, number][] {
  const ranges: [number, number][] = [];
  let offset = 0;
  for (const span of spans) {
    const length = isLiteral(span) ? 1 : span.insert.length;
    if (isPlainSpan(span)) ranges.push([offset, offset + length]);
    offset += length;
  }
  return ranges;
}

/**
 * Apply `edit` to the text of each plain span, keeping every attribute. Code, reference, and
 * link spans pass through unchanged. Returns undefined when nothing changes.
 *
 * After a deletion, the span is tidied: a double space the edit left becomes one space, a span
 * that starts a sentence loses the space a deletion left at its start, and a sentence that lost
 * its capitalized first word gets its new first word capitalized. So "Simply run X" with
 * "Simply " deleted becomes "Run X".
 */
export function editPlainSpans(
  spans: DeltaSpan[],
  edit: (text: string, at: SpanAt) => string,
): DeltaSpan[] | undefined {
  let offset = 0;
  let before = "";
  let changed = false;
  const out: DeltaSpan[] = [];
  for (const span of spans) {
    const start = offset;
    offset += isLiteral(span) ? 1 : span.insert.length;
    const sentenceStart = /^\s*$|[.!?]["'”’)\]]*\s*$/.test(before);
    before += span.insert;
    if (!isPlainSpan(span)) {
      out.push(span);
      continue;
    }
    const edited = edit(span.insert, { first: start === 0, start });
    if (edited === span.insert) {
      out.push(span);
      continue;
    }
    changed = true;
    const text = tidy(span.insert, edited, sentenceStart);
    if (text) out.push({ ...span, insert: text });
  }
  return changed ? out : undefined;
}

/** Clean up what a deletion leaves behind, comparing the edited text with the original. */
function tidy(original: string, edited: string, sentenceStart: boolean): string {
  let text = edited;
  if (!/ {2}/.test(original)) text = text.replace(/ {2,}/g, " ");
  if (!/ [,.;:!?]/.test(original)) text = text.replace(/ +([,.;:!?])/g, "$1");
  if (sentenceStart && !/^\s/.test(original)) text = text.trimStart();
  const was = firstLetters(original, sentenceStart);
  const now = firstLetters(text, sentenceStart);
  if (was.length !== now.length) return text;
  now.forEach((at, i) => {
    const letter = text.charAt(at);
    if (isUpper(original.charAt(was[i]!)) && letter !== letter.toUpperCase())
      text = text.slice(0, at) + letter.toUpperCase() + text.slice(at + 1);
  });
  return text;
}

/** The index of the first letter or digit of each sentence that starts in `text`. */
function firstLetters(text: string, sentenceStart: boolean): number[] {
  const starts: number[] = [];
  const boundary = /[.!?]["'”’)\]]*\s+/g;
  const firstWord = (from: number) => {
    const at = text.slice(from).search(/[\p{L}\p{N}]/u);
    if (at !== -1) starts.push(from + at);
  };
  if (sentenceStart) firstWord(0);
  for (const match of text.matchAll(boundary)) firstWord(match.index + match[0].length);
  return starts;
}

function isUpper(letter: string): boolean {
  return letter !== letter.toLowerCase() && letter === letter.toUpperCase();
}
