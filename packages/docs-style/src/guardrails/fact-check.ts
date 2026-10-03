/**
 * Jev fact check: one yes/no question about the before-and-after pair. Code can count words and
 * find numbers, but it cannot tell that "at least 220 pixels" became "220 pixels", or that a new
 * sentence claims a benefit the author never stated. Jev reads both texts and answers P(true).
 */
import { meaningInline, meaningMarkdown } from "../text";
import type { GuardrailResult, Judge, VerifyInput } from "../types";
import { afterMeaningBlocks, type RewriteText } from "./prose";

/**
 * Calibrated on jev-1.13.0 with 29 before-and-after pairs from real pages, 15 faithful and 14
 * lossy, over three runs. The first sentence alone scored a faithful lead-plus-bullets split at
 * 0.49 to 0.61 and a dropped "only" at 0.38 to 0.41, so no threshold separated them. The yes and
 * no descriptions fixed both: faithful rewrites scored at most 0.30, and lossy ones at least 0.40.
 * Dropping a label colon is deliberately not named as allowed, because a label can carry context.
 */
export const FACT_CHECK_QUESTION =
  "Compared with `before`, does `after` drop or change any fact, number, name, condition, or limit, or add a claim, example, or detail that `before` does not state? " +
  "Answer yes when `after` loses or alters a fact, number, name, qualifier, condition, or limit from `before`, or states something `before` does not. " +
  "Answer no when only the wording or shape changed: split sentences, a short lead line that introduces bullets, active voice, or word order.";

/**
 * The fact check fails at or above this P(true): the middle of the calibration gap between the
 * highest faithful score (0.30) and the lowest lossy score (0.40). Err low. A false reject only
 * keeps the original block, while a miss stages a rewrite that lost a fact.
 */
export const FACT_CHECK_THRESHOLD = 0.35;

/** The key of the one question in each ask() call. */
const KEY = "fact-check";

/** What Jev reads: the original block, and the rewrite as a lead line plus "- " bullet lines. */
const factCheckState = (input: RewriteText & Pick<VerifyInput, "afterDepths">) => ({
  before: meaningInline(input.beforeSpans),
  after: meaningMarkdown(afterMeaningBlocks(input)),
});

const unavailable = (reason: string): GuardrailResult => ({ id: "fact-check", ok: false, detail: `fact check unavailable: ${reason}` });

/**
 * "fact-check": Jev says the rewrite drops or changes no fact and adds no claim. The check gates:
 * without a Judge, or when the Judge throws or gives no answer, it fails, so the original block
 * stays as it was. A rewrite nobody fact-checked must never land.
 */
export async function checkFactCheck(input: RewriteText & Pick<VerifyInput, "afterDepths">, judge?: Judge): Promise<GuardrailResult> {
  if (!judge) return unavailable("no judge");
  let p: number | undefined;
  try {
    p = (await judge.ask([{ key: KEY, question: FACT_CHECK_QUESTION, state: factCheckState(input) }])).get(KEY);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
  if (typeof p !== "number" || Number.isNaN(p)) return unavailable("Jev returned no answer");
  const ok = p < FACT_CHECK_THRESHOLD;
  return {
    id: "fact-check",
    ok,
    detail: `P(drops or adds content) ${p.toFixed(2)}, limit ${FACT_CHECK_THRESHOLD}${ok ? "" : ": Jev says the rewrite changes the facts"}`,
  };
}
