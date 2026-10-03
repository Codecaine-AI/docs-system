/**
 * Smallest edit: the rewrite model may change only the sentences a finding names. Every other
 * sentence must come back as it was, so a rewrite cannot quietly "improve" text that had no
 * problem. A kept sentence may move into a bullet of a structural rewrite.
 *
 * Sentences compare with each code span and reference written as its own identity (see
 * literalSentences), so a rewrite that swaps two code spans in a kept sentence changes it.
 */
import type { GuardrailResult, VerifyInput } from "../types";
import { excerpt, literalSentences } from "./prose";

const normalize = (sentence: string) => sentence.replace(/\s+/g, " ").trim();
/** A sentence that moves into a bullet may change the case of its first letter, and nothing else. */
const comparable = (sentence: string) => normalize(sentence).replace(/\p{L}/u, (letter) => letter.toLowerCase());

/** "smallest-edit": every sentence without a finding comes back unchanged, unless a finding covers the whole block. */
export function checkSmallestEdit(
  input: Pick<VerifyInput, "beforeSpans" | "afterBlocks" | "flaggedSentences" | "wholeBlockFlagged">,
): GuardrailResult {
  if (input.wholeBlockFlagged) return { id: "smallest-edit", ok: true, skipped: true, detail: "skipped: a finding covers the whole block" };
  // Findings name their sentence in proseText form, so the flag test reads the bare form.
  const flagged = new Set(input.flaggedSentences.map(normalize));
  const unflagged = literalSentences(input.beforeSpans).filter(({ bare }) => !flagged.has(normalize(bare)));
  const kept = new Set(input.afterBlocks.flatMap((spans) => literalSentences(spans)).map(({ literal }) => comparable(literal)));
  const changed = unflagged.find(({ literal }) => !kept.has(comparable(literal)));
  if (changed) return { id: "smallest-edit", ok: false, detail: `changed "${excerpt(changed.display, 80)}"` };
  return { id: "smallest-edit", ok: true, detail: unflagged.length ? `kept ${unflagged.length} unflagged sentences` : "every sentence is flagged" };
}
