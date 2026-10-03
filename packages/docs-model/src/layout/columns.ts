import { CODE_METRICS } from "./metrics";

/**
 * Monospace column counting: how many character cells a line of code takes
 * in a code panel. This follows the terminal convention (wcwidth), counted
 * per grapheme cluster:
 *
 * - A tab advances to the next multiple of the tab size.
 * - East Asian Wide and Fullwidth characters take 2 columns.
 * - Emoji take 2 columns: emoji presentation, a VS16 emoji, a ZWJ sequence
 *   or a flag.
 * - Combining marks, control characters and default-ignorable characters
 *   (zero-width space, joiners, variation selectors) take 0 columns.
 *   Hangul fillers are the exception: the browser draws them.
 * - Everything else takes 1 column.
 *
 * A browser draws a CJK character 1em wide, about 1.6 columns of Fira Code,
 * so 2 columns overcounts CJK text and the tab stops after it. The terminal
 * convention keeps the count font-independent.
 */

/**
 * East Asian Wide (W) and Fullwidth (F) code points as inclusive
 * `[start, end]` pairs, merged and sorted. Source: Unicode
 * EastAsianWidth.txt, as packaged by get-east-asian-width 1.6.0 (MIT).
 */
const WIDE_RANGES: readonly number[] = [
  0x1100, 0x115F, 0x231A, 0x231B, 0x2329, 0x232A, 0x23E9, 0x23EC, 0x23F0, 0x23F0, 0x23F3, 0x23F3,
  0x25FD, 0x25FE, 0x2614, 0x2615, 0x2630, 0x2637, 0x2648, 0x2653, 0x267F, 0x267F, 0x268A, 0x268F,
  0x2693, 0x2693, 0x26A1, 0x26A1, 0x26AA, 0x26AB, 0x26BD, 0x26BE, 0x26C4, 0x26C5, 0x26CE, 0x26CE,
  0x26D4, 0x26D4, 0x26EA, 0x26EA, 0x26F2, 0x26F3, 0x26F5, 0x26F5, 0x26FA, 0x26FA, 0x26FD, 0x26FD,
  0x2705, 0x2705, 0x270A, 0x270B, 0x2728, 0x2728, 0x274C, 0x274C, 0x274E, 0x274E, 0x2753, 0x2755,
  0x2757, 0x2757, 0x2795, 0x2797, 0x27B0, 0x27B0, 0x27BF, 0x27BF, 0x2B1B, 0x2B1C, 0x2B50, 0x2B50,
  0x2B55, 0x2B55, 0x2E80, 0x2E99, 0x2E9B, 0x2EF3, 0x2F00, 0x2FD5, 0x2FF0, 0x303E, 0x3041, 0x3096,
  0x3099, 0x30FF, 0x3105, 0x312F, 0x3131, 0x318E, 0x3190, 0x31E5, 0x31EF, 0x321E, 0x3220, 0x3247,
  0x3250, 0xA48C, 0xA490, 0xA4C6, 0xA960, 0xA97C, 0xAC00, 0xD7A3, 0xF900, 0xFAFF, 0xFE10, 0xFE19,
  0xFE30, 0xFE52, 0xFE54, 0xFE66, 0xFE68, 0xFE6B, 0xFF01, 0xFF60, 0xFFE0, 0xFFE6, 0x16FE0, 0x16FE4,
  0x16FF0, 0x16FF6, 0x17000, 0x18CD5, 0x18CFF, 0x18D1E, 0x18D80, 0x18DF2, 0x1AFF0, 0x1AFF3, 0x1AFF5, 0x1AFFB,
  0x1AFFD, 0x1AFFE, 0x1B000, 0x1B122, 0x1B132, 0x1B132, 0x1B150, 0x1B152, 0x1B155, 0x1B155, 0x1B164, 0x1B167,
  0x1B170, 0x1B2FB, 0x1D300, 0x1D356, 0x1D360, 0x1D376, 0x1F004, 0x1F004, 0x1F0CF, 0x1F0CF, 0x1F18E, 0x1F18E,
  0x1F191, 0x1F19A, 0x1F200, 0x1F202, 0x1F210, 0x1F23B, 0x1F240, 0x1F248, 0x1F250, 0x1F251, 0x1F260, 0x1F265,
  0x1F300, 0x1F320, 0x1F32D, 0x1F335, 0x1F337, 0x1F37C, 0x1F37E, 0x1F393, 0x1F3A0, 0x1F3CA, 0x1F3CF, 0x1F3D3,
  0x1F3E0, 0x1F3F0, 0x1F3F4, 0x1F3F4, 0x1F3F8, 0x1F43E, 0x1F440, 0x1F440, 0x1F442, 0x1F4FC, 0x1F4FF, 0x1F53D,
  0x1F54B, 0x1F54E, 0x1F550, 0x1F567, 0x1F57A, 0x1F57A, 0x1F595, 0x1F596, 0x1F5A4, 0x1F5A4, 0x1F5FB, 0x1F64F,
  0x1F680, 0x1F6C5, 0x1F6CC, 0x1F6CC, 0x1F6D0, 0x1F6D2, 0x1F6D5, 0x1F6D8, 0x1F6DC, 0x1F6DF, 0x1F6EB, 0x1F6EC,
  0x1F6F4, 0x1F6FC, 0x1F7E0, 0x1F7EB, 0x1F7F0, 0x1F7F0, 0x1F90C, 0x1F93A, 0x1F93C, 0x1F945, 0x1F947, 0x1F9FF,
  0x1FA70, 0x1FA7C, 0x1FA80, 0x1FA8A, 0x1FA8E, 0x1FAC6, 0x1FAC8, 0x1FAC8, 0x1FACD, 0x1FADC, 0x1FADF, 0x1FAEA,
  0x1FAEF, 0x1FAF8, 0x20000, 0x2FFFD, 0x30000, 0x3FFFD,
];

