import { describe, expect, test } from "bun:test";
import type { GuardrailId, VerifyInput } from "../types";
import { finding, recordingJudge, recordingVerifier, rewrite } from "./fixtures";
import { needsReview, verifyRewrite } from "./index";

const ORDER: GuardrailId[] = [
  "tokens",
  "fact-ledger",
  "content-coverage",
  "list-integrity",
  "sentence-shape",
  "split-integrity",
  "meaning-words",
  "shrink-limit",
  "smallest-edit",
  "fixes-target",
  "no-new-findings",
  "slop",
  "fact-check",
  "meaning-equivalence",
];

const BEFORE = "Run `docs style lint` before 10 am; the sweep changes only the pages it reads.";
const SEMICOLON_FIX: Partial<VerifyInput> = { targetRuleIds: ["writing.semicolon"], findingsBefore: [finding("writing.semicolon")] };
/** A semicolon split that keeps every fact, fixes its target, and adds nothing. */
const GOOD = rewrite(BEFORE, ["Run `docs style lint` before 10 am.", "The sweep changes only the pages it reads."], SEMICOLON_FIX);
/** The same split, minus the time and the "only". */
const LOSSY = rewrite(BEFORE, ["Run `docs style lint` early in the day.", "The sweep changes the pages it reads."], SEMICOLON_FIX);

const failed = (checks: { id: GuardrailId; ok: boolean }[]) => checks.filter((check) => !check.ok).map((check) => check.id);
const NOT_RUN = { ok: true, skipped: true, detail: "not run: an earlier check failed" };

describe("verifyRewrite", () => {
  test("accepts a faithful rewrite after every check, Jev and then the meaning verifier last", async () => {
    const judge = recordingJudge(0.1);
    const verifier = recordingVerifier("same");
    const verdict = await verifyRewrite(GOOD, judge, verifier);
    expect(verdict.checks.map((check) => check.id)).toEqual(ORDER);
    expect(verdict.accepted).toBe(true);
    expect(judge.asked).toHaveLength(1);
    expect(verifier.compared).toHaveLength(1);
  });

  test("rejects when Jev says the rewrite changes the facts, and does not ask the verifier", async () => {
    const verifier = recordingVerifier("same");
    const verdict = await verifyRewrite(GOOD, recordingJudge(0.9), verifier);
    expect(verdict.accepted).toBe(false);
    expect(failed(verdict.checks)).toEqual(["fact-check"]);
    expect(verdict.checks.at(-1)).toEqual({ id: "meaning-equivalence", ...NOT_RUN });
    expect(verifier.compared).toHaveLength(0);
  });

  test("rejects when the verifier finds a difference that every other check missed", async () => {
    const verdict = await verifyRewrite(GOOD, recordingJudge(0.1), recordingVerifier([{ kind: "relation", before: ";", after: ".", why: "the link is gone" }]));
    expect(verdict.accepted).toBe(false);
    expect(failed(verdict.checks)).toEqual(["meaning-equivalence"]);
  });

  test("runs every cheap check but asks neither Jev nor the verifier once one fails", async () => {
    const judge = recordingJudge(0.1);
    const verifier = recordingVerifier("same");
    const verdict = await verifyRewrite(LOSSY, judge, verifier);
    expect(verdict.accepted).toBe(false);
    expect(failed(verdict.checks)).toEqual(["fact-ledger", "content-coverage", "meaning-words"]);
    expect(verdict.checks.slice(-2)).toEqual([
      { id: "fact-check", ...NOT_RUN },
      { id: "meaning-equivalence", ...NOT_RUN },
    ]);
    expect(judge.asked).toHaveLength(0);
    expect(verifier.compared).toHaveLength(0);
  });

  test("rejects a rewrite whose protected tokens did not come back, and says why", async () => {
    const verdict = await verifyRewrite({ ...GOOD, tokensOk: false, tokenProblems: ["⟦0⟧ appears twice"] }, recordingJudge(0.1), recordingVerifier("same"));
    expect(verdict.accepted).toBe(false);
    expect(verdict.checks[0]).toEqual({ id: "tokens", ok: false, detail: "⟦0⟧ appears twice" });
  });

  test.each([
    ["Jev fails", recordingJudge(new Error("Jev did not answer within 15000 ms.")), "fact-check"],
    ["Jev gives no answer", recordingJudge(undefined), "fact-check"],
    ["there is no judge", undefined, "fact-check"],
    ["there is no verifier", recordingJudge(0.1), "meaning-equivalence"],
  ] as const)("rejects a rewrite the cheap checks pass when %s", async (name, judge, check) => {
    const verdict = await verifyRewrite(GOOD, judge, name === "there is no verifier" ? undefined : recordingVerifier("same"));
    expect(verdict.accepted).toBe(false);
    expect(failed(verdict.checks)).toEqual([check]);
    expect(needsReview(verdict)).toBe(false);
  });
});
