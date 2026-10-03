/**
 * The rewrite guardrails. A Tier 3 rewrite is staged only when it loses no content, adds no slop,
 * and means exactly what the original means (docs/10-system-design/10-doc-standards/
 * 85-style-enforcement, Rewrite Guardrails).
 *
 * verifyRewrite runs the twelve cheap checks, all of them, so a report shows every reason a rewrite
 * failed. Then the paid checks run in order of cost, each only when everything before it passed:
 * the Jev fact check, then the meaning verifier. Both gate: a rewrite that either could not check
 * is never accepted. Each check is also exported on its own, so a report can explain one result.
 */
import type { GuardrailId, GuardrailResult, Judge, Verdict, Verifier, VerifyInput } from "../types";
import { checkContentCoverage } from "./content-coverage";
import { checkFactCheck } from "./fact-check";
import { checkMeaningEquivalence } from "./meaning-equivalence";
import { checkFactLedger } from "./fact-ledger";
import { checkFixesTarget, checkNoNewFindings } from "./findings";
import { checkListIntegrity } from "./list-integrity";
import { checkMeaningWords } from "./meaning-words";
import { checkSentenceShape } from "./sentence-shape";
import { checkShrinkLimit } from "./shrink-limit";
import { checkSlop } from "./slop";
import { checkSmallestEdit } from "./smallest-edit";
import { checkSplitIntegrity } from "./split-integrity";

export { checkContentCoverage, CONTENT_COVERAGE_ALLOWED_MISSING } from "./content-coverage";
export { checkFactCheck, FACT_CHECK_QUESTION, FACT_CHECK_THRESHOLD } from "./fact-check";
export { checkFactLedger, factLedger, type Fact, type FactKind } from "./fact-ledger";
export { checkMeaningEquivalence, type MeaningInput } from "./meaning-equivalence";
export { checkFixesTarget, checkNoNewFindings } from "./findings";
export { checkListIntegrity } from "./list-integrity";
export { checkMeaningWords } from "./meaning-words";
export { checkSentenceShape } from "./sentence-shape";
export { checkShrinkLimit } from "./shrink-limit";
export { checkSlop } from "./slop";
export { checkSmallestEdit } from "./smallest-edit";
export { checkSplitIntegrity } from "./split-integrity";

/** "tokens": every protected token (code span, link, reference) came back exactly once. */
export function checkTokens(input: Pick<VerifyInput, "tokensOk" | "tokenProblems">): GuardrailResult {
  if (input.tokensOk) return { id: "tokens", ok: true, detail: "every protected token came back once" };
  return { id: "tokens", ok: false, detail: input.tokenProblems.join(", ") || "a protected token did not come back exactly once" };
}

/** The cheap checks, in GuardrailId order. */
const CHEAP_CHECKS: readonly ((input: VerifyInput) => GuardrailResult)[] = [
  checkTokens,
  checkFactLedger,
  checkContentCoverage,
  checkListIntegrity,
  checkSentenceShape,
  checkSplitIntegrity,
  checkMeaningWords,
  checkShrinkLimit,
  checkSmallestEdit,
  checkFixesTarget,
  checkNoNewFindings,
  checkSlop,
];

/** Skipped counts as ok. */
const passes = (check: GuardrailResult) => check.skipped === true || check.ok;

const notRun = (id: GuardrailId): GuardrailResult => ({ id, ok: true, skipped: true, detail: "not run: an earlier check failed" });

/**
 * Judge one rewrite of one block. accepted is true when every check that ran is ok. The fact check
 * fails without a Judge and the meaning check fails without a Verifier, so a run without either
 * accepts no rewrite.
 */
export async function verifyRewrite(input: VerifyInput, judge?: Judge, verifier?: Verifier): Promise<Verdict> {
  const checks = CHEAP_CHECKS.map((check) => check(input));
  checks.push(checks.every(passes) ? await checkFactCheck(input, judge) : notRun("fact-check"));
  checks.push(checks.every(passes) ? await checkMeaningEquivalence(input, verifier) : notRun("meaning-equivalence"));
  return { accepted: checks.every(passes), checks };
}

/**
 * Always false. A verdict used to accept a rewrite that Jev could not check and flag it for review.
 * The fact check now fails instead, so no accepted verdict needs review. Kept for callers.
 * @deprecated
 */
export const needsReview = (_verdict: Verdict): boolean => false;
