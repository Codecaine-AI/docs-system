import { describe, expect, test } from "bun:test";
import type { DeltaSpan } from "@codecaine-ai/docs-model";
import { checkFactCheck, FACT_CHECK_THRESHOLD } from "./fact-check";
import { recordingJudge, rewrite } from "./fixtures";

const SPLIT = rewrite("Run `docs style lint`; then read [the report](https://example.com/r).", [
  "Run `docs style lint` in two steps.",
  "Run the lint.",
  "Read [the report](https://example.com/r).",
]);

describe("fact-check", () => {
  test("asks Jev one question about the original and the rewrite as a lead plus bullets", async () => {
    const judge = recordingJudge(0.1);
    await checkFactCheck(SPLIT, judge);
    expect(judge.asked).toHaveLength(1);
    expect(judge.asked[0]!.state).toEqual({
      before: "Run `docs style lint`; then read [the report](https://example.com/r).",
      after: "Run `docs style lint` in two steps.\n- Run the lint.\n- Read [the report](https://example.com/r).",
    });
  });

  test("shows Jev the targets of references, so two same-label references that swap targets differ", async () => {
    const guide = (path: string): DeltaSpan => ({ insert: "the guide", attributes: { reference: { kind: "doc", path } } });
    const ordered = (first: string, second: string): DeltaSpan[] => [
      { insert: "Before release, read " },
      guide(first),
      { insert: ". After release, read " },
      guide(second),
      { insert: "." },
    ];
    const judge = recordingJudge(0.1);
    await checkFactCheck({ beforeSpans: ordered("build/prepare", "release/cleanup"), afterBlocks: [ordered("release/cleanup", "build/prepare")] }, judge);
    expect(judge.asked[0]!.state).toEqual({
      before: "Before release, read [the guide](ref:build/prepare). After release, read [the guide](ref:release/cleanup).",
      after: "Before release, read [the guide](ref:release/cleanup). After release, read [the guide](ref:build/prepare).",
    });
  });

  test.each([
    ["passes below the threshold", FACT_CHECK_THRESHOLD - 0.01, true],
    ["fails at the threshold", FACT_CHECK_THRESHOLD, false],
    ["fails above the threshold", 0.97, false],
  ])("%s", async (_, p, ok) => {
    const result = await checkFactCheck(SPLIT, recordingJudge(p));
    expect(result.ok).toBe(ok);
    expect(result.skipped).toBeUndefined();
    expect(result.detail).toContain(p.toFixed(2));
  });

  test.each([
    ["there is no judge", null, "no judge"],
    ["the judge throws", new Error("Jev returned HTTP 503."), "Jev returned HTTP 503."],
    ["the judge returns no answer", undefined, "Jev returned no answer"],
  ])("fails when %s, so an unchecked rewrite never lands", async (_, answer, reason) => {
    const result = await checkFactCheck(SPLIT, answer === null ? undefined : recordingJudge(answer));
    expect(result).toEqual({ id: "fact-check", ok: false, detail: `fact check unavailable: ${reason}` });
  });
});
