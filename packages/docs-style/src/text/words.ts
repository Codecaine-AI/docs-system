/**
 * STE word counting (ASD-STE100 rules 8.4 to 8.7), on proseText output where each code or
 * reference span is one "\u0000" character.
 * - A code or reference span counts as one word.
 * - A number with its unit counts as one word ("20 ms", "5 GB", "10%").
 * - A parenthetical counts as one word.
 * - A hyphenated word counts as one word (whitespace splitting already does this).
 */
const UNITS = String.raw`(?:%|ms|s|sec|min|h|hr|KB|MB|GB|TB|kB|px|em|rem|pt|kg|g|mg|m|cm|mm|km|°C|°F|x)`;
const NUMBER_WITH_UNIT = new RegExp(String.raw`\b\d+(?:[.,]\d+)?\s*${UNITS}(?![\p{L}\d])`, "gu");
const PARENTHETICAL = /\([^()]*\)/g;

export function steWordCount(text: string): number {
  const normalized = text
    .replace(PARENTHETICAL, " \u0001 ")
    .replace(NUMBER_WITH_UNIT, " \u0001 ")
    .replace(/\u0000+/g, " \u0000 ");
  return normalized.split(/\s+/).filter((word) => /[\p{L}\p{N}\u0000\u0001]/u.test(word)).length;
}
