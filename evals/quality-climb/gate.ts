// Pure gate rules of the quality climb: category and block-group means, the page floor, the guards,
// and the builder-facing report that never shows held-out pages or findings.
import { BLOCK_GROUPS, PAGE_CATEGORIES, SETS, type BlockGroup, type BriefSet, type JudgeReply, type PageCategory } from "./schema";

export const TARGET = 9.5;
export const PAGE_FLOOR = 9;
export const COST_LIMIT = 1.2;

/** One judge's score of one page. `groups` maps each scored block id to its block-type group. */
export interface PageScore {
  judge: string;
  set: BriefSet;
  briefId: number;
  reply: JudgeReply;
  groups: Record<string, BlockGroup>;
}
export interface WriterCost { briefId: number; toolCalls: number; tokens: number }
export interface GuardResult { name: "tests" | "lint" | "writer-cost"; pass: boolean; detail: string }
export interface SetScores {
  categories: Record<PageCategory, { mean: number; min: number }>;
  groups: Partial<Record<BlockGroup, { mean: number; blocks: number }>>;
}
export interface GateResult {
  pass: boolean;
  failures: string[];
  scores: Record<string, Partial<Record<BriefSet, SetScores>>>;
  guards: GuardResult[];
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/** One judge's scores over one set: each category's mean and lowest page, and each group's mean over its blocks. */
export function setScores(pages: PageScore[]): SetScores {
  const categories = Object.fromEntries(PAGE_CATEGORIES.map((c) => {
    const values = pages.map((p) => p.reply.categories[c]);
    return [c, { mean: mean(values), min: Math.min(...values) }];
  })) as SetScores["categories"];
  const byGroup = new Map<BlockGroup, number[]>();
  for (const page of pages) for (const block of page.reply.blocks) {
    const group = page.groups[block.id];
    if (group) byGroup.set(group, [...(byGroup.get(group) ?? []), block.score]);
  }
  const groups: SetScores["groups"] = {};
  for (const [group, values] of byGroup) groups[group] = { mean: mean(values), blocks: values.length };
  return { categories, groups };
}

/**
 * The gate passes only when every counting judge reaches TARGET in every category and every block group
 * on both sets, no page scores below PAGE_FLOOR in any category, and every guard passes.
 */
export function evaluateGate(pages: PageScore[], countingJudges: string[], guards: GuardResult[]): GateResult {
  const failures: string[] = [];
  const scores: GateResult["scores"] = {};
  for (const judge of countingJudges) {
    scores[judge] = {};
    for (const set of SETS) {
      const mine = pages.filter((p) => p.judge === judge && p.set === set);
      if (mine.length === 0) { failures.push(`${judge} ${set}: no pages scored`); continue; }
      const result = setScores(mine);
      scores[judge][set] = result;
      for (const c of PAGE_CATEGORIES) {
        const { mean: m, min } = result.categories[c];
        if (m < TARGET) failures.push(`${judge} ${set} ${c}: mean ${m.toFixed(2)} < ${TARGET}`);
        if (min < PAGE_FLOOR) failures.push(`${judge} ${set} ${c}: a page scored ${min} < ${PAGE_FLOOR}`);
      }
      for (const g of BLOCK_GROUPS) {
        const group = result.groups[g];
        if (!group) failures.push(`${judge} ${set} ${g}: no blocks of this group`);
        else if (group.mean < TARGET) failures.push(`${judge} ${set} ${g}: mean ${group.mean.toFixed(2)} < ${TARGET}`);
      }
    }
  }
  for (const guard of guards) if (!guard.pass) failures.push(`guard ${guard.name}: ${guard.detail}`);
  return { pass: failures.length === 0, failures, scores, guards };
}

/** Tests guard: every check command exited 0. A check that did not run fails the guard. */
export function testsGuard(checks: { command: string; exitCode: number | null }[]): GuardResult {
  if (checks.length === 0) return { name: "tests", pass: false, detail: "no checks ran" };
  const failed = checks.filter((c) => c.exitCode !== 0);
  return { name: "tests", pass: failed.length === 0, detail: failed.length ? `failed: ${failed.map((c) => `${c.command} (exit ${c.exitCode ?? "not run"})`).join(", ")}` : `${checks.length} checks passed` };
}

/** Lint guard: every page has zero blocking docs_check findings under the snapshot rules. Held-out pages are only counted. */
export function lintGuard(pages: { set: BriefSet; briefId: number; blocking: number }[], rules: string): GuardResult {
  const bad = pages.filter((p) => p.blocking > 0);
  const climb = bad.filter((p) => p.set === "climb").map((p) => `brief ${p.briefId} (${p.blocking})`);
  const heldOut = bad.length - climb.length;
  const detail = bad.length
    ? `blocking findings under ${rules}: ${[...climb, ...(heldOut ? [`${heldOut} held-out page(s)`] : [])].join(", ")}`
    : `0 blocking findings on ${pages.length} pages under ${rules}`;
  return { name: "lint", pass: pages.length > 0 && bad.length === 0, detail };
}

/** Writer-cost guard: tool calls and tokens per page, over the same briefs, stay within COST_LIMIT of the baseline round. */
export function costGuard(current: WriterCost[], baseline: WriterCost[] | null): GuardResult {
  if (!baseline) return { name: "writer-cost", pass: false, detail: "no baseline round metrics" };
  const missing = current.filter((c) => !baseline.some((b) => b.briefId === c.briefId));
  if (current.length === 0 || missing.length) return { name: "writer-cost", pass: false, detail: `baseline lacks briefs ${missing.map((m) => m.briefId).join(", ")}` };
  const base = baseline.filter((b) => current.some((c) => c.briefId === b.briefId));
  const over: string[] = [];
  for (const key of ["toolCalls", "tokens"] as const) {
    const ratio = mean(current.map((c) => c[key])) / mean(base.map((b) => b[key]));
    if (ratio > COST_LIMIT) over.push(`${key} per page ${(ratio * 100).toFixed(0)}% of baseline`);
  }
  return { name: "writer-cost", pass: over.length === 0, detail: over.length ? over.join(", ") : `within ${COST_LIMIT * 100}% of baseline on ${current.length} pages` };
}

/**
 * The report the builder reads. Climb pages keep their scores and findings. The held-out set appears only
 * as each judge's set-level scores: no page, brief id, finding or failure text.
 */
export function builderReport(gate: GateResult, pages: PageScore[]) {
  return {
    pass: gate.pass,
    guards: gate.guards,
    failures: gate.failures.filter((f) => !f.includes(" held-out ")),
    heldOutFailures: gate.failures.filter((f) => f.includes(" held-out ")).length,
    scores: gate.scores,
    climbPages: pages.filter((p) => p.set === "climb").map((p) => ({ judge: p.judge, briefId: p.briefId, categories: p.reply.categories, findings: p.reply.findings })),
  };
}
