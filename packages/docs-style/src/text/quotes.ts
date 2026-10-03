/**
 * Quoted text is a mention, not a use: "Write 'the compiler checks the schema' instead of 'the
 * schema is checked'" shows the passive on purpose, and 'don't utilize the cache' names the word
 * it avoids. Every rule finds quotes with this one parser.
 *
 * - Double quotes pair in order, straight or curly.
 * - Single quotes pair the same way, but an apostrophe never opens or closes one. A mark between
 *   two letters is an apostrophe: "don't", "user’s".
 * - A single quote opens after a space or an opening bracket and closes before a space or
 *   punctuation, so the possessive in "the users' files" opens nothing.
 * - A quotation has no length limit and can cross formatting: the parser reads proseText, where
 *   bold, italic, and link text are plain text and each code span is one "\u0000".
 * - An opening mark with no closing mark quotes nothing.
 */

/** A letter, digit, or code span: the characters on both sides of an apostrophe. */
const WORD = /[\p{L}\p{N}\u0000]/u;
/** What can come before an opening single quote. */
const BEFORE_OPEN = /[\s(\[{"“—–-]/;
/** What can come after a closing single quote. */
const AFTER_CLOSE = /[\s.,;:!?)\]}"”—–-]/;

let cache: { text: string; ranges: [number, number][] } | undefined;

/** The [start, end) range of each quotation in `text`, quote marks included. */
export function quotedRanges(text: string): [number, number][] {
  if (cache?.text === text) return cache.ranges;
  const ranges: [number, number][] = [];
  let double = -1;
  let single = -1;
  for (let i = 0; i < text.length; i++) {
    const mark = text[i]!;
    const previous = text[i - 1] ?? " ";
    const next = text[i + 1] ?? " ";
    if (mark === '"' || mark === "“" || mark === "”") {
      if (double < 0 && mark !== "”") double = i;
      else if (double >= 0 && mark !== "“") {
        ranges.push([double, i + 1]);
        double = -1;
      }
    } else if (mark === "'" || mark === "‘" || mark === "’") {
      if (WORD.test(previous) && WORD.test(next)) continue;
      const opens = mark !== "’" && BEFORE_OPEN.test(previous) && !/\s/.test(next);
      const closes = mark !== "‘" && !/\s/.test(previous) && AFTER_CLOSE.test(next);
      if (single < 0 && opens) single = i;
      else if (single >= 0 && closes) {
        ranges.push([single, i + 1]);
        single = -1;
      }
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  cache = { text, ranges };
  return ranges;
}

/** True when `index` falls inside a quotation in `text`, between its marks. */
export function isQuoted(text: string, index: number): boolean {
  return quotedRanges(text).some(([start, end]) => index > start && index < end - 1);
}
