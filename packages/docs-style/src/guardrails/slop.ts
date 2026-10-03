/**
 * No new slop: a rewrite must not add the marks of model-written filler. It may keep any slop the
 * author wrote, because removing that is a vocabulary fix, not the job of this rewrite.
 */
import { slopWords } from "../profile";
import type { GuardrailResult } from "../types";
import { afterProse, beforeProse, countMatches, inflectedPattern, semicolonsIn, type RewriteText } from "./prose";

/** An inflected form counts as the slop word: "robustly" and "robustness" are "robust". */
const ENTRIES = [...new Set(slopWords.map((entry) => entry.trim().toLowerCase()))].map((phrase) => {
  const pattern = inflectedPattern(phrase, "giu");
  const whole = new RegExp(`^(?:${pattern.source})$`, "iu");
  return { phrase, label: `"${phrase}"`, pattern, inflects: (other: string) => whole.test(other) };
});
/** A listed inflection, such as "seamlessly" next to "seamless", is counted under its base entry only. */
const SLOP = ENTRIES.filter(({ phrase }) => !ENTRIES.some((other) => other.phrase !== phrase && other.inflects(phrase)));

/** An em dash, a spaced en dash, or a double hyphen written in place of an em dash. */
const DASH = /—|--|(?<=\s)–(?=\s)/g;

/** The count of each slop word or phrase, of em dashes, and of semicolons across texts. */
function slopCounts(texts: readonly string[]): Map<string, number> {
  const counts = new Map(SLOP.map(({ label, pattern }) => [label, countMatches(texts, pattern)]));
  counts.set("em dash", countMatches(texts, DASH));
  counts.set("semicolon", texts.reduce((sum, text) => sum + semicolonsIn(text), 0));
  return counts;
}

/** "slop": no slop word or phrase from the profile, em dash, or semicolon is more frequent after the rewrite. */
export function checkSlop(input: RewriteText): GuardrailResult {
  const before = slopCounts([beforeProse(input)]);
  const added = [...slopCounts(afterProse(input))].filter(([label, count]) => count > (before.get(label) ?? 0));
  if (added.length)
    return { id: "slop", ok: false, detail: `added ${added.map(([label, count]) => `${label} (+${count - (before.get(label) ?? 0)})`).join(", ")}` };
  return { id: "slop", ok: true, detail: "no slop words, em dashes, or semicolons added" };
}
