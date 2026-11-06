import { describe, expect, test } from "bun:test";
import { builderReport, costGuard, evaluateGate, evaluateLaneGate, laneBuilderReport, lintGuard, parseTestLog, parseTypeErrors, testsGuard, type GuardResult, type LanePageScore, type PageScore, type WriterCost } from "./gate";
import { BLOCK_GROUPS, PAGE_CATEGORIES, type BriefSet, type JudgeReply, type PageCategory } from "./schema";

const okGuards: GuardResult[] = [
  { name: "tests", pass: true, detail: "ok", items: [] },
  { name: "lint", pass: true, detail: "ok", items: [] },
  { name: "writer-cost", pass: true, detail: "ok", items: [] },
];
const texts = (gate: { failures: { text: string }[] }) => gate.failures.map((f) => f.text);

/** A page with one block of every group, all scored `score`, unless overridden. */
function page(judge: string, set: BriefSet, briefId: number, score = 10, over: { categories?: Partial<Record<PageCategory, number>>; blockScore?: number; finding?: string } = {}): PageScore {
  const blocks = BLOCK_GROUPS.map((g) => ({ id: `${briefId}-${g}`, score: over.blockScore ?? score }));
  return {
    judge, set, briefId,
    groups: Object.fromEntries(BLOCK_GROUPS.map((g) => [`${briefId}-${g}`, g])),
    samples: [{
      categories: { ...Object.fromEntries(PAGE_CATEGORIES.map((c) => [c, score])), ...over.categories } as Record<PageCategory, number>,
      blocks,
      findings: over.finding ? [{ target: "accuracy", severity: "high", finding: over.finding }] : [],
    }],
  };
}
/** One page scored once per entry of `accuracy`, with that accuracy and `findings` for that sample, all else 10. */
function sampled(judge: string, set: BriefSet, briefId: number, accuracy: number[], findings: JudgeReply["findings"][] = []): PageScore {
  const base = page(judge, set, briefId);
  return { ...base, samples: accuracy.map((a, i) => ({ ...base.samples[0]!, categories: { ...base.samples[0]!.categories, accuracy: a }, findings: findings[i] ?? [] })) };
}
const fullRound = (judges: string[], score = 10) => judges.flatMap((j) => [page(j, "climb", 1, score), page(j, "climb", 2, score), page(j, "held-out", 7, score)]);

