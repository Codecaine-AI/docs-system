import { expect, test } from "bun:test";
import { thresholds } from "../profile";
import { rewrite } from "./fixtures";
import { checkShrinkLimit } from "./shrink-limit";

test("a short passive turned active keeps its content words and passes", () => {
  const result = checkShrinkLimit(rewrite("The page is checked by the server.", "The server checks the page."));
  expect(result.ok).toBe(true);
  expect(result.detail).toContain("content words 3 -> 3 (0%), all words 7 -> 5");
});

test("a dropped clause still fails", () => {
  const result = checkShrinkLimit(rewrite("The server checks the page and writes a report to disk.", "The server checks the page."));
  expect(result.ok).toBe(false);
  expect(result.detail).toContain("content words 7 -> 3 (-57%)");
});

// An editor's rewrite of the cross-doc-linking intro: the paired dashes become parentheses.
const DASHED = "Docs link to docs with typed reference spans — tracked by the backlinks index, held at zero stale, rewritten when targets move — never with raw paths in prose.";
const BRACKETED = "Docs link to docs with typed reference spans (tracked by the backlinks index, held at zero stale, rewritten when targets move), never with raw paths in prose.";

test.each([
  ["a long aside", DASHED, BRACKETED, "content words 24 -> 24 (0%), all words 27 -> 27"],
  [
    "a list before a code span",
    "What the code itself carries — file headers, docstrings, inline comments — is `in-code-docs`'s subject.",
    "What the code itself carries (file headers, docstrings, inline comments) is `in-code-docs`'s subject.",
    "content words 12 -> 12 (0%), all words 14 -> 14",
  ],
])("an aside moved from dashes into parentheses keeps every word: %s", (_, before, after, counts) => {
  const result = checkShrinkLimit(rewrite(before, after));
  expect(result.ok).toBe(true);
  expect(result.detail).toContain(counts);
});

test("a dropped long parenthetical loses each content word it held and fails", () => {
  const result = checkShrinkLimit(rewrite(BRACKETED, "Docs link to docs with typed reference spans, never with raw paths in prose."));
  expect(result.ok).toBe(false);
  expect(result.detail).toContain("content words 24 -> 13 (-46%), all words 27 -> 14");
});

test("a number with its unit stays one word inside parentheses", () => {
  const result = checkShrinkLimit(rewrite("The timeout (20 ms) applies.", "The timeout applies."));
  expect(result.ok).toBe(false);
  expect(result.detail).toContain("content words 3 -> 2 (-33%), all words 4 -> 3");
});

// Ten content words and no stop words, so each prefix keeps as many content words as words.
const BEFORE = "Tier three rewrites only blocks still failing lint after autofix.";
const firstWords = (count: number) => BEFORE.split(" ").slice(0, count).join(" ");
/** The fewest content words a rewrite of BEFORE may keep under the profile's limit. */
const fewest = Math.ceil(10 * (1 - thresholds.shrinkLimit) - 1e-9);
const percent = (words: number) => `(${words > 10 ? "+" : ""}${Math.round((words - 10) * 10)}%)`;

test("a cut of exactly the limit passes, counted across the lead and its bullets", () => {
  const result = checkShrinkLimit(rewrite(BEFORE, [firstWords(fewest - 2), "Blocks fail."]));
  expect(result.ok).toBe(true);
  expect(result.detail).toContain(`content words 10 -> ${fewest} ${percent(fewest)}`);
});

test("a cut past the limit fails and gives the percentage", () => {
  const result = checkShrinkLimit(rewrite(BEFORE, firstWords(fewest - 1)));
  expect(result.ok).toBe(false);
  expect(result.detail).toContain(percent(fewest - 1));
});

test("growth from bullets passes", () => {
  const result = checkShrinkLimit(rewrite(BEFORE, ["Tier three rewrites only some blocks.", "It rewrites blocks still failing lint after autofix."]));
  expect(result.ok).toBe(true);
  expect(result.detail).toContain("(+30%)");
});

test("a vocabulary-only fix may shrink past the limit", () => {
  const result = checkShrinkLimit(rewrite(BEFORE, firstWords(5), { vocabularyOnly: true }));
  expect(result).toMatchObject({ ok: true, skipped: true });
  expect(result.detail).toContain("(-50%)");
});