/** True when the code point is East Asian Wide or Fullwidth. */
export function isEastAsianWide(codePoint: number): boolean {
  let low = 0;
  let high = WIDE_RANGES.length / 2 - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (codePoint < WIDE_RANGES[mid * 2]!) high = mid - 1;
    else if (codePoint > WIDE_RANGES[mid * 2 + 1]!) low = mid + 1;
    else return true;
  }
  return false;
}

/** A cluster that draws as an emoji: emoji presentation, a VS16 emoji, a ZWJ sequence or a flag. */
const EMOJI = /^(?:\p{Emoji_Presentation}|\p{Emoji}️|\p{Extended_Pictographic}[\s\S]*‍|\p{Regional_Indicator}{2})/u;
/** A cluster that starts with a mark, a control or a default-ignorable character draws nothing. */
const ZERO_WIDTH = /^[\p{M}\p{Cc}\p{Default_Ignorable_Code_Point}]/u;
/** Hangul fillers are default-ignorable, but Chromium's shaper still draws them with their advance. */
const HANGUL_FILLER = /^[ᅟᅠㅤﾠ]/u;
/** Printable ASCII: one column per character, no segmentation needed. */
const PRINTABLE_ASCII = /^[\x20-\x7E]*$/;

let segmenter: Intl.Segmenter | undefined;

/** The columns one grapheme cluster takes: 0, 1 or 2. Tabs are handled by monoColumns. */
export function graphemeColumns(cluster: string): number {
  const codePoint = cluster.codePointAt(0);
  if (codePoint === undefined) return 0;
  if (EMOJI.test(cluster)) return 2;
  if (ZERO_WIDTH.test(cluster) && !HANGUL_FILLER.test(cluster)) return 0;
  return isEastAsianWide(codePoint) ? 2 : 1;
}

/** The columns `line` takes in a monospace panel, with tabs expanded to `tabSize` stops. */
export function monoColumns(line: string, tabSize: number = CODE_METRICS.tabSize): number {
  if (PRINTABLE_ASCII.test(line)) return line.length;
  segmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let columns = 0;
  for (const { segment } of segmenter.segment(line)) {
    if (segment === "\t") columns += tabSize > 0 ? tabSize - (columns % tabSize) : 0;
    else columns += graphemeColumns(segment);
  }
  return columns;
}

/**
 * `line` as one paintable run for text-measure: each tab replaced by the
 * no-break spaces that reach its stop and each space by a no-break space, so
 * the measured width keeps every space a `white-space: pre` panel paints.
 */
export function codeLinePaintText(line: string, tabSize: number = CODE_METRICS.tabSize): string {
  if (PRINTABLE_ASCII.test(line)) return line.replaceAll(" ", "\u00A0");
  segmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let columns = 0;
  let out = "";
  for (const { segment } of segmenter.segment(line)) {
    if (segment === "\t") {
      const stop = tabSize > 0 ? tabSize - (columns % tabSize) : 0;
      out += "\u00A0".repeat(stop);
      columns += stop;
    } else {
      out += segment === " " ? "\u00A0" : segment;
      columns += graphemeColumns(segment);
    }
  }
  return out;
}