describe("evaluateGate", () => {
  test("passes when every counting judge reaches 9.5 everywhere on both sets", () => {
    expect(evaluateGate(fullRound(["sol", "opus"]), ["sol", "opus"], okGuards).pass).toBe(true);
  });

  test("a category score is the judge's mean over the set", () => {
    const pages = [page("sol", "climb", 1, 10, { categories: { clarity: 9 } }), page("sol", "climb", 2, 10), page("sol", "held-out", 7)];
    const gate = evaluateGate(pages, ["sol"], okGuards);
    expect(gate.scores.sol!.climb!.categories.clarity).toEqual({ mean: 9.5, min: 9 });
    expect(gate.pass).toBe(true);
  });

  test("fails when a category mean is below 9.5", () => {
    const pages = [page("sol", "climb", 1, 10, { categories: { craft: 9 } }), page("sol", "climb", 2, 10, { categories: { craft: 9 } }), page("sol", "held-out", 7)];
    const gate = evaluateGate(pages, ["sol"], okGuards);
    expect(gate.pass).toBe(false);
    expect(texts(gate)).toEqual(["sol climb craft: mean 9.00 < 9.5"]);
  });

  test("fails when one page scores below 9 even though the mean reaches 9.5", () => {
    const climb = [8, ...Array(9).fill(10)].map((s, i) => page("sol", "climb", i + 1, 10, { categories: { scope: s } }));
    const gate = evaluateGate([...climb, page("sol", "held-out", 7)], ["sol"], okGuards);
    expect(gate.scores.sol!.climb!.categories.scope.mean).toBe(9.8);
    expect(texts(gate)).toEqual(["sol climb scope: a page scored 8 < 9"]);
  });

  test("a block group score is the mean over its blocks in the set, and fails below 9.5", () => {
    const pages = [page("sol", "climb", 1, 10, { blockScore: 9 }), page("sol", "climb", 2, 10, { blockScore: 9 }), page("sol", "held-out", 7)];
    const gate = evaluateGate(pages, ["sol"], okGuards);
    expect(gate.scores.sol!.climb!.groups.stack).toEqual({ mean: 9, blocks: 2 });
    expect(texts(gate)).toContain("sol climb stack: mean 9.00 < 9.5");
  });

  test("fails when a group has no blocks in a set", () => {
    const sparse = page("sol", "held-out", 7);
    sparse.samples[0]!.blocks = sparse.samples[0]!.blocks.filter((b) => sparse.groups[b.id] !== "pseudocode");
    const gate = evaluateGate([page("sol", "climb", 1), sparse], ["sol"], okGuards);
    expect(gate.failures).toEqual([{ set: "held-out", text: "sol held-out pseudocode: no blocks of this group" }]);
  });

  test("fails when a counting judge has not scored the held-out set", () => {
    const gate = evaluateGate([page("sol", "climb", 1)], ["sol"], okGuards);
    expect(texts(gate)).toEqual(["sol held-out: no pages scored"]);
  });

  test("every counting judge must pass, and a non-counting judge never blocks", () => {
    const pages = [...fullRound(["sol"]), ...fullRound(["opus"], 9), ...fullRound(["gemini"], 2)];
    expect(evaluateGate(pages, ["sol", "opus"], okGuards).pass).toBe(false);
    expect(evaluateGate(pages, ["sol"], okGuards).pass).toBe(true);
  });

  test("a page's category and block scores are the median of its samples", () => {
    const climb = sampled("sol", "climb", 1, [10, 6, 9]);
    climb.samples = climb.samples.map((s, i) => ({ ...s, blocks: s.blocks.map((b) => ({ ...b, score: [7, 10, 9][i]! })) }));
    const gate = evaluateGate([climb, sampled("sol", "climb", 2, [10, 9]), page("sol", "held-out", 7)], ["sol"], okGuards);
    expect(gate.scores.sol!.climb!.categories.accuracy).toEqual({ mean: 9.25, min: 9 });
    expect(gate.scores.sol!.climb!.groups.stack).toEqual({ mean: 9.5, blocks: 2 });
  });

  test("the page floor applies to the median, so one low sample of three does not fail it and two do", () => {
    const pass = evaluateGate([sampled("sol", "climb", 1, [10, 6, 10]), page("sol", "held-out", 7)], ["sol"], okGuards);
    expect(pass.pass).toBe(true);
    const fail = evaluateGate([sampled("sol", "climb", 1, [8, 10, 8]), page("sol", "held-out", 7)], ["sol"], okGuards);
    expect(texts(fail)).toEqual(["sol climb accuracy: mean 8.00 < 9.5", "sol climb accuracy: a page scored 8 < 9"]);
  });

  test("a failed guard fails the gate", () => {
    const guards: GuardResult[] = [...okGuards.slice(0, 2), { name: "writer-cost", pass: false, detail: "tokens per page 130% of baseline", items: [] }];
    expect(texts(evaluateGate(fullRound(["sol"]), ["sol"], guards))).toEqual(["guard writer-cost: tokens per page 130% of baseline"]);
  });
});

