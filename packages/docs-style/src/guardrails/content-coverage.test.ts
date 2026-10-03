import { describe, expect, test } from "bun:test";
import { checkContentCoverage } from "./content-coverage";
import { rewrite } from "./fixtures";

const coverage = (before: string, after: string | string[]) => checkContentCoverage(rewrite(before, after));

describe("content-coverage rejects a rewrite that loses a content word", () => {
  test.each([
    // The hole Codex reproduced: a semicolon fix with whole-block scope dropped an unrelated sentence.
    ["an unrelated sentence a semicolon fix dropped", "The build runs; the tests follow. Retries work.", ["The build runs.", "The tests follow."], 'missing "Retries", "work"'],
    ["one adjective", "The sweep keeps a local cache.", "The sweep keeps a cache.", 'missing "local"'],
    ["a profile swap made without its replacement", "The tool utilizes a cache.", "The tool has a cache.", 'missing "utilizes"'],
    ["a number word", "A tag belongs to one repository.", "A tag belongs to a repository.", 'missing "one"'],
  ])("%s", (_, before, after, detail) => {
    expect(coverage(before, after)).toEqual({ id: "content-coverage", ok: false, detail });
  });

  test("the detail names the first three missing words and counts the rest", () => {
    expect(coverage("Fast retries keep stale caches warm.", "Retries run.").detail).toBe('missing "Fast", "keep", "stale", and 2 more');
  });
});

describe("content-coverage accepts a rewrite that keeps every content word", () => {
  test.each([
    ["a passive turned active", "The page is checked by the server.", "The server checks the page."],
    ["a split into a lead and bullets", "The build runs, so the tests follow and retries work.", ["The build runs.", "The tests follow.", "Retries work."]],
    ["a profile swap with its replacement", "The tool utilizes a cache.", "The tool uses a cache."],
    ["a naming swap", "The repository holds the docs.", "The repo holds the docs."],
    ["dropped filler", "It basically works.", "It works."],
    ["a word the profile lets a rewrite delete", "It just works.", "It works."],
    ["a noun turned into its verb", "Deletion of a block removes its children.", "Deleting a block removes its children."],
    ["an adjective participle turned into a verb", "The menu lists registered actions.", "The menu lists the actions that the registry registers."],
    ["a pronoun replaced by its noun", "The sweep stages them for review.", "The sweep stages the proposals for review."],
  ])("%s", (_, before, after) => {
    expect(coverage(before, after)).toEqual({ id: "content-coverage", ok: true, detail: "kept every content word" });
  });
});
