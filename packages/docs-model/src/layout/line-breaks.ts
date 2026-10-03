/**
 * Where Chromium may wrap ordinary text between two characters at
 * `overflow-wrap: normal`, for the characters documentation text uses.
 * Spaces are handled by the caller: Chromium breaks after every space. Layout lints use this to find a text's
 * widest unbreakable run, the narrowest a table column can get.
 *
 * This follows the Unicode line breaking rules (UAX #14) as Chromium 153
 * applies them, measured against its DOM (inline-measure.test.ts lists the
 * cases):
 *
 * - A hyphen breaks after itself when a letter or digit follows:
 *   `read-` `only`, `2026-` `10-` `03`, but not `x->y` or `--`.
 * - A slash never breaks: `and/or` and `@scope/pkg` stay whole.
 * - En and em dashes, `?` and `…` break between words, `!` and `|` do not.
 * - Not modeled: Chromium never breaks inside a ligature, so where Inter
 *   joins `->` into an arrow, `x->y` breaks before the hyphen, not after it.
 * - Closing brackets and sentence punctuation stick to the word before
 *   them, opening brackets and quotes to the word after.
 * - CJK and emoji break between characters.
 */

type LineBreakClass = "AL" | "NU" | "HY" | "BA" | "B2" | "EX" | "QM" | "IS" | "CL" | "OP" | "QU" | "GL" | "ZW" | "ID" | "PR" | "PO" | "IN";

const CLASS_BY_CHAR: Record<string, LineBreakClass> = {
  "-": "HY",
  "‐": "BA", "–": "BA", "­": "BA",
  "—": "B2",
  "!": "EX",
  "?": "QM",
  ",": "IS", ".": "IS", ":": "IS", ";": "IS",
  ")": "CL", "]": "CL", "}": "CL", "、": "CL", "。": "CL",
  "(": "OP", "[": "OP", "{": "OP",
  '"': "QU", "'": "QU", "‘": "QU", "’": "QU", "“": "QU", "”": "QU", "«": "QU", "»": "QU",
  " ": "GL", " ": "GL", "⁠": "GL", "﻿": "GL",
  "​": "ZW",
  "$": "PR", "+": "PR", "\\": "PR", "€": "PR", "£": "PR",
  "%": "PO", "‰": "PO", "°": "PO",
  "…": "IN",
};

const IDEOGRAPHIC = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꥠ-꥿가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\u{20000}-\u{3FFFD}]|\p{Extended_Pictographic}/u;
const LETTER_OR_DIGIT = /^[\p{L}\p{N}]/u;

/** The line breaking class of a grapheme cluster, by its first code point. */
function lineBreakClass(cluster: string): LineBreakClass {
  const first = String.fromCodePoint(cluster.codePointAt(0) ?? 0x20);
  const mapped = CLASS_BY_CHAR[first];
  if (mapped) return mapped;
  if (first >= "0" && first <= "9") return "NU";
  if (IDEOGRAPHIC.test(cluster)) return "ID";
  return "AL";
}

/** No break before these. After a space Chromium breaks anyway: `foo )` and `foo /bar` break at the space. */
const NO_BREAK_BEFORE = new Set<LineBreakClass>(["CL", "EX", "QM", "IS"]);

/** True when a line may break between `before` and `after`, two adjacent non-space grapheme clusters. */
export function breakBetween(before: string, after: string): boolean {
  const a = lineBreakClass(before);
  const b = lineBreakClass(after);
  if (a === "ZW") return true;
  if (b === "ZW" || a === "GL" || b === "GL") return false;
  if (NO_BREAK_BEFORE.has(b)) return false;
  if (a === "OP" || a === "QU" || b === "QU") return false;
  if (a === "B2" && b === "B2") return false;
  if (a === "B2" || b === "B2") return true;
  if (b === "BA" || b === "HY" || b === "IN") return false;
  if (a === "BA") return true;
  if (a === "HY") return LETTER_OR_DIGIT.test(after);
  if (a === "QM") return b === "AL" || b === "ID";
  if (a === "IN") return true;
  if (a === "ID" || b === "ID") return true;
  return false;
}
