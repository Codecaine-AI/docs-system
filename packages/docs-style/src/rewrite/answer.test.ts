import { expect, test } from "bun:test";
import type { RewriteRequest } from "../types";
import { createFakeRewriter, protectSpans, RewriteAnswerError } from "./index";

const { markdown, tokens } = protectSpans([
  { insert: "The sweep reads every page and runs " },
  { insert: "lintStyle", attributes: { code: true } },
  { insert: " on each block." },
]);
const request: RewriteRequest = { blockType: "paragraph", markdown, tokens, findings: [], flaggedSentences: [], context: {}, allowList: true };

/** The error a fake model answer raises, or undefined when the rewriter returns it. */
async function rejection(answer: string): Promise<unknown> {
  return createFakeRewriter(() => answer)
    .rewrite(request, "fast")
    .then(() => undefined, (error: unknown) => error);
}

test.each([
  ["an empty answer", "  ", /empty/],
  ["a literal backslash-n", "The sweep reads every page.\\nIt runs ⟦0⟧ on each block.", /literal \\n/],
  ["an echoed evidence placeholder", "The sweep reads every page and runs ⟦…⟧ on each block.", /⟦…⟧, which the token legend does not list/],
  ["a token number the legend lacks", "The sweep runs ⟦0⟧ and ⟦7⟧ on each block.", /⟦7⟧/],
  ["a broken token bracket", "The sweep reads every page and runs ⟦0 on each block.", /broken token bracket/],
  ["an array-shaped answer", '["The sweep reads every page.", "It runs ⟦0⟧ on each block."]', /JSON or an array/],
  ["a JSON-shaped answer", '{"markdown": "The sweep runs ⟦0⟧ on each block."}', /JSON or an array/],
  ["an answer cut off mid-word", "The sweep reads every page and runs ⟦0⟧ on each blo", /final punctuation/],
])("rejects %s", async (_, answer, reason) => {
  const error = await rejection(answer);

  expect(error).toBeInstanceOf(RewriteAnswerError);
  expect((error as RewriteAnswerError).reason).toMatch(reason);
});

test("returns a well-formed answer in paragraph or list form", async () => {
  expect(await rejection("The sweep reads every page. It runs ⟦0⟧ on each block.")).toBeUndefined();
  // Real line breaks, bullets, and a token with stray spaces are all well-formed.
  expect(await rejection("The sweep reads every page.\n- It runs ⟦ 0 ⟧ on each block.")).toBeUndefined();
});