describe("guards", () => {
  const baseline = { tests: ["a.test.ts > known slow"], typeErrors: ["src/x.ts:3 TS2322"] };

  test("tests guard fails on a failing test or type error the baseline lacks, and names it", () => {
    const current = { tests: [...baseline.tests, "b.test.ts > broke"], typeErrors: [...baseline.typeErrors, "src/y.ts:9 TS2345"] };
    expect(testsGuard({ harnessExitCode: 0, current, baseline, failedAgain: ["b.test.ts > broke"] })).toEqual({
      name: "tests", pass: false, detail: "failed: new failing test b.test.ts > broke, new type error src/y.ts:9 TS2345", items: [],
    });
  });

  test("tests guard passes on failures the baseline has, and on a new failure that passes its rerun", () => {
    const current = { tests: [...baseline.tests, "b.test.ts > timed out once"], typeErrors: baseline.typeErrors };
    expect(testsGuard({ harnessExitCode: 0, current, baseline, failedAgain: [] }).pass).toBe(true);
  });

  test("tests guard with no baseline records the sets and passes, but the harness tests stay strict", () => {
    const current = { tests: ["a.test.ts > known slow"], typeErrors: ["src/x.ts:3 TS2322"] };
    expect(testsGuard({ harnessExitCode: 0, current, baseline: null, failedAgain: [] })).toEqual({ name: "tests", pass: true, detail: "baseline recorded", items: [] });
    expect(testsGuard({ harnessExitCode: 1, current, baseline: null, failedAgain: [] }).pass).toBe(false);
    expect(testsGuard({ harnessExitCode: 1, current, baseline, failedAgain: [] }).pass).toBe(false);
    expect(testsGuard(null).pass).toBe(false);
  });

  test("parses failing test names per file and type errors by file, line and code", () => {
    const log = ["src/a.test.ts:", "(fail) group > slow one [1003.79ms]", "", "src/b.test.tsx:", "# Unhandled error between tests", "(fail) loads [0.09ms]"].join("\n");
    expect(parseTestLog(log)).toEqual(["src/a.test.ts > group > slow one", "src/b.test.tsx > (unhandled error)", "src/b.test.tsx > loads"]);
    const tsc = "src/x.ts(273,41): error TS2322: Type 'A' is not assignable.\n  Type 'B' detail.\nsrc/x.ts(273,50): error TS2322: again.\n";
    expect(parseTypeErrors(tsc)).toEqual(["src/x.ts:273 TS2322"]);
  });

  test("lint guard fails on any blocking finding under the snapshot rules, one item per page with its set", () => {
    expect(lintGuard([{ set: "climb", briefId: 1, blocking: 0 }], "rules@abc").pass).toBe(true);
    const failed = lintGuard([{ set: "climb", briefId: 1, blocking: 2 }, { set: "held-out", briefId: 8, blocking: 1 }], "rules@abc");
    expect(failed.pass).toBe(false);
    expect(failed.detail).toBe("2 of 2 pages have blocking findings under rules@abc");
    expect(failed.items).toEqual([{ set: "climb", text: "brief 1 (2)" }, { set: "held-out", text: "brief 8 (1)" }]);
  });

  test("writer-cost guard allows up to 120% of the baseline per page", () => {
    const base: WriterCost[] = [{ set: "climb", briefId: 1, toolCalls: 10, tokens: 1000 }, { set: "climb", briefId: 2, toolCalls: 20, tokens: 3000 }];
    expect(costGuard([{ set: "climb", briefId: 1, toolCalls: 12, tokens: 1200 }, { set: "climb", briefId: 2, toolCalls: 24, tokens: 3600 }], base).pass).toBe(true);
    const over = costGuard([{ set: "climb", briefId: 1, toolCalls: 12, tokens: 1000 }, { set: "climb", briefId: 2, toolCalls: 25, tokens: 3000 }], base);
    expect(over).toEqual({ name: "writer-cost", pass: false, detail: "toolCalls per page 123% of baseline", items: [] });
  });

  test("writer-cost guard compares only the briefs this round wrote, and fails without a baseline", () => {
    const base: WriterCost[] = [{ set: "climb", briefId: 1, toolCalls: 10, tokens: 1000 }, { set: "climb", briefId: 9, toolCalls: 100, tokens: 99000 }];
    expect(costGuard([{ set: "climb", briefId: 1, toolCalls: 13, tokens: 1000 }], base).pass).toBe(false);
    expect(costGuard([{ set: "climb", briefId: 1, toolCalls: 10, tokens: 1000 }], null).pass).toBe(false);
    expect(costGuard([{ set: "climb", briefId: 2, toolCalls: 10, tokens: 1000 }], base).pass).toBe(false);
  });
});

