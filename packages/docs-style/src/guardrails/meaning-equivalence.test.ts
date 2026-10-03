import { describe, expect, test } from "bun:test";
import type { DeltaSpan } from "@codecaine-ai/docs-model";
import { recordingVerifier, rewrite } from "./fixtures";
import { checkMeaningEquivalence } from "./meaning-equivalence";

const SPLIT = {
  ...rewrite("Run `docs style lint`; then read [the report](https://example.com/r).", ["Run `docs style lint` in two steps.", "Run the lint.", "Read [the report](https://example.com/r)."]),
  afterDepths: [0, 1, 2],
  blockType: "list-item",
  heading: "Commands",
};

describe("meaning-equivalence", () => {
  test("asks the verifier once, with targets, bullet depth, the block type, and the heading", async () => {
    const verifier = recordingVerifier("same");
    expect(await checkMeaningEquivalence(SPLIT, verifier)).toEqual({ id: "meaning-equivalence", ok: true, detail: "same meaning (fake-verifier)" });
    expect(verifier.compared).toEqual([
      {
        before: "Run `docs style lint`; then read [the report](https://example.com/r).",
        after: "Run `docs style lint` in two steps.\n- Run the lint.\n  - Read [the report](https://example.com/r).",
        blockType: "list-item",
        heading: "Commands",
      },
    ]);
  });

  test("without depths and a block type, reads the lead at depth 0, every other block at depth 1, and a paragraph", async () => {
    const verifier = recordingVerifier("same");
    await checkMeaningEquivalence(rewrite("A; b.", ["Lead.", "One.", "Two."]), verifier);
    expect(verifier.compared[0]).toEqual({ before: "A; b.", after: "Lead.\n- One.\n- Two.", blockType: "paragraph" });
  });

  test("shows a reference by its target, so a swap of two same-label references differs", async () => {
    const guide = (path: string): DeltaSpan => ({ insert: "the guide", attributes: { reference: { kind: "doc", path } } });
    const verifier = recordingVerifier("same");
    await checkMeaningEquivalence({ beforeSpans: [guide("build/prepare"), { insert: ", then " }, guide("release/cleanup")], afterBlocks: [[guide("release/cleanup"), { insert: ", then " }, guide("build/prepare")]] }, verifier);
    expect(verifier.compared[0]).toMatchObject({
      before: "[the guide](ref:build/prepare), then [the guide](ref:release/cleanup)",
      after: "[the guide](ref:release/cleanup), then [the guide](ref:build/prepare)",
    });
  });

  test("fails with the first two differences, short, and a count of the rest", async () => {
    const result = await checkMeaningEquivalence(
      SPLIT,
      recordingVerifier([
        { kind: "relation", before: "because a person reviews it", after: "", why: "the reason is gone" },
        { kind: "added", before: "", after: "in two steps", why: "BEFORE names no steps" },
        { kind: "scope", before: "the report", after: "the reports", why: "plural" },
      ]),
    );
    expect(result).toEqual({
      id: "meaning-equivalence",
      ok: false,
      detail: 'differs: relation drops "because a person reviews it": the reason is gone; adds "in two steps": BEFORE names no steps, and 1 more',
    });
  });

  test.each([
    ["there is no verifier", undefined, "meaning check unavailable: no verifier"],
    ["the verifier throws", recordingVerifier(new Error("codex-lb returned HTTP 502")), "meaning check unavailable: codex-lb returned HTTP 502"],
    ["the verifier says same but names a difference", { compare: async () => ({ same: true, differences: [{ kind: "emphasis", before: "only", after: "", why: "" }], model: "m", ms: 1 }) }, 'differs: emphasis drops "only"'],
    ["the verifier says not same but names nothing", { compare: async () => ({ same: false, differences: [], model: "m", ms: 1 }) }, "differs: the verifier named no difference"],
    ["the verifier gives no verdict", { compare: async () => ({}) as never }, "meaning check unavailable: the verifier gave no verdict"],
  ])("fails when %s, so an unchecked change never lands", async (_, verifier, detail) => {
    expect(await checkMeaningEquivalence(SPLIT, verifier)).toEqual({ id: "meaning-equivalence", ok: false, detail });
  });
});
