/**
 * The numbers behind the report, computed once from a SweepResult. Pure functions, no markup.
 *
 * "Deep" numbers compare each deep page before and after its accepted changes. They count Tier 1
 * findings only, because Tier 2 findings are not judged again after a rewrite. For the same
 * reason they count Tier 1 matches as linted, Jev's answers aside, on both sides.
 *
 * Every other count uses only the findings that stand: a Tier 1 match that Jev judged below
 * its rule's threshold (overruled) is not a problem the sweep caught.
 */
import type { BlockChange, GuardrailId, PageResult, StyleFinding, SweepResult } from "../types";
import { plural, relativeChange, signedPct } from "./html";

export interface Pair {
  before: number;
  after: number;
}

export interface ChangeCounts {
  /** Autofixes, any status. */
  autofix: number;
  /** Rewrites by status. Unchanged means the model returned the block as it was. */
  accepted: number;
  rejected: number;
  error: number;
  unchanged: number;
  /** Accepted rewrites that turn a block into a lead plus bullets. */
  structural: number;
  /** Accepted rewrites the pipeline flagged for extra care (see needsReview). */
  needsReview: number;
  total: number;
}

export interface Summary {
  /** Set when the Judge went down mid-run, so Tier 2 and the fact checks were skipped. */
  judgeError?: string;
  /** Which deep tiers had an adapter. */
  tiers: { judge: boolean; rewriter: boolean };
  pages: number;
  deepPages: number;
  /** Findings that stand, and how many Tier 1 matches Jev overruled. */
  findings: number;
  tier1: number;
  tier2: number;
  overruled: number;
  autofixes: number;
  /**
   * total is accepted + rejected + error, the base of the acceptance rate. unchanged rewrites
   * stand apart: there was nothing to judge. needsReview counts accepted rewrites the pipeline
   * flagged, such as "fact check unavailable".
   */
  rewrites: { accepted: number; rejected: number; error: number; total: number; unchanged: number; needsReview: number };
  deepWords: Pair;
  /** Tier 1 findings on deep pages. */
  deepFindings: Pair;
  deepStructure: Pair;
  deepVocabulary: Pair;
}

export interface RuleRow {
  ruleId: string;
  source: string;
  layer: string;
  /** "1", "2", or "1+2". */
  tiers: string;
  /** Findings that stand. */
  findings: number;
  /** Tier 1 matches that Jev judged below the rule's threshold. */
  overruled: number;
  pages: number;
  autofixable: number;
  /** Tier 1 findings of this rule on deep pages, before and after. */
  deep: Pair;
  /** Tier 2 findings of this rule on deep pages (not judged again after a rewrite). */
  deepTier2: number;
  hint: string;
}

export interface ReviewPage {
  /** Position in SweepResult.pages; anchors use it. */
  index: number;
  page: PageResult;
  counts: ChangeCounts;
  /** Tier 1 findings before and after. */
  findings: Pair;
  tier2: number;
  words: Pair;
  /** How much the page needs a look; 0 means it needs none. */
  score: number;
  /** Why it needs a look, strongest reason first. */
  reasons: string[];
}

export interface Example {
  pageIndex: number;
  path: string;
  /** The sentence when the finding has one, else the evidence. */
  text: string;
  evidence: string;
  message: string;
  tier: 1 | 2;
  probability?: number;
}

/** True when a finding counts: any Tier 2 finding, and any Tier 1 match Jev did not overrule. */
export function stands(finding: StyleFinding): boolean {
  return finding.tier === 2 || !finding.overruled;
}

export function isReviewable(change: BlockChange): boolean {
  return change.kind === "rewrite" && change.status === "accepted";
}

/**
 * An accepted rewrite that carries a reason, such as "needs review: fact check unavailable". It
 * passed every guardrail that could run, but one could not, so the owner must read it with care.
 */
export function needsReview(change: BlockChange): boolean {
  return isReviewable(change) && !!change.reason?.trim();
}

/** A structural rewrite: a lead line plus "- " bullet lines. */
export function isStructural(change: BlockChange): boolean {
  return /\n[ \t]*- /.test(change.after);
}

export function countChanges(changes: readonly BlockChange[]): ChangeCounts {
  const counts: ChangeCounts = {
    autofix: 0,
    accepted: 0,
    rejected: 0,
    error: 0,
    unchanged: 0,
    structural: 0,
    needsReview: 0,
    total: changes.length,
  };
  for (const change of changes) {
    if (change.kind === "autofix") {
      counts.autofix++;
      continue;
    }
    if (change.status === "accepted" || change.status === "rejected" || change.status === "error" || change.status === "unchanged") {
      counts[change.status]++;
    }
    if (isReviewable(change) && isStructural(change)) counts.structural++;
    if (needsReview(change)) counts.needsReview++;
  }
  return counts;
}

const tier1 = (findings: readonly StyleFinding[]) => findings.filter((f) => f.tier === 1);
const ofLayer = (findings: readonly StyleFinding[], layer: string) => findings.filter((f) => f.layer === layer).length;