describe("builderReport", () => {
  test("holds held-out scores only, never held-out pages or findings", () => {
    const pages = [page("sol", "climb", 1, 10, { finding: "climb finding" }), page("sol", "held-out", 7, 8, { finding: "secret held-out finding" })];
    const gate = evaluateGate(pages, ["sol"], okGuards);
    const report = builderReport(gate, pages);
    const text = JSON.stringify(report);
    expect(report.scores.sol!["held-out"]!.categories.accuracy.mean).toBe(8);
    expect(report.climbPages.map((p) => p.briefId)).toEqual([1]);
    expect(text).toContain("climb finding");
    expect(text).not.toContain("secret held-out finding");
    expect(text).not.toContain("held-out accuracy");
    expect(report.heldOutFailures).toBeGreaterThan(0);
  });

  test("lists each finding once with the count of samples that named its target, at its most severe", () => {
    const pages = [sampled("sol", "climb", 1, [8, 8, 10], [
      [{ target: "p-1", severity: "low", finding: "First wording." }],
      [{ target: "p-1", severity: "medium", finding: "Second wording." }, { target: "scope", severity: "low", finding: "Once." }],
      [],
    ]), page("sol", "held-out", 7)];
    const report = builderReport(evaluateGate(pages, ["sol"], okGuards), pages);
    expect(report.climbPages).toEqual([{
      judge: "sol", briefId: 1, samples: 3, categories: expect.objectContaining({ accuracy: 8 }),
      findings: [{ target: "p-1", severity: "medium", finding: "Second wording.", samples: 2 }, { target: "scope", severity: "low", finding: "Once.", samples: 1 }],
    }]);
  });

  test("a held-out writer error and lint finding appear only as counts, with no held-out brief id, slug or path", () => {
    const pages = [page("sol", "climb", 1), page("sol", "held-out", 7)];
    const guards = [okGuards[0]!, lintGuard([{ set: "climb", briefId: 1, blocking: 1 }, { set: "held-out", briefId: 7, blocking: 3 }], "rules@abc"),
      costGuard([{ set: "climb", briefId: 1, toolCalls: 1, tokens: 1 }, { set: "held-out", briefId: 7, toolCalls: 1, tokens: 1 }], [{ set: "climb", briefId: 1, toolCalls: 1, tokens: 1 }])];
    const gate = evaluateGate(pages, ["sol"], guards);
    gate.failures.unshift({ set: "held-out", text: "run brief 7: writer failed in /round-x/held-out/07-secret-slug/metrics.json" });
    const report = builderReport(gate, pages);
    const text = JSON.stringify(report);
    for (const leak of ["brief 7", "secret-slug", "07-", "/held-out/", '"briefId":7']) expect(text).not.toContain(leak);
    expect(report.guards.find((g) => g.name === "lint")).toMatchObject({ pass: false, items: ["brief 1 (1)"], heldOutItems: 1 });
    expect(report.guards.find((g) => g.name === "writer-cost")).toMatchObject({ pass: false, items: [], heldOutItems: 1 });
    expect(report.heldOutFailures).toBe(1);
    expect(report.scores.sol!["held-out"]!.categories.accuracy.mean).toBe(10);
  });
});

