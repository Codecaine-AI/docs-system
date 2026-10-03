import { describe, expect, test } from "bun:test";
import { slopWords } from "../profile";
import { rewrite } from "./fixtures";
import { checkSlop } from "./slop";

const slop = (before: string, after: string | string[]) => checkSlop(rewrite(before, after));

describe("slop rejects a rewrite that adds filler marks", () => {
  test.each([
    ["a slop word", "Undo applies the inverse ops.", "Undo is a robust apply of the inverse ops.", '"robust" (+1)'],
    ["an inflected slop word", "Undo applies the inverse ops.", "Undo robustly applies the inverse ops.", '"robust" (+1)'],
    ["a capitalized slop word", "Sync keeps both copies.", "Seamless sync keeps both copies.", '"seamless" (+1)'],
    ["an em dash", "The rail saves edits.", "The rail saves edits — at once.", "em dash (+1)"],
    ["a double hyphen in place of an em dash", "The rail saves edits.", "The rail saves edits -- at once.", "em dash (+1)"],
    ["a semicolon", "The rail saves edits. The theme reloads.", "The rail saves edits; the theme reloads.", "semicolon (+1)"],
  ])("%s", (_, before, after, added) => {
    const result = slop(before, after);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain(added);
  });

  const phrase = slopWords.find((entry) => /\s/.test(entry.trim()));
  test.skipIf(!phrase)("a slop phrase, across a line break and in any case", () => {
    const [first = "", ...rest] = (phrase ?? "").split(" ");
    const result = slop("The rail saves edits.", `${first.toUpperCase()}\n${rest.join("  ")}: the rail saves edits.`);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain(`"${phrase}" (+1)`);
  });
});

test.skipIf(!slopWords.includes("seamlessly"))("a listed inflection is counted once, under its base word", () => {
  expect(slop("Sync keeps both copies.", "Sync seamlessly keeps both copies.").detail).toBe('added "seamless" (+1)');
});

describe("slop accepts a rewrite that adds none", () => {
  test.each([
    ["slop the author wrote, kept as is", "A robust sync — fast; small.", ["A robust sync — fast; small."]],
    ["slop removed", "A robust and seamless sync — fast.", "A sync that is fast."],
  ])("%s", (_, before, after) => {
    expect(slop(before, after)).toEqual({ id: "slop", ok: true, detail: expect.any(String) });
  });
});
