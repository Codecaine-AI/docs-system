import { activeBackend, measureWidth, uncoveredChars, type FontSpec } from "@codecaine-ai/text-measure";
import type { DeltaSpan } from "../doc-schema";
import { chipNeedsPieces, chipPieces } from "./chips";
import { breakBetween } from "./line-breaks";
import { DOCS_DEFAULT_FONTS, bolderWeight, codeFont } from "./metrics";

/**
 * Inline content measured the way the viewer paints it (docs-viewer
 * render/delta-spans.tsx): plain text, bold, italic, strike, links and code
 * chips, through @codecaine-ai/text-measure. Answers two questions about a
 * box: how wide the content is on one line, and how wide its widest run is
 * that the box cannot break, the narrowest the box can get before the text
 * overflows it.
 */

/**
 * How plain text may wrap. `nowrap`: never (`white-space: nowrap`).
 * `normal`: at spaces and the UAX #14 opportunities in line-breaks.ts.
 * `anywhere`: between any two characters (`overflow-wrap: anywhere`).
 */
export type WrapMode = "nowrap" | "normal" | "anywhere";

export interface InlineContext {
  /** The box's own font. */
  font: FontSpec;
  /** Inline code chips: their font size and their padding on each side, in px. */
  chip: { sizePx: number; padXPx: number };
  wrap: WrapMode;
  /** Inline elements other than code chips keep `white-space: nowrap` (print CSS in fit columns and identifier cells). */
  nowrapElements?: boolean;
  /**
   * Chip text without pieces wraps anywhere. Print CSS sets `overflow-wrap:
   * anywhere` on code outside any cascade layer, which beats the chip's own
   * `overflow-wrap: normal` utility. Pieces stay whole: each is a nowrap span.
   */
  chipWrapsAnywhere?: boolean;
}

/** A width and what it rests on. */
export interface MeasuredText {
  /** The text measured, collapsed the way the browser collapses it. */
  text: string;
  /** Width in px. */
  width: number;
  /** Width in px without the characters the bundled faces lack. */
  coveredWidth: number;
  /** Characters the bundled faces lack: the browser paints them with a fallback font, so their width is an estimate. */
  uncovered: string[];
  /** Exact backend, bundled faces at bundled weights, and nothing uncovered. */
  reliable: boolean;
}

export interface InlineLayout {
  /** The content on one line. */
  natural: MeasuredText;
  /** The widest run the box cannot break. Under `nowrap` only a code chip's `<wbr>` breaks. */
  widest: MeasuredText;
}

interface Glyph {
  text: string;
  /** Collapsible white space, already collapsed to one space. */
  space: boolean;
  font: FontSpec;
  /** The code chip this glyph belongs to, or -1. */
  chip: number;
  /** The nowrap run (a chip piece or a nowrap element) this glyph belongs to, or -1. */
  group: number;
  /** An explicit break opportunity (`<wbr>`) sits before this glyph. */
  wbrBefore: boolean;
  /** `overflow-wrap: anywhere` applies (source references). */
  anywhere: boolean;
}

const COLLAPSIBLE = /^[ \t\n\r\f]+$/;
const PRINTABLE_ASCII = /^[\x20-\x7E]*$/;
let segmenter: Intl.Segmenter | undefined;

function graphemes(text: string): string[] {
  if (PRINTABLE_ASCII.test(text)) return Array.from(text);
  segmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(segmenter.segment(text), (part) => part.segment);
}

const BUNDLED_WEIGHTS: Record<string, readonly number[]> = {
  [DOCS_DEFAULT_FONTS.sans.family]: [400, 500, 600, 700],
  [DOCS_DEFAULT_FONTS.code.family]: [400, 500, 600],
};

function bundledFont(font: FontSpec): boolean {
  return BUNDLED_WEIGHTS[font.family]?.includes(font.weight ?? 400) ?? false;
}

const spaceAdvances = new Map<string, number>();

/** The advance of one space in `font`. A no-break space has the same advance, and measureWidth keeps it. */
function spaceAdvance(font: FontSpec): number {
  const key = `${activeBackend().name} ${font.family} ${font.size} ${font.weight ?? 400}`;
  let advance = spaceAdvances.get(key);
  if (advance === undefined) {
    advance = measureWidth(" ", font);
    spaceAdvances.set(key, advance);
  }
  return advance;
}

