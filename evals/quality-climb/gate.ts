// Pure gate rules of the quality climb: category and block-group means, the page floor, the guards,
// and the builder-facing report that never shows held-out pages or findings.
import { BLOCK_GROUPS, PAGE_CATEGORIES, SETS, type BlockGroup, type BriefSet, type JudgeReply, type LaneReply, type PageCategory } from "./schema";

export const TARGET = 9.5;
export const PAGE_FLOOR = 9;
export const COST_LIMIT = 1.2;
/** The most a lane round's page-category mean may fall below the baseline round's, per judge and set. */
export const CATEGORY_DROP = 0.5;

/**
 * The judge ladder: each stage's counting judges and how many samples each takes per page. A stage adds a judge
 * only when the one before it passes. The gate reads the median of a judge's samples.
 */
export const STAGES = {
  1: { sol: 3, opus: 1 },
  2: { sol: 3, opus: 1, muse: 3 },
  3: { sol: 3, opus: 1, muse: 3, fable: 1 },
} as const satisfies Record<number, Record<string, number>>;
export type Stage = keyof typeof STAGES;

/**
 * One judge's scores of one page: one reply per sample, in sample order. The gate reads only their median.
 * `groups` maps each scored block id to its block-type group.
 */
export interface PageScore {
  judge: string;
  set: BriefSet;
  briefId: number;
  samples: JudgeReply[];
  groups: Record<string, BlockGroup>;
}
/** A finding with the count of samples that named its target. */
export type MergedFinding = JudgeReply["findings"][number] & { samples: number };
/** A gate failure or guard detail item. `set` is null for an item no single set owns, such as a typecheck error. */
export interface GateItem { set: BriefSet | null; text: string }
export interface WriterCost { set: BriefSet; briefId: number; toolCalls: number; tokens: number }
/** `detail` never names a page. Page-level details go in `items`, each with its set. */
export interface GuardResult { name: "tests" | "lint" | "writer-cost" | "page-categories"; pass: boolean; detail: string; items: GateItem[] }
export interface SetScores {
  categories: Record<PageCategory, { mean: number; min: number }>;
  groups: Partial<Record<BlockGroup, { mean: number; blocks: number }>>;
}
export interface GateResult {
  pass: boolean;
  failures: GateItem[];
  scores: Record<string, Partial<Record<BriefSet, SetScores>>>;
  guards: GuardResult[];
}

// Scores are tenths and sample medians can be twentieths, so the mean sums whole hundredths. Summing the floats
// would make 8 scores whose true mean is 9.5 come out 9.4999…, and the gate would fail them.
const hundredths = (value: number) => Math.round(value * 100);
const mean = (values: number[]) => values.reduce((a, b) => a + hundredths(b), 0) / (100 * values.length);
const meanMin = (values: number[]) => ({ mean: mean(values), min: Math.min(...values) });
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** The median over a page's samples of each category score and of each block score. */
export function pageMedian(samples: JudgeReply[]): { categories: Record<PageCategory, number>; blocks: Record<string, number> } {
  const categories = Object.fromEntries(PAGE_CATEGORIES.map((c) => [c, median(samples.map((s) => s.categories[c]))])) as Record<PageCategory, number>;
  const ids = [...new Set(samples.flatMap((s) => s.blocks.map((b) => b.id)))];
  const blocks = Object.fromEntries(ids.map((id) => [id, median(samples.flatMap((s) => s.blocks.filter((b) => b.id === id).map((b) => b.score)))]));
  return { categories, blocks };
}

const SEVERITY = { high: 0, medium: 1, low: 2 } as const;
/**
 * Each target (a category or a block id) once, with the count of samples that named it. Its severity and text
 * are those of its most severe finding, the earliest sample first. Most samples first, then most severe.
 */
export function mergeFindings(samples: { findings: JudgeReply["findings"] }[]): MergedFinding[] {
  const byTarget = new Map<string, MergedFinding>();
  samples.forEach((sample, i) => {
    for (const target of new Set(sample.findings.map((f) => f.target))) {
      const worst = sample.findings.filter((f) => f.target === target).sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity])[0]!;
      const seen = byTarget.get(target);
      if (!seen) byTarget.set(target, { ...worst, samples: 1 });
      else byTarget.set(target, { ...(SEVERITY[worst.severity] < SEVERITY[seen.severity] ? worst : seen), samples: seen.samples + 1 });
    }
  });
  return [...byTarget.values()].sort((a, b) => b.samples - a.samples || SEVERITY[a.severity] - SEVERITY[b.severity]);
}

/**
 * One judge's scores over one set, on each page's median: each category's mean and lowest page,
 * and each group's mean over its blocks.
 */