describe("lane gate", () => {
  const criteria = ["accuracy", "readability", "nesting"];
  /** One lane page, every criterion and category `score` in each sample unless overridden. */
  function lanePage(judge: string, set: BriefSet, over: { id?: number; score?: number; criteria?: Record<string, number>[]; categories?: Partial<Record<PageCategory, number>>; finding?: string } = {}): LanePageScore {
    const { id: briefId = set === "climb" ? 1 : 2, score = 9.6 } = over;
    const sample = (c: Record<string, number> = {}) => ({
      criteria: { ...Object.fromEntries(criteria.map((id) => [id, score])), ...c },
      categories: { ...Object.fromEntries(PAGE_CATEGORIES.map((c) => [c, 9])), ...over.categories } as Record<PageCategory, number>,
      findings: over.finding ? [{ target: "nesting", severity: "high" as const, finding: over.finding }] : [],
    });
    return { judge, set, briefId, samples: (over.criteria ?? [{}]).map(sample) };
  }
  const both = (judge: string, score = 9.6) => [lanePage(judge, "climb", { score }), lanePage(judge, "held-out", { score })];
  const gate = (pages: LanePageScore[], counting: string[], baseline: Parameters<typeof evaluateLaneGate>[4] = null) => evaluateLaneGate(pages, counting, criteria, okGuards, baseline);

  test("passes when every counting judge gives 9.5 or more on every criterion on both sets", () => {
    expect(gate([...both("sol"), ...both("opus", 9.5)], ["sol", "opus"]).pass).toBe(true);
  });

  test("a criterion score is the median of a page's samples, then the mean over the set's pages", () => {
    const climb = [lanePage("sol", "climb", { criteria: [{ nesting: 9.9 }, { nesting: 8.0 }, { nesting: 9.7 }] }), lanePage("sol", "climb", { id: 3, criteria: [{ nesting: 9.1 }] })];
    const result = gate([...climb, lanePage("sol", "held-out")], ["sol"]);
    expect(result.scores.sol!.climb!.criteria.nesting!.mean).toBeCloseTo(9.4);
    expect(result.scores.sol!.climb!.criteria.nesting!.min).toBe(9.1);
    expect(texts(result)).toEqual(["sol climb nesting: mean 9.40 < 9.5"]);
  });

  test("passes a criterion whose page scores average exactly 9.5, though their float sum falls just short", () => {
    const scores = [9.6, 9.9, 9.9, 10, 9.1, 8.8, 9.6, 9.1];
    const climb = scores.map((nesting, i) => lanePage("sol", "climb", { id: 10 + i, criteria: [{ nesting }] }));
    const result = gate([...climb, lanePage("sol", "held-out")], ["sol"]);
    expect(result.scores.sol!.climb!.criteria.nesting!.mean).toBe(9.5);
    expect(result.pass).toBe(true);
  });

  test("fails on the held-out set alone, and on a set no counting judge scored", () => {
    expect(texts(gate([lanePage("sol", "climb"), lanePage("sol", "held-out", { score: 9.4 })], ["sol"]))).toEqual(criteria.map((c) => `sol held-out ${c}: mean 9.40 < 9.5`));
    expect(texts(gate([lanePage("sol", "climb")], ["sol"]))).toEqual(["sol held-out: no pages scored"]);
  });

  test("fails a criterion that a sample did not score, such as a reply cached before the criterion was added", () => {
    const stale = lanePage("sol", "climb");
    const legacy = { ...stale.samples[0]!, criteria: { accuracy: 9.6, readability: 9.6 } };
    const climb = [{ ...stale, samples: [stale.samples[0]!, legacy, stale.samples[0]!] }, lanePage("sol", "climb", { id: 3 })];
    const result = gate([...climb, lanePage("sol", "held-out")], ["sol"]);
    expect(result.pass).toBe(false);
    expect(texts(result)).toEqual(["sol climb nesting: not scored on 1 of 2 pages"]);
    // With one sample, the missing score makes the mean NaN, which never compares below the target.
    const lone = gate([{ ...stale, samples: [legacy] }, lanePage("sol", "held-out")], ["sol"]);
    expect(texts(lone)).toEqual(["sol climb nesting: not scored on 1 of 1 pages"]);
  });

  test("only the stage's counting judges block, so a later-stage judge below the target does not", () => {
    const pages = [...both("sol"), ...both("opus"), ...both("muse", 7)];
    expect(gate(pages, ["sol", "opus"]).pass).toBe(true);
    expect(gate(pages, ["sol", "opus", "muse"]).pass).toBe(false);
  });

  test("the page-category guard fails when a category falls more than 0.5 below the baseline, and records the first round", () => {
    const baseline = gate(both("sol"), ["sol"]).scores;
    const dropped = [lanePage("sol", "climb", { categories: { structure: 8.4 } }), lanePage("sol", "held-out")];
    const result = gate(dropped, ["sol"], baseline);
    expect(result.guards.find((g) => g.name === "page-categories")).toMatchObject({ pass: false, items: [{ set: "climb", text: "sol climb structure: mean 8.40, baseline 9.00" }] });
    expect(gate([lanePage("sol", "climb", { categories: { structure: 8.6 } }), lanePage("sol", "held-out")], ["sol"], baseline).pass).toBe(true);
    expect(gate(dropped, ["sol"]).guards.at(-1)).toMatchObject({ pass: true, detail: "baseline recorded" });
  });

  test("the page-category guard passes a drop of exactly 0.5, though its float difference is just over, and fails 0.51", () => {
    const round = (structure: number) => [lanePage("sol", "climb", { categories: { structure } }), lanePage("sol", "held-out", { categories: { structure } })];
    const baseline = gate(round(8.3), ["sol"]).scores;
    expect(gate(round(7.8), ["sol"], baseline).guards.at(-1)).toMatchObject({ name: "page-categories", pass: true });
    expect(gate(round(7.79), ["sol"], baseline).guards.at(-1)).toMatchObject({ name: "page-categories", pass: false, items: [{ set: "climb" }, { set: "held-out" }] });
  });

  test("the builder report holds held-out scores only, never held-out pages, findings or guard items", () => {
    const baseline = gate(both("sol"), ["sol"]).scores;
    const pages = [lanePage("sol", "climb", { finding: "climb finding" }), lanePage("sol", "held-out", { id: 7, score: 9.0, finding: "secret held-out finding", categories: { craft: 7 } })];
    const report = laneBuilderReport(gate(pages, ["sol"], baseline), pages, criteria);
    const text = JSON.stringify(report);
    expect(report.scores.sol!["held-out"]!.criteria.nesting!.mean).toBe(9);
    expect(report.climbPages.map((p) => p.briefId)).toEqual([1]);
    expect(report.climbPages[0]!.findings.map((f) => f.finding)).toEqual(["climb finding"]);
    expect(report.guards.find((g) => g.name === "page-categories")).toMatchObject({ pass: false, items: [], heldOutItems: 1 });
    expect(report.heldOutFailures).toBe(3);
    for (const leak of ["secret held-out finding", "held-out nesting", "held-out craft", '"briefId":7']) expect(text).not.toContain(leak);
  });
});