/** Glyphs of the spans as the browser lays them out: white space collapsed across span boundaries and trimmed at both ends. */
function layoutGlyphs(spans: readonly DeltaSpan[], context: InlineContext): Glyph[] {
  const glyphs: Glyph[] = [];
  let chips = 0;
  let groups = 0;
  const push = (text: string, glyph: Omit<Glyph, "text" | "space">) => {
    for (const cluster of graphemes(text)) {
      const space = COLLAPSIBLE.test(cluster);
      if (space && (glyphs.length === 0 || glyphs[glyphs.length - 1]!.space)) continue;
      glyphs.push({ ...glyph, text: space ? " " : cluster, space, wbrBefore: glyph.wbrBefore && !space });
      glyph = { ...glyph, wbrBefore: false };
    }
  };
  const baseWeight = context.font.weight ?? 400;
  for (const span of spans) {
    const attributes = span.attributes ?? {};
    const weight = attributes.bold ? bolderWeight(baseWeight) : baseWeight;
    if (attributes.code) {
      const font = codeFont(context.chip.sizePx, weight);
      const chip = chips++;
      // A chip renders its text as plain text when no word in it can break, else as nowrap pieces with a <wbr> between two adjacent pieces.
      const plain = !chipNeedsPieces(span.insert);
      let previousWord = false;
      for (const piece of chipPieces(span.insert)) {
        if (/^\s+$/.test(piece)) {
          push(piece, { font, chip, group: -1, wbrBefore: false, anywhere: false });
          previousWord = false;
        } else {
          const group = plain && context.chipWrapsAnywhere ? -1 : groups++;
          push(piece, { font, chip, group, wbrBefore: previousWord && !plain, anywhere: false });
          previousWord = true;
        }
      }
      continue;
    }
    const reference = attributes.reference;
    const text = reference?.label ?? span.insert;
    const source = reference?.kind === "source";
    const font = source ? codeFont(context.font.size * 0.85, weight) : { ...context.font, weight };
    const element = Boolean(attributes.bold || attributes.italic || attributes.strike || attributes.link || reference);
    const group = element && context.nowrapElements ? groups++ : -1;
    push(text, { font, chip: -1, group, wbrBefore: false, anywhere: source });
  }
  while (glyphs.length > 0 && glyphs[glyphs.length - 1]!.space) glyphs.pop();
  return glyphs;
}

const sameFont = (a: FontSpec, b: FontSpec) => a.family === b.family && a.size === b.size && (a.weight ?? 400) === (b.weight ?? 400);

/**
 * The padding a range of glyphs carries for the chips it touches. A chip's
 * padding repeats on every line it spans (`box-decoration-break: clone`), so
 * each piece of a chip carries both sides. Chromium's min-content size adds
 * one more side to a chip's first piece when the chip breaks at a `<wbr>`
 * right after it, so that piece carries three (measured against its DOM).
 */
function chipPadding(glyphs: readonly Glyph[], start: number, end: number, padXPx: number): number {
  if (padXPx === 0) return 0;
  let sides = 0;
  const seen = new Set<number>();
  for (let index = start; index < end; index += 1) {
    const chip = glyphs[index]!.chip;
    if (chip < 0 || seen.has(chip)) continue;
    seen.add(chip);
    sides += 2;
    const opens = index === 0 || glyphs[index - 1]!.chip !== chip;
    const next = glyphs[end];
    if (opens && next !== undefined && next.chip === chip && next.wbrBefore) sides += 1;
  }
  return sides * padXPx;
}

const SOFT_HYPHEN = "\u00AD";

/**
 * Measures glyphs [start, end): each same-font run shaped as one line, plus
 * the padding of the chips the range touches. Only collapsible spaces sit at
 * a run's edges (no-break spaces are glyphs that keep their advance). When
 * `endsAtBreak` and the range ends in a soft hyphen, the line breaks there
 * and paints a hyphen, so the hyphen's advance counts.
 */