export function summarize(result: SweepResult): Summary {
  const deep = result.pages.filter((p) => p.deep);
  const raw = result.pages.flatMap((p) => p.findings);
  const all = raw.filter(stands);
  const changes = result.pages.flatMap((p) => p.changes);
  const allRewrites = changes.filter((c) => c.kind === "rewrite");
  const rewrites = allRewrites.filter((c) => c.status !== "unchanged");
  const before = deep.flatMap((p) => tier1(p.findings));
  const after = deep.flatMap((p) => p.findingsAfter);
  return {
    judgeError: result.config.judgeError?.trim() || undefined,
    tiers: { judge: !!result.config.judge, rewriter: !!result.config.rewriter },
    pages: result.pages.length,
    deepPages: deep.length,
    findings: all.length,
    tier1: all.filter((f) => f.tier === 1).length,
    tier2: all.filter((f) => f.tier === 2).length,
    overruled: raw.length - all.length,
    autofixes: changes.filter((c) => c.kind === "autofix" && c.status === "accepted").length,
    rewrites: {
      accepted: rewrites.filter((c) => c.status === "accepted").length,
      rejected: rewrites.filter((c) => c.status === "rejected").length,
      error: rewrites.filter((c) => c.status === "error").length,
      total: rewrites.length,
      unchanged: allRewrites.length - rewrites.length,
      needsReview: rewrites.filter(needsReview).length,
    },
    deepWords: { before: sum(deep, (p) => p.stats.words), after: sum(deep, (p) => p.wordsAfter) },
    deepFindings: { before: before.length, after: after.length },
    deepStructure: { before: ofLayer(before, "structure"), after: ofLayer(after, "structure") },
    deepVocabulary: { before: ofLayer(before, "vocabulary"), after: ofLayer(after, "vocabulary") },
  };
}

/** The one-line verdict, such as "62 of 80 rewrites passed every guardrail. Deep pages lost 3% of words." */
export function headline(s: Summary): string {
  const parts: string[] = [];
  const { accepted, total, needsReview: flagged } = s.rewrites;
  parts.push(total > 0 ? `${accepted} of ${plural(total, "rewrite")} passed every guardrail.` : "No block was rewritten.");
  if (flagged > 0) parts.push(`${flagged} of them ${flagged === 1 ? "needs" : "need"} review.`);
  if (s.deepPages === 0) {
    parts.push("No page ran the deep tiers.");
    return parts.join(" ");
  }
  const words = relativeChange(s.deepWords.before, s.deepWords.after);
  if (words !== undefined) {
    const shown = signedPct(words);
    if (shown === "0%") parts.push("Deep pages kept their word count.");
    else if (words < 0) parts.push(`Deep pages lost ${shown.slice(1)} of words.`);
    else parts.push(`Deep pages grew ${shown.slice(1)} in words.`);
  }
  const { before, after } = s.deepStructure;
  const structure = relativeChange(before, after);
  if (structure === undefined) {
    parts.push(after > 0 ? `Structure findings rose from 0 to ${after}.` : "Deep pages had no structure findings.");
  } else {
    const shown = signedPct(structure);
    if (shown === "0%") parts.push("Structure findings did not change.");
    else parts.push(`Structure findings ${structure < 0 ? "fell" : "rose"} ${shown.slice(1)}.`);
  }
  return parts.join(" ");
}

export function ruleRows(result: SweepResult): RuleRow[] {
  const rows = new Map<string, { row: RuleRow; pages: Set<string>; sources: Set<string>; layers: Set<string>; tiers: Set<number> }>();
  const entry = (f: StyleFinding) => {
    let e = rows.get(f.ruleId);
    if (!e) {
      const row: RuleRow = {
        ruleId: f.ruleId,
        source: "",
        layer: "",
        tiers: "",
        findings: 0,
        overruled: 0,
        pages: 0,
        autofixable: 0,
        deep: { before: 0, after: 0 },
        deepTier2: 0,
        hint: f.hint,
      };
      e = { row, pages: new Set(), sources: new Set(), layers: new Set(), tiers: new Set() };
      rows.set(f.ruleId, e);
    }
    e.sources.add(f.source);
    e.layers.add(f.layer);
    return e;
  };
  for (const page of result.pages) {
    for (const f of page.findings) {
      const e = entry(f);
      e.tiers.add(f.tier);
      if (page.deep && f.tier === 1) e.row.deep.before++;
      if (page.deep && f.tier === 2) e.row.deepTier2++;
      if (!stands(f)) {
        e.row.overruled++;
        continue;
      }
      e.row.findings++;
      e.pages.add(page.path);
      if (f.autofixable) e.row.autofixable++;
    }
    if (!page.deep) continue;
    for (const f of page.findingsAfter) entry(f).row.deep.after++;
  }
  return [...rows.values()]
    .map(({ row, pages, sources, layers, tiers }) => ({
      ...row,
      pages: pages.size,
      source: sources.size === 1 ? [...sources][0]! : "mixed",
      layer: layers.size === 1 ? [...layers][0]! : "mixed",
      tiers: [...tiers].sort().join("+") || "–",
    }))
    .sort((a, b) => b.findings - a.findings || a.ruleId.localeCompare(b.ruleId));
}

