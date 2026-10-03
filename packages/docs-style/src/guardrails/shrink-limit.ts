/**
 * Shrink limit: concise means tighter words, not less content. A rewrite that cuts more than
 * thresholds.shrinkLimit of a block's content words has likely dropped information, so it fails
 * even when no other check can name what went missing.
 *
 * The limit counts content words, not all words, because information lives in content words.
 * "The page is checked by the server." (7 words) becomes "The server checks the page." (5 words):
 * a 29% cut in words, but the same 3 content words.
 */
import { thresholds } from "../profile";
import { steWordCount } from "../text";
import type { GuardrailResult, VerifyInput } from "../types";
import { afterProse, beforeProse, STOP_WORDS } from "./prose";

/**
 * The text with its parentheses taken out. steWordCount counts a parenthetical as one word, which
 * suits sentence length but not content: an aside the rewrite moves from dashes into parentheses
 * keeps every word, and an aside it drops loses every word.
 */
const unbracketed = (text: string) => text.replace(/[()]/g, " ");

/** Every word, each word of a parenthetical on its own. A code span and a number with its unit stay one word each. */
const wordCount = (text: string) => steWordCount(unbracketed(text));

/** Words minus stop words, inside parentheses too. */
function contentWordCount(text: string): number {
  const stops = unbracketed(text)
    .split(/\s+/)
    .filter((token) => STOP_WORDS.has(token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase())).length;
  return wordCount(text) - stops;
}

const sum = (texts: readonly string[], count: (text: string) => number) => texts.reduce((total, text) => total + count(text), 0);

/**
 * "shrink-limit": the rewrite keeps at least (1 - shrinkLimit) of the original content words.
 * Growth is always fine, because bullets add words. A vocabulary-only fix is exempt: deleting
 * filler and wordy phrases is meant to shrink the block.
 */
export function checkShrinkLimit(input: Pick<VerifyInput, "beforeSpans" | "afterBlocks" | "vocabularyOnly">): GuardrailResult {
  const before = [beforeProse(input)];
  const after = afterProse(input);
  const content = { before: sum(before, contentWordCount), after: sum(after, contentWordCount) };
  const change = content.before ? Math.round(((content.after - content.before) / content.before) * 100) : 0;
  const counts =
    `content words ${content.before} -> ${content.after} (${change > 0 ? "+" : ""}${change}%), ` +
    `all words ${sum(before, wordCount)} -> ${sum(after, wordCount)}`;
  if (input.vocabularyOnly) return { id: "shrink-limit", ok: true, skipped: true, detail: `skipped: vocabulary-only fix, ${counts}` };
  // The epsilon keeps a cut of exactly the limit on the passing side of floating-point error.
  const ok = content.after >= (1 - thresholds.shrinkLimit) * content.before - 1e-9;
  return { id: "shrink-limit", ok, detail: `${counts}, limit -${Math.round(thresholds.shrinkLimit * 100)}%` };
}
