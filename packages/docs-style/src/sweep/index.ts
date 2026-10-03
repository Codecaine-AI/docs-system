/**
 * The style sweep: every tier over a set of pages, in memory only. Tier 1 and the autofixes run on
 * every page. Tiers 2 and 3 run on the deep pages, and all rewrite calls share one pool. With a
 * Verifier, every autofix and every rewrite must keep the block's meaning to be accepted.
 */
import type { DocDocument } from "@codecaine-ai/docs-model";
import {
  JudgeUnavailable,
  type BlockChange,
  type PageResult,
  type StyleFinding,
  type SweepEvent,
  type SweepOptions,
  type SweepPage,
  type SweepResult,
} from "../types";
import { applyAutofixes, autofixCandidates, type AutofixCandidate } from "./autofix";
import { exemptBlockIds } from "./exempt";
import { queueJudge } from "./judge-queue";
import { createLimiter } from "./limit";
import { checkAutofixes, limitVerifier } from "./meaning";
import { rewriteExemption, scopeFor, type Scope } from "./scope";
import { changeKey, docHash } from "./stage";
import { lintPage, pageStats } from "./tier1";
import { answerKey, judgePage, withAnswer, type JudgedPage } from "./tier2";
import { applyRewrites, planRewrites, reuseRewrite, rewriteKey, runRewrite } from "./tier3";

export { loadCorpus } from "./corpus";
export { pickPilotPages } from "./pilot";
export { exemptBlockIds } from "./exempt";
export { scopeFor, type Scope } from "./scope";
export { changeKey, docHash, planStage, stageOps } from "./stage";
export { lintPage, lintStyle, pageStats } from "./tier1";

/** Why Tier 3 skips without a working Judge: a rewrite Jev cannot fact-check is never accepted. */
const NEEDS_JEV = "the fact check needs Jev";
/** Why Tier 3 skips without a Verifier: a rewrite Sol cannot compare is never accepted. */
const NEEDS_VERIFIER = "the meaning check needs a verifier";

/** Rewrite calls in flight at once when SweepOptions.concurrency is not set. */
const DEFAULT_CONCURRENCY = 16;
/**
 * Pages judged at once. Each page sends its questions in one call that the Judge runs in parallel,
 * so pages take turns, and each page starts its rewrites as soon as its own answers are in.
 */
const JUDGE_PAGES = 1;