export function setScores(pages: PageScore[]): SetScores {
  const medians = pages.map((p) => ({ page: p, ...pageMedian(p.samples) }));
  const categories = Object.fromEntries(PAGE_CATEGORIES.map((c) => {
    const values = medians.map((m) => m.categories[c]);
    return [c, { mean: mean(values), min: Math.min(...values) }];
  })) as SetScores["categories"];
  const byGroup = new Map<BlockGroup, number[]>();
  for (const { page, blocks } of medians) for (const [id, score] of Object.entries(blocks)) {
    const group = page.groups[id];
    if (group) byGroup.set(group, [...(byGroup.get(group) ?? []), score]);
  }
  const groups: SetScores["groups"] = {};
  for (const [group, values] of byGroup) groups[group] = { mean: mean(values), blocks: values.length };
  return { categories, groups };
}

/**
 * The gate passes only when every counting judge reaches TARGET in every category and every block group
 * on both sets, no page's median scores below PAGE_FLOOR in any category, and every guard passes.
 */
export function evaluateGate(pages: PageScore[], countingJudges: string[], guards: GuardResult[]): GateResult {
  const failures: GateItem[] = [];
  const fail = (set: BriefSet, text: string) => failures.push({ set, text });
  const scores: GateResult["scores"] = {};
  for (const judge of countingJudges) {
    scores[judge] = {};
    for (const set of SETS) {
      const mine = pages.filter((p) => p.judge === judge && p.set === set);
      if (mine.length === 0) { fail(set, `${judge} ${set}: no pages scored`); continue; }
      const result = setScores(mine);
      scores[judge][set] = result;
      for (const c of PAGE_CATEGORIES) {
        const { mean: m, min } = result.categories[c];
        if (m < TARGET) fail(set, `${judge} ${set} ${c}: mean ${m.toFixed(2)} < ${TARGET}`);
        if (min < PAGE_FLOOR) fail(set, `${judge} ${set} ${c}: a page scored ${min} < ${PAGE_FLOOR}`);
      }
      for (const g of BLOCK_GROUPS) {
        const group = result.groups[g];
        if (!group) fail(set, `${judge} ${set} ${g}: no blocks of this group`);
        else if (group.mean < TARGET) fail(set, `${judge} ${set} ${g}: mean ${group.mean.toFixed(2)} < ${TARGET}`);
      }
    }
  }
  for (const guard of guards) if (!guard.pass) failures.push({ set: null, text: `guard ${guard.name}: ${guard.detail}` });
  return { pass: failures.length === 0, failures, scores, guards };
}

/** One round's failing tests (`file > describe > name`) and type errors (`file:line TScode`). */
export interface FailureSets { tests: string[]; typeErrors: string[] }

const TEST_FILE_HEADER = /^(\S.*\.(?:test|spec)\.[cm]?[jt]sx?):$/;

/** Failing test names from `bun test` output. A load or between-tests error counts as one failure of its file. */
export function parseTestLog(log: string): string[] {
  const failing = new Set<string>();
  let file = "";
  for (const line of log.split("\n")) {
    const header = TEST_FILE_HEADER.exec(line);
    if (header) file = header[1]!;
    else if (line.startsWith("(fail) ")) failing.add(`${file} > ${line.slice(7).replace(/ \[[\d.]+m?s\]$/, "")}`);
    else if (line.startsWith("# Unhandled error")) failing.add(`${file} > (unhandled error)`);
  }
  return [...failing];
}

/** Type errors from `tsc` output, keyed by file, line and code so a column shift is not a new error. */
export function parseTypeErrors(log: string): string[] {
  return [...new Set([...log.matchAll(/^(\S.*?)\((\d+),\d+\): error (TS\d+):/gm)].map((m) => `${m[1]}:${m[2]} ${m[3]}`))];
}

/** Entries of `current` that `baseline` lacks. */
export function added(current: string[], baseline: string[]): string[] {
  const known = new Set(baseline);
  return current.filter((x) => !known.has(x));
}

/**
 * Tests guard. The harness's own tests must pass. The repo's tests and typecheck must add no failure the
 * baseline round lacks. A new failing test counts only if it is in `failedAgain`, the failures of a serial
 * rerun of its file, so a timeout under load does not flap the guard. With no baseline, the guard passes
 * and this round's sets become the baseline.
 */