function measureRange(glyphs: readonly Glyph[], start: number, end: number, padXPx: number, endsAtBreak = false): MeasuredText {
  if (end <= start) return { text: "", width: 0, coveredWidth: 0, uncovered: [], reliable: activeBackend().exact };
  let width = 0;
  let coveredWidth = 0;
  let reliable = activeBackend().exact;
  const uncovered = new Set<string>();
  let text = "";
  let runStart = start;
  // A soft hyphen the line breaks at paints "-". One followed by a space is not where the line breaks.
  const hyphen = endsAtBreak && glyphs[end - 1]!.text === SOFT_HYPHEN && glyphs[end] !== undefined && !glyphs[end]!.space;
  const painted = (index: number) => (hyphen && index === end - 1 ? "-" : glyphs[index]!.text);
  for (let index = start; index <= end; index += 1) {
    const glyph = glyphs[index];
    if (index < end && sameFont(glyph!.font, glyphs[runStart]!.font)) continue;
    const font = glyphs[runStart]!.font;
    let run = "";
    for (let at = runStart; at < index; at += 1) run += painted(at);
    text += run;
    const core = run.replace(/^ +| +$/g, "");
    const edges = core ? run.length - core.length : run.length > 0 ? 1 : 0;
    const runWidth = (core ? measureWidth(core, font) : 0) + edges * spaceAdvance(font);
    width += runWidth;
    coveredWidth += runWidth;
    for (const cluster of uncoveredChars(core, font.family)) {
      uncovered.add(cluster);
      const count = core.split(cluster).length - 1;
      coveredWidth -= count * measureWidth(cluster, font);
    }
    if (!bundledFont(font)) reliable = false;
    runStart = index;
  }
  const padding = chipPadding(glyphs, start, end, padXPx);
  width += padding;
  coveredWidth += padding;
  return { text, width, coveredWidth: Math.max(0, coveredWidth), uncovered: [...uncovered], reliable: reliable && uncovered.size === 0 };
}

/**
 * The ranges [start, end) of glyphs that cannot break, with collapsible
 * spaces at their edges left out. A `<wbr>` breaks in every mode: Chromium
 * honors it even under `white-space: nowrap`, so a chip's pieces wrap in a
 * cell that never wraps its text.
 */
function unbreakableRanges(glyphs: readonly Glyph[], wrap: WrapMode): Array<[number, number]> {
  if (glyphs.length === 0) return [];
  const ranges: Array<[number, number]> = [];
  let start = 0;
  const close = (end: number) => {
    if (end > start) ranges.push([start, end]);
  };
  for (let index = 0; index < glyphs.length; index += 1) {
    const glyph = glyphs[index]!;
    const previous = glyphs[index - 1];
    const next = glyphs[index + 1];
    if (glyph.space) {
      if (wrap === "nowrap") continue;
      const insideGroup = previous !== undefined && next !== undefined && previous.group >= 0 && previous.group === next.group;
      if (insideGroup) continue;
      close(index);
      start = index + 1;
      continue;
    }
    if (previous === undefined || previous.space) continue;
    let breaks: boolean;
    if (previous.group >= 0 && previous.group === glyph.group) breaks = false;
    else if (glyph.wbrBefore) breaks = true;
    else if (wrap === "nowrap") breaks = false;
    else if (wrap === "anywhere" || (previous.anywhere && glyph.anywhere)) breaks = true;
    else breaks = breakBetween(previous.text, glyph.text);
    if (breaks) {
      close(index);
      start = index;
    }
  }
  close(glyphs.length);
  return ranges;
}

/** The spans of a cell or a plain string, measured in `context`. */
export function measureInline(content: string | readonly DeltaSpan[], context: InlineContext): InlineLayout {
  const spans = typeof content === "string" ? [{ insert: content }] : content;
  const glyphs = layoutGlyphs(spans, context);
  const natural = measureRange(glyphs, 0, glyphs.length, context.chip.padXPx);
  let widest: MeasuredText = { text: "", width: 0, coveredWidth: 0, uncovered: [], reliable: activeBackend().exact };
  for (const [start, end] of unbreakableRanges(glyphs, context.wrap)) {
    const measured = measureRange(glyphs, start, end, context.chip.padXPx, end < glyphs.length);
    if (measured.width > widest.width) widest = measured;
  }
  return { natural, widest };
}
