import { describe, expect, test } from "bun:test";
import { builderReport, costGuard, evaluateGate, lintGuard, testsGuard, type GuardResult, type PageScore } from "./gate";
import { BLOCK_GROUPS, PAGE_CATEGORIES, type BriefSet, type PageCategory } from "./schema";

const okGuards: GuardResult[] = [
  { name: "tests", pass: true, detail: "ok" },
  { name: "lint", pass: true, detail: "ok" },
  { name: "writer-cost", pass: true, detail: "ok" },
];

/** A page with one block of every group, all scored `score`, unless overridden. */
function page(judge: string, set: BriefSet, briefId: number, score = 10, over: { categories?: Partial<Record<PageCategory, number>>; blockScore?: number; finding?: string } = {}): PageScore {
  const blocks = BLOCK_GROUPS.map((g) => ({ id: `${briefId}-${g}`, score: over.blockScore ?? score }));
  return {
    judge, set, briefId,
    groups: Object.fromEntries(BLOCK_GROUPS.map((g) => [`${briefId}-${g}`, g])),
    reply: {
      categories: { ...Object.fromEntries(PAGE_CATEGORIES.map((c) => [c, score])), ...over.categories } as Record<PageCategory, number>,
      blocks,
      findings: over.finding ? [{ target: "accuracy", severity: "high", finding: over.finding }] : [],
    },
  };
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
    expect(gate.failures).toEqual(["sol climb craft: mean 9.00 < 9.5"]);
  });

  test("fails when one page scores below 9 even though the mean reaches 9.5", () => {
    const climb = [8, ...Array(9).fill(10)].map((s, i) => page("sol", "climb", i + 1, 10, { categories: { scope: s } }));
    const gate = evaluateGate([...climb, page("sol", "held-out", 7)], ["sol"], okGuards);
    expect(gate.scores.sol!.climb!.categories.scope.mean).toBe(9.8);
    expect(gate.failures).toEqual(["sol climb scope: a page scored 8 < 9"]);
  });

  test("a block group score is the mean over its blocks in the set, and fails below 9.5", () => {
    const pages = [page("sol", "climb", 1, 10, { blockScore: 9 }), page("sol", "climb", 2, 10, { blockScore: 9 }), page("sol", "held-out", 7)];
    const gate = evaluateGate(pages, ["sol"], okGuards);
    expect(gate.scores.sol!.climb!.groups.stack).toEqual({ mean: 9, blocks: 2 });
    expect(gate.failures).toContain("sol climb stack: mean 9.00 < 9.5");
  });

  test("fails when a group has no blocks in a set", () => {
    const sparse = page("sol", "held-out", 7);
    sparse.reply.blocks = sparse.reply.blocks.filter((b) => sparse.groups[b.id] !== "pseudocode");
    const gate = evaluateGate([page("sol", "climb", 1), sparse], ["sol"], okGuards);
    expect(gate.failures).toEqual(["sol held-out pseudocode: no blocks of this group"]);
  });

  test("fails when a counting judge has not scored the held-out set", () => {
    const gate = evaluateGate([page("sol", "climb", 1)], ["sol"], okGuards);
    expect(gate.failures).toEqual(["sol held-out: no pages scored"]);
  });

  test("every counting judge must pass, and a non-counting judge never blocks", () => {
    const pages = [...fullRound(["sol"]), ...fullRound(["opus"], 9), ...fullRound(["gemini"], 2)];
    expect(evaluateGate(pages, ["sol", "opus"], okGuards).pass).toBe(false);
    expect(evaluateGate(pages, ["sol"], okGuards).pass).toBe(true);
  });

  test("a failed guard fails the gate", () => {
    const guards: GuardResult[] = [...okGuards.slice(0, 2), { name: "writer-cost", pass: false, detail: "tokens per page 130% of baseline" }];
    expect(evaluateGate(fullRound(["sol"]), ["sol"], guards).failures).toEqual(["guard writer-cost: tokens per page 130% of baseline"]);
  });
});

describe("guards", () => {
  test("tests guard passes only when every check exits 0", () => {
    expect(testsGuard([{ command: "bun run test", exitCode: 0 }, { command: "bun run typecheck", exitCode: 0 }]).pass).toBe(true);
    expect(testsGuard([{ command: "bun run test", exitCode: 1 }]).pass).toBe(false);
    expect(testsGuard([]).pass).toBe(false);
  });

  test("lint guard fails on any blocking finding under the snapshot rules", () => {
    expect(lintGuard([{ set: "climb", briefId: 1, blocking: 0 }], "rules@abc").pass).toBe(true);
    const failed = lintGuard([{ set: "climb", briefId: 1, blocking: 2 }, { set: "held-out", briefId: 8, blocking: 1 }], "rules@abc");
    expect(failed.pass).toBe(false);
    expect(failed.detail).toBe("blocking findings under rules@abc: brief 1 (2), 1 held-out page(s)");
  });

  test("writer-cost guard allows up to 120% of the baseline per page", () => {
    const base = [{ briefId: 1, toolCalls: 10, tokens: 1000 }, { briefId: 2, toolCalls: 20, tokens: 3000 }];
    expect(costGuard([{ briefId: 1, toolCalls: 12, tokens: 1200 }, { briefId: 2, toolCalls: 24, tokens: 3600 }], base).pass).toBe(true);
    const over = costGuard([{ briefId: 1, toolCalls: 12, tokens: 1000 }, { briefId: 2, toolCalls: 25, tokens: 3000 }], base);
    expect(over).toEqual({ name: "writer-cost", pass: false, detail: "toolCalls per page 123% of baseline" });
  });

  test("writer-cost guard compares only the briefs this round wrote, and fails without a baseline", () => {
    const base = [{ briefId: 1, toolCalls: 10, tokens: 1000 }, { briefId: 9, toolCalls: 100, tokens: 99000 }];
    expect(costGuard([{ briefId: 1, toolCalls: 13, tokens: 1000 }], base).pass).toBe(false);
    expect(costGuard([{ briefId: 1, toolCalls: 10, tokens: 1000 }], null).pass).toBe(false);
    expect(costGuard([{ briefId: 2, toolCalls: 10, tokens: 1000 }], base).pass).toBe(false);
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
});