export async function sweep(options: SweepOptions): Promise<SweepResult> {
  const startedAt = new Date().toISOString();
  const emit = (event: SweepEvent) => options.onEvent?.(event);
  const isDeep = (path: string) => !options.deepPages || options.deepPages.has(path);
  const scope = scopeFor(options.corpus);
  const concurrency = options.concurrency && options.concurrency >= 1 ? Math.floor(options.concurrency) : DEFAULT_CONCURRENCY;
  const rewriteSlot = createLimiter(concurrency);
  const judgeSlot = createLimiter(JUDGE_PAGES);
  // Tier 2 and the fact-check guardrail share one queue, so Jev never sees more than one call at once.
  const judge = options.judge && queueJudge(options.judge);
  // Autofix checks and rewrite checks share one pool of Sol calls.
  const verifier = options.verifier && limitVerifier(options.verifier, concurrency);
  // False once Jev throws JudgeUnavailable: Tier 2 skips for the rest of the run, and so does Tier 3.
  let judgeUp = !!judge;
  let judgeError: string | undefined;
  const rewriteSkipped = new Set<string>();
  const models = new Set<string>();
  // One outcome per rewrite input, so shared boilerplate gets the same rewrite on every page and
  // only its first occurrence pays for model calls.
  const rewrites = new Map<string, Promise<{ change: BlockChange; key: string }>>();

  async function tier2(page: SweepPage, findings: StyleFinding[], exempt: ReadonlySet<string>): Promise<JudgedPage | undefined> {
    if (!judgeUp) {
      emit({ type: "tier", path: page.path, tier: 2, detail: "skipped: the judge is unavailable" });
      return undefined;
    }
    try {
      const judged = await judgePage(page.doc, findings, judge!, scope.rules, exempt);
      const added = judged.findings.filter((finding) => finding.tier === 2).length;
      emit({ type: "tier", path: page.path, tier: 2, detail: `${judged.answers.size} answers, ${added} findings` });
      return judged;
    } catch (error) {
      if (error instanceof JudgeUnavailable) {
        judgeUp = false;
        judgeError ??= messageOf(error);
      }
      emit({ type: "tier", path: page.path, tier: 2, detail: `skipped: ${messageOf(error)}` });
      return undefined;
    }
  }

  async function tier3(
    path: string,
    working: DocDocument,
    judged: JudgedPage | undefined,
    exempt: ReadonlySet<string>,
  ): Promise<BlockChange[]> {
    // Checked per page: Jev can go down after earlier pages started their rewrites.
    const blockers = [rewriteExemption(scope), !judgeUp && NEEDS_JEV, !verifier && NEEDS_VERIFIER].filter(
      (reason): reason is string => !!reason,
    );
    if (blockers.length) {
      const reason = blockers.join(", and ");
      rewriteSkipped.add(reason);
      emit({ type: "tier", path, tier: 3, detail: `skipped: ${reason}` });
      return [];
    }
    const jobs = planRewrites(path, working, rewriteFindings(path, working, judged, scope), exempt);
    emit({ type: "tier", path, tier: 3, detail: `${jobs.length} blocks to rewrite` });
    const services = { rewriter: options.rewriter!, judge, verifier };
    return Promise.all(
      jobs.map(async (job) => {
        const input = rewriteKey(job);
        const earlier = rewrites.get(input);
        let change: BlockChange;
        if (earlier) {
          const first = await earlier;
          change = reuseRewrite(first.change, first.key, job);
        } else {
          const pending = rewriteSlot(async () => {
            const fresh = await runRewrite(job, services);
            for (const attempt of fresh.attempts ?? []) if (attempt.model) models.add(attempt.model);
            return { change: fresh, key: changeKey(path, fresh) };
          });
          rewrites.set(input, pending);
          change = (await pending).change;
        }
        emit({ type: "rewrite", path, blockId: job.block.id, status: change.status });
        return change;
      }),
    );
  }

  /**
   * The autofixes of one page. The re-lint guard runs first, so Sol is asked only about fixes that
   * could land. When Sol refuses one, the guard runs again without it, and without every fix it did
   * not check, so no fix lands unchecked.
   */
  async function autofix(
    page: SweepPage,
    findings: StyleFinding[],
    candidates: AutofixCandidate[],
    guarded: { doc: DocDocument; changes: BlockChange[] },
  ): Promise<{ doc: DocDocument; changes: BlockChange[] }> {
    if (!verifier) return guarded;
    const checked = await checkAutofixes(page.doc, guarded.changes, verifier, (verdict) => models.add(verdict.model));
    const refused = [...checked.values()].filter((change) => change.status !== "accepted");
    const fixed = refused.length
      ? applyAutofixes(
          page.doc,
          findings,
          candidates,
          scope.rules,
          new Map([...guarded.changes.filter((change) => change.status !== "accepted"), ...refused].map((change) => [change.blockId, change])),
        )
      : guarded;
    const changes = fixed.changes.map((change) => (change.status === "accepted" ? { ...change, verdict: checked.get(change.blockId)?.verdict } : change));
    return { doc: fixed.doc, changes };
  }

  // Tier 1 and the guarded autofixes cost nothing, so every page gets them before any service call.
  const linted = options.pages.map((page) => {
    emit({ type: "page-start", path: page.path });
    // Exempt sections are examples of bad writing: no tier reports or changes them.
    const exempt = exemptBlockIds(page.path, page.doc, scope.exemptions);
    const findings = lintPage(page.path, page.doc, scope);
    const candidates = autofixCandidates(page.doc, scope.rules, exempt);
    const guarded = applyAutofixes(page.doc, findings, candidates, scope.rules);
    emit({ type: "tier", path: page.path, tier: 1, detail: `${findings.length} findings, ${guarded.changes.length} autofixes` });
    return { page, findings, candidates, guarded, exempt };
  });

  const pages = await Promise.all(
    linted.map(async ({ page, findings, candidates, guarded, exempt }): Promise<PageResult> => {
      const deep = isDeep(page.path);
      const fixed = await autofix(page, findings, candidates, guarded);
      const judged = deep && judge ? await judgeSlot(() => tier2(page, findings, exempt)) : undefined;
      let after = fixed.doc;
      const changes = [...fixed.changes];
      if (deep && options.rewriter) {
        const applied = applyRewrites(after, await tier3(page.path, after, judged, exempt));
        after = applied.doc;
        changes.push(...applied.changes);
      }
      const result: PageResult = {
        path: page.path,
        baseHash: docHash(page.doc),
        title: page.doc.title ?? page.path,
        stats: pageStats(page.doc),
        findings: judged?.findings ?? findings,
        deep,
        changes,
        findingsAfter: lintPage(page.path, after, scope),
        wordsAfter: pageStats(after).words,
        after,
      };
      emit({ type: "page-done", path: page.path });
      return result;
    }),
  );

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    config: {
      ...(options.corpus ? { corpus: options.corpus } : {}),
      judge: judgeUp,
      ...(judgeError ? { judgeError } : {}),
      rewriter: !!options.rewriter,
      ...(rewriteSkipped.size ? { rewriteSkipped: [...rewriteSkipped].join("; ") } : {}),
      models: [...models].sort(),
      deepPages: options.pages.filter((page) => isDeep(page.path)).map((page) => page.path),
    },
    pages,
  };
}

/**
 * Tier 3 reads the page after its autofixes, so its Tier 1 findings come from a fresh lint. Jev's
 * Tier 2 answers still hold: an autofix swaps words, and the blocks Jev judged keep their IDs.
 */
function rewriteFindings(path: string, working: DocDocument, judged: JudgedPage | undefined, scope: Scope): StyleFinding[] {
  const fresh = lintPage(path, working, scope);
  if (!judged) return fresh;
  const withAnswers = fresh.map((finding) => withAnswer(finding, judged.answers.get(answerKey(finding.ruleId, finding.blockId))));
  return [...withAnswers, ...judged.findings.filter((finding) => finding.tier === 2)];
}

function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").trim();
}