export function testsGuard(checks: { harnessExitCode: number | null; current: FailureSets; baseline: FailureSets | null; failedAgain: string[] } | null): GuardResult {
  if (!checks) return { name: "tests", pass: false, detail: "no checks ran", items: [] };
  const harness = checks.harnessExitCode === 0 ? [] : [`bun test evals/quality-climb (exit ${checks.harnessExitCode ?? "not run"})`];
  if (!checks.baseline) return { name: "tests", pass: harness.length === 0, detail: harness.length ? `failed: ${harness[0]}` : "baseline recorded", items: [] };
  const again = new Set(checks.failedAgain);
  const bad = [
    ...harness,
    ...added(checks.current.tests, checks.baseline.tests).filter((t) => again.has(t)).map((t) => `new failing test ${t}`),
    ...added(checks.current.typeErrors, checks.baseline.typeErrors).map((e) => `new type error ${e}`),
  ];
  return { name: "tests", pass: bad.length === 0, detail: bad.length ? `failed: ${bad.join(", ")}` : `no new failures against baseline (${checks.current.tests.length} failing tests, ${checks.current.typeErrors.length} type errors known)`, items: [] };
}

/** Lint guard: every page has zero blocking docs_check findings under the snapshot rules. Each failing page is one item. */
export function lintGuard(pages: { set: BriefSet; briefId: number; blocking: number }[], rules: string): GuardResult {
  const bad = pages.filter((p) => p.blocking > 0);
  const detail = bad.length ? `${bad.length} of ${pages.length} pages have blocking findings under ${rules}` : `0 blocking findings on ${pages.length} pages under ${rules}`;
  return { name: "lint", pass: pages.length > 0 && bad.length === 0, detail, items: bad.map((p) => ({ set: p.set, text: `brief ${p.briefId} (${p.blocking})` })) };
}

/** Writer-cost guard: tool calls and tokens per page, over the same briefs, stay within COST_LIMIT of the baseline round. */
export function costGuard(current: WriterCost[], baseline: WriterCost[] | null): GuardResult {
  if (!baseline) return { name: "writer-cost", pass: false, detail: "no baseline round metrics", items: [] };
  const missing = current.filter((c) => !baseline.some((b) => b.briefId === c.briefId));
  if (current.length === 0 || missing.length) {
    return { name: "writer-cost", pass: false, detail: `baseline lacks ${missing.length} of ${current.length} pages`, items: missing.map((m) => ({ set: m.set, text: `baseline lacks brief ${m.briefId}` })) };
  }
  const base = baseline.filter((b) => current.some((c) => c.briefId === b.briefId));
  const over: string[] = [];
  for (const key of ["toolCalls", "tokens"] as const) {
    const ratio = mean(current.map((c) => c[key])) / mean(base.map((b) => b[key]));
    if (ratio > COST_LIMIT) over.push(`${key} per page ${(ratio * 100).toFixed(0)}% of baseline`);
  }
  return { name: "writer-cost", pass: over.length === 0, detail: over.length ? over.join(", ") : `within ${COST_LIMIT * 100}% of baseline on ${current.length} pages`, items: [] };
}

/**
 * The report the builder reads. It is built from climb and set-free items only. The held-out set appears only
 * as each judge's set-level scores and counts of its failures and guard items: no page, brief id, finding or failure text.
 */
export function builderReport(gate: GateResult, pages: PageScore[]) {
  const shown = (items: GateItem[]) => items.filter((i) => i.set !== "held-out").map((i) => i.text);
  const heldOut = (items: GateItem[]) => items.filter((i) => i.set === "held-out").length;
  return {
    pass: gate.pass,
    guards: gate.guards.map((g) => ({ name: g.name, pass: g.pass, detail: g.detail, items: shown(g.items), heldOutItems: heldOut(g.items) })),
    failures: shown(gate.failures),
    heldOutFailures: heldOut(gate.failures),
    scores: gate.scores,
    climbPages: pages.filter((p) => p.set === "climb").map((p) => ({
      judge: p.judge, briefId: p.briefId, samples: p.samples.length, categories: pageMedian(p.samples).categories, findings: mergeFindings(p.samples),
    })),
  };
}

/** One lane judge's scores of one page: one reply per sample, in sample order. The gate reads only their median. */
export interface LanePageScore { judge: string; set: BriefSet; briefId: number; samples: LaneReply[] }
export interface LaneSetScores {
  criteria: Record<string, { mean: number; min: number }>;
  categories: Record<PageCategory, { mean: number; min: number }>;
  pages: number;
}
export type LaneScores = Record<string, Partial<Record<BriefSet, LaneSetScores>>>;
export interface LaneGateResult { pass: boolean; failures: GateItem[]; scores: LaneScores; guards: GuardResult[] }

/** The median over a page's samples of each criterion score and each category score. */
export function lanePageMedian(samples: LaneReply[], criteriaIds: string[]) {
  return {
    criteria: Object.fromEntries(criteriaIds.map((id) => [id, median(samples.map((s) => s.criteria[id]!))])),
    categories: Object.fromEntries(PAGE_CATEGORIES.map((c) => [c, median(samples.map((s) => s.categories[c]))])) as Record<PageCategory, number>,
  };
}

