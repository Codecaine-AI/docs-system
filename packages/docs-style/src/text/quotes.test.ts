import { expect, test } from "bun:test";
import { isQuoted, quotedRanges } from "./quotes";

const quoted = (text: string) => quotedRanges(text).map(([start, end]) => text.slice(start, end));

test("an apostrophe never opens or closes a quote, so a quote can hold a contraction", () => {
  expect(quoted("Write 'don't utilize the cache.' as a bad example.")).toEqual(["'don't utilize the cache.'"]);
  expect(quoted("Write ‘don’t utilize it’ instead.")).toEqual(["‘don’t utilize it’"]);
  expect(quoted("The users' files and the user's cache are not quoted.")).toEqual([]);
});

test("quotes pair in order, nest, and have no length limit", () => {
  const long = `"${"word ".repeat(100)}end"`;
  expect(quoted(long)).toEqual([long]);
  expect(quoted('He said "use \'run\' here" and “stop”.')).toEqual(['"use \'run\' here"', "'run'", "“stop”"]);
  expect(quoted('An open "quote never closes.')).toEqual([]);
});

test("isQuoted is true only between the marks", () => {
  const text = 'Say "run" now.';
  expect([4, 5, 7, 8].map((i) => isQuoted(text, i))).toEqual([false, true, true, false]);
});
