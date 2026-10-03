import { describe, expect, test } from "bun:test";
import type { DeltaSpan } from "@codecaine-ai/docs-model";
import { checkFactLedger } from "./fact-ledger";
import { rewrite } from "./fixtures";

const ledger = (before: string, after: string | string[]) => checkFactLedger(rewrite(before, after));

describe("fact-ledger rejects a rewrite that loses a fact", () => {
  test.each([
    ["a number", "It bounds each request to 20 MiB and allows one render.", "It bounds each request and allows one render.", 'number "20 MiB"'],
    ["a unit", "Each column targets 220 px.", "Each column targets 220.", 'number "220 px"'],
    ["a version", "Docs System can release v0.0.2 today.", "Docs System can release today.", 'number "v0.0.2"'],
    ["a code span", "Run `docs style lint` first.", "Run the lint first.", 'code "docs style lint"'],
    ["a link target", "See [the guide](https://example.com/a).", "See [the guide](https://example.com/b).", 'link "https://example.com/a"'],
    ["a path", "Profiles live in src/profile/index.ts today.", "Profiles live in the profile folder today.", 'path "src/profile/index.ts"'],
    ["a file name", "Each bundle holds a doc.json file.", "Each bundle holds a document file.", 'path "doc.json"'],
    ["a glossary term", "A reviewer accepts the change set as one unit.", "A reviewer accepts the proposals as one unit.", 'term "change set"'],
    ["a name inside a sentence", "The rewrite runs on Luna and retries on Sol.", "The rewrite runs on a cheap model and retries on Sol.", 'name "Luna"'],
    ["the case of a name", "The panel uses the Global theme.", "The panel uses the global theme.", 'name "Global"'],
    ["an acronym that starts a sentence", "STE limits a sentence to 20 words.", "The profile limits a sentence to 20 words.", 'name "STE"'],
    ["a CamelCase identifier", "The sweep returns a BlockChange per block.", "The sweep returns a change per block.", 'name "BlockChange"'],
    ["a quoted string", 'Write "base" when that is the meaning.', "Write the plain word when that is the meaning.", 'quote "base"'],
  ])("%s", (_, before, after, missing) => {
    const result = ledger(before, after);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain(missing);
  });

  test("a changed reference target is a lost fact, a changed label is not", () => {
    const vocabulary = { kind: "doc" as const, path: "99-appendix/10-style-guide/40-vocabulary" };
    const before: DeltaSpan[] = [{ insert: "Read " }, { insert: "Vocabulary", attributes: { reference: vocabulary } }, { insert: " first." }];
    const relabeled: DeltaSpan[] = [{ insert: "Read " }, { insert: "the word list", attributes: { reference: vocabulary } }, { insert: " first." }];
    const retargeted: DeltaSpan[] = [{ insert: "Read " }, { insert: "Vocabulary", attributes: { reference: { kind: "doc", path: "99-appendix/10-style-guide/30-ste-profile" } } }, { insert: " first." }];
    expect(checkFactLedger({ beforeSpans: before, afterBlocks: [relabeled] }).ok).toBe(true);
    expect(checkFactLedger({ beforeSpans: before, afterBlocks: [retargeted] })).toEqual({
      id: "fact-ledger",
      ok: false,
      detail: 'missing reference "99-appendix/10-style-guide/40-vocabulary" | added: reference "99-appendix/10-style-guide/30-ste-profile"',
    });
  });

  test("an identifier with underscores is one name", () => {
    // Raw spans: inline markdown would read the underscores as italics.
    const result = checkFactLedger({
      beforeSpans: [{ insert: "The workspace defaults to CLAUDE_PROJECT_DIR." }],
      afterBlocks: [[{ insert: "The workspace uses CLAUDE_PROJECT_DIR by default." }]],
    });
    expect(result).toEqual({ id: "fact-ledger", ok: true, detail: "kept all 1 fact" });
  });

  test("the detail names the first three missing facts and counts the rest", () => {
    const result = ledger("The models Luna, Sol, Jev, and Mistral answer in 20 ms.", "The models answer fast.");
    expect(result.detail).toContain('number "20 ms", name "Luna", name "Sol", and 2 more');
    expect(result.detail).not.toContain("Jev");
  });
});

describe("fact-ledger rejects a rewrite that adds a literal, link, number, or quote", () => {
  test.each([
    ["a link", "Read the style guide first.", "Read [the style guide](https://example.com/style) first.", 'added: link "https://example.com/style"'],
    ["a code span", "Run the lint first.", "Run `docs style lint` first.", 'added: code "docs style lint"'],
    ["a number", "The sweep reads every page fast.", "The sweep reads every page in under 1 s.", 'added: number "1 s"'],
    ["a path", "Edit the profile.", "Edit src/profile/index.ts.", 'added: path "src/profile/index.ts"'],
    ["a quote", "Name the list in full.", 'Name the list in full, not "and so on".', 'added: quote "and so on"'],
  ])("%s", (_, before, after, detail) => {
    expect(ledger(before, after)).toEqual({ id: "fact-ledger", ok: false, detail });
  });

  test("a reference", () => {
    const after: DeltaSpan[] = [{ insert: "Read " }, { insert: "Vocabulary", attributes: { reference: { kind: "doc", path: "99-appendix/40-vocabulary" } } }, { insert: " first." }];
    expect(checkFactLedger({ beforeSpans: [{ insert: "Read the word list first." }], afterBlocks: [after] }).detail).toBe('added: reference "99-appendix/40-vocabulary"');
  });

  test("a new name or glossary term is not an addition", () => {
    expect(ledger("The sweep reads everything.", "The sweep reads every page that Jev judged.").ok).toBe(true);
  });
});

describe("fact-ledger accepts a rewrite that keeps every fact", () => {
  test.each([
    [
      "a split into a lead and bullets",
      "Decision: `render` and `grep` never write; backlink commands replace only derived SQLite state at 127.0.0.1:2455/v1.",
      ["Decision: The commands limit their writes.", "`render` and `grep` never write.", "Backlink commands replace only derived SQLite state at 127.0.0.1:2455/v1."],
    ],
    ["a new first word", "Each block keeps its id in the Global store.", "Every block keeps its id in the Global store."],
    ["a glossary term made plural", "A reviewer accepts the change set.", "Reviewers accept change sets."],
    ["a number written without its space", "The tooltip waits 450 ms.", "The tooltip waits 450ms."],
    ["a name that loses its possessive", "The cache keeps Jev's answers.", "The cache keeps the answers from Jev."],
    ["a number inside a kept code span", "Set `retries: 3` once.", "Set `retries: 3` one time."],
    ["a label colon folded into the sentence", "Why: Open-ended folder acceptance was rejected.", "We rejected open-ended folder acceptance."],
    ["a unit after a number, which is not also a name", "Each request is capped at 20 MiB.", "The cap for each request is 20MiB."],
  ])("%s", (_, before, after) => {
    const result = ledger(before, after);
    expect(result.detail).not.toStartWith("missing");
    expect(result.ok).toBe(true);
  });
});
