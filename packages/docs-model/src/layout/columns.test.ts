import { expect, test } from "bun:test";
import { monoColumns } from "./columns";

test.each([
  ["printable ASCII counts one column per character", "const x = 1;", 4, 12],
  ["a tab advances to the next stop", "\tx", 4, 5],
  ["a tab after text fills only to its stop", "ab\tx", 4, 5],
  ["a tab already on a stop takes a full stop", "abcd\tx", 4, 9],
  ["the tab size sets the stop", "ab\tx", 8, 9],
  ["CJK ideographs take two columns", "日本語", 4, 6],
  ["Hangul syllables take two columns", "한글", 4, 4],
  ["fullwidth forms take two columns", "ＡＢ", 4, 4],
  ["halfwidth katakana take one column", "ｱｲ", 4, 2],
  ["a combining mark adds nothing", "é", 4, 1],
  ["an emoji takes two columns", "\u{1F600}", 4, 2],
  ["a ZWJ family sequence is one emoji", "\u{1F468}‍\u{1F469}‍\u{1F467}", 4, 2],
  ["a flag is one emoji", "\u{1F1FA}\u{1F1F8}", 4, 2],
  ["VS16 turns a text heart into an emoji", "❤️", 4, 2],
  ["a text-presentation heart stays one column", "❤", 4, 1],
  ["a keycap is one emoji", "1️⃣", 4, 2],
  ["zero-width space and joiners add nothing", "a​b⁠c", 4, 3],
  ["control characters add nothing", "x\u0007y", 4, 2],
  ["a Hangul filler still draws, wide", "ㅤ", 4, 2],
])("%s", (_name, line, tabSize, columns) => {
  expect(monoColumns(line, tabSize)).toBe(columns);
});

test("tab stops count wide characters as two columns", () => {
  // The two ideographs end on column 4, a stop, so the tab advances a full stop to column 8.
  expect(monoColumns("日本\tx", 4)).toBe(9);
});