/**
 * The pages panel D shows: every deep page, plus any other page with a change. Ordered by
 * accepted rewrites, then by all changes, then by sweep order.
 */
export function reviewPages(result: SweepResult, flagged: (path: string, change: BlockChange) => boolean = () => false): ReviewPage[] {
  return result.pages
    .map((page, index) => reviewPage(page, index, page.changes.filter((c) => flagged(page.path, c)).length))
    .filter((r) => r.page.deep || r.counts.total > 0)
    .sort((a, b) => b.counts.accepted - a.counts.accepted || b.counts.total - a.counts.total || a.index - b.index);
}

/** The pages to open first: highest score, at most `limit`, never a page that needs no look. */
export function lookFirst(pages: readonly ReviewPage[], limit = 5): ReviewPage[] {
  return pages
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);
}

function reviewPage(page: PageResult, index: number, flaggedByReviewer: number): ReviewPage {
  const counts = countChanges(page.changes);
  const words = { before: page.stats.words, after: page.wordsAfter };
  const wordChange = relativeChange(words.before, words.after);
  const reasons: { weight: number; text: string }[] = [];
  if (flaggedByReviewer) reasons.push({ weight: flaggedByReviewer * 4, text: `${flaggedByReviewer} flagged by the reviewer` });
  if (counts.accepted) reasons.push({ weight: counts.accepted * 3, text: `${plural(counts.accepted, "rewrite")} to review` });
  if (counts.needsReview) {
    const why = page.changes.find(needsReview)?.reason?.replace(/^needs review:\s*/i, "") ?? "";
    reasons.push({ weight: counts.needsReview * 2, text: `${counts.needsReview} ${counts.needsReview === 1 ? "needs" : "need"} review${why ? `: ${why}` : ""}` });
  }
  if (counts.structural) {
    const n = counts.structural;
    reasons.push({ weight: n * 2, text: n === 1 ? "1 block turns into a list" : `${n} blocks turn into lists` });
  }
  if (wordChange !== undefined && wordChange <= -0.05) {
    reasons.push({ weight: 3, text: `words ${signedPct(wordChange)}: check for lost content` });
  }
  if (counts.rejected) {
    const failed = topFailedChecks(page.changes.filter((c) => c.status === "rejected"));
    const by = failed.length ? ` by ${failed.join(", ")}` : "";
    reasons.push({ weight: counts.rejected * 1.5, text: `${counts.rejected} rejected${by}: did the guardrails catch a real problem?` });
  }
  if (counts.error) reasons.push({ weight: counts.error, text: `${plural(counts.error, "error")}: rerun these blocks` });
  reasons.sort((a, b) => b.weight - a.weight);
  return {
    index,
    page,
    counts,
    findings: { before: tier1(page.findings).length, after: page.findingsAfter.length },
    tier2: page.findings.length - tier1(page.findings).length,
    words,
    score: sum(reasons, (r) => r.weight),
    reasons: reasons.slice(0, 3).map((r) => r.text),
  };
}

/** The guardrails that failed most often across these changes, at most two. */
function topFailedChecks(changes: readonly BlockChange[]): GuardrailId[] {
  const counts = new Map<GuardrailId, number>();
  for (const change of changes) {
    for (const check of change.verdict?.checks ?? []) {
      if (!check.ok && !check.skipped) counts.set(check.id, (counts.get(check.id) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => id);
}

/**
 * Up to `perRule` findings per rule. It takes one finding from each page in turn, so the
 * examples come from different pages where it can.
 */
export function ruleExamples(result: SweepResult, perRule = 5): Map<string, Example[]> {
  const byRule = new Map<string, Example[][]>();
  result.pages.forEach((page, pageIndex) => {
    const local = new Map<string, Example[]>();
    for (const f of page.findings.filter(stands)) {
      const list = local.get(f.ruleId) ?? [];
      list.push({
        pageIndex,
        path: page.path,
        text: f.sentence ?? f.evidence,
        evidence: f.evidence,
        message: f.message,
        tier: f.tier,
        probability: f.probability,
      });
      local.set(f.ruleId, list);
    }
    for (const [ruleId, list] of local) byRule.set(ruleId, [...(byRule.get(ruleId) ?? []), list]);
  });
  const out = new Map<string, Example[]>();
  for (const [ruleId, groups] of byRule) {
    const picked: Example[] = [];
    for (let round = 0; picked.length < perRule && groups.some((g) => g.length > round); round++) {
      for (const group of groups) {
        const example = group[round];
        if (example && picked.length < perRule) picked.push(example);
      }
    }
    out.set(ruleId, picked);
  }
  return out;
}

export function layerCounts(findings: readonly StyleFinding[]): { structure: number; vocabulary: number } {
  return { structure: ofLayer(findings, "structure"), vocabulary: ofLayer(findings, "vocabulary") };
}

function sum<T>(items: readonly T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}
