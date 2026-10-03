/**
 * Test fixtures for the guardrails. A rewrite is written as inline markdown, the way reports show
 * it, and every VerifyInput field a test does not set takes a value that passes its check.
 */
import { markdownToSpans } from "../text";
import type { Judge, JudgeQuestion, MeaningDifference, StyleFinding, Verifier, VerifyInput } from "../types";

/** One rewrite of one block. `after` is one block, or a lead block followed by bullet blocks. */
export function rewrite(before: string, after: string | readonly string[], fields: Partial<VerifyInput> = {}): VerifyInput {
  return {
    beforeSpans: markdownToSpans(before),
    afterBlocks: (typeof after === "string" ? [after] : after).map((block) => markdownToSpans(block)),
    tokensOk: true,
    tokenProblems: [],
    targetRuleIds: [],
    flaggedSentences: [],
    wholeBlockFlagged: true,
    findingsBefore: [],
    findingsAfter: [],
    vocabularyOnly: false,
    ...fields,
  };
}

export const finding = (ruleId: string, tier: 1 | 2 = 1): StyleFinding => ({
  ruleId,
  source: "ste",
  layer: "structure",
  tier,
  field: "text",
  message: `${ruleId} applies.`,
  evidence: "",
  hint: "",
});

/** A Judge that answers every question with `answer`, or throws it, and records what it was asked. */
export function recordingJudge(answer: number | Error | undefined): Judge & { asked: JudgeQuestion[] } {
  const asked: JudgeQuestion[] = [];
  return {
    asked,
    async ask(questions) {
      asked.push(...questions);
      if (answer instanceof Error) throw answer;
      return new Map(answer === undefined ? [] : questions.map((question) => [question.key, answer]));
    },
  };
}

/** A Verifier that answers every comparison with `answer` (same, or these differences), or throws it, and records what it was asked. */
export function recordingVerifier(answer: "same" | MeaningDifference[] | Error): Verifier & { compared: Parameters<Verifier["compare"]>[0][] } {
  const compared: Parameters<Verifier["compare"]>[0][] = [];
  return {
    compared,
    async compare(input) {
      compared.push(input);
      if (answer instanceof Error) throw answer;
      const differences = answer === "same" ? [] : answer;
      return { same: answer === "same", differences, model: "fake-verifier", ms: 0 };
    },
  };
}