/** One lane judge's scores over one set: for each criterion and category, the mean and lowest of the page medians. */
export function laneSetScores(pages: LanePageScore[], criteriaIds: string[]): LaneSetScores {
  const medians = pages.map((p) => lanePageMedian(p.samples, criteriaIds));
  return {
    criteria: Object.fromEntries(criteriaIds.map((id) => [id, meanMin(medians.map((m) => m.criteria[id]!))])),
    categories: Object.fromEntries(PAGE_CATEGORIES.map((c) => [c, meanMin(medians.map((m) => m.categories[c]))])) as LaneSetScores["categories"],
    pages: pages.length,
  };
}

/**
 * Page-category guard of a lane round: a lane may not buy its criteria with the rest of the page. It fails when a
 * judge's mean in a category on a set falls more than CATEGORY_DROP below the baseline round's. A judge or set the
 * baseline did not score is not compared. With no baseline, it passes and this round's scores become the baseline.
 */
export function categoryGuard(current: LaneScores, baseline: LaneScores | null): GuardResult {
  if (!baseline) return { name: "page-categories", pass: true, detail: "baseline recorded", items: [] };
  const items: GateItem[] = [];
  for (const [judge, sets] of Object.entries(current)) for (const set of SETS) {
    const now = sets[set];
    const before = baseline[judge]?.[set];
    if (!now || !before) continue;
    for (const c of PAGE_CATEGORIES) {
      // In whole hundredths, as `mean` sums them: 8.3 - 7.8 is 0.5000000000000009 in floats, and an exact 0.5 must pass.
      const drop = hundredths(before.categories[c].mean) - hundredths(now.categories[c].mean);
      if (drop > hundredths(CATEGORY_DROP)) items.push({ set, text: `${judge} ${set} ${c}: mean ${now.categories[c].mean.toFixed(2)}, baseline ${before.categories[c].mean.toFixed(2)}` });
    }
  }
  const detail = items.length ? `${items.length} page-category mean(s) fell more than ${CATEGORY_DROP} below the baseline` : `no page-category mean fell more than ${CATEGORY_DROP} below the baseline`;
  return { name: "page-categories", pass: items.length === 0, detail, items };
}

/**
 * The lane gate passes only when every counting judge gives a mean of TARGET or more on every criterion, on both
 * the climb set and the held-out set, and every guard passes. The page-category guard joins `guards` here.
 */
export function evaluateLaneGate(pages: LanePageScore[], countingJudges: string[], criteriaIds: string[], guards: GuardResult[], baseline: LaneScores | null): LaneGateResult {
  const failures: GateItem[] = [];
  const scores: LaneScores = {};
  for (const judge of countingJudges) {
    scores[judge] = {};
    for (const set of SETS) {
      const mine = pages.filter((p) => p.judge === judge && p.set === set);
      if (mine.length === 0) { failures.push({ set, text: `${judge} ${set}: no pages scored` }); continue; }
      const result = laneSetScores(mine, criteriaIds);
      scores[judge][set] = result;
      for (const id of criteriaIds) {
        const m = result.criteria[id]!.mean;
        if (m < TARGET) failures.push({ set, text: `${judge} ${set} ${id}: mean ${m.toFixed(2)} < ${TARGET}` });
      }
    }
  }
  const all = [...guards, categoryGuard(scores, baseline)];
  for (const guard of all) if (!guard.pass) failures.push({ set: null, text: `guard ${guard.name}: ${guard.detail}` });
  return { pass: failures.length === 0, failures, scores, guards: all };
}

/** The lane report the builder reads: held-out scores and counts only, as builderReport does for a whole-page round. */
export function laneBuilderReport(gate: LaneGateResult, pages: LanePageScore[], criteriaIds: string[]) {
  const shown = (items: GateItem[]) => items.filter((i) => i.set !== "held-out").map((i) => i.text);
  const heldOut = (items: GateItem[]) => items.filter((i) => i.set === "held-out").length;
  return {
    pass: gate.pass,
    guards: gate.guards.map((g) => ({ name: g.name, pass: g.pass, detail: g.detail, items: shown(g.items), heldOutItems: heldOut(g.items) })),
    failures: shown(gate.failures),
    heldOutFailures: heldOut(gate.failures),
    scores: gate.scores,
    climbPages: pages.filter((p) => p.set === "climb").map((p) => ({
      judge: p.judge, briefId: p.briefId, samples: p.samples.length, ...lanePageMedian(p.samples, criteriaIds), findings: mergeFindings(p.samples),
    })),
  };
}
