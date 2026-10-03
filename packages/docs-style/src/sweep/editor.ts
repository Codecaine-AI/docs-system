/**
 * The editor flow: the structural rewrites the machine no longer makes (bullets, paragraph splits,
 * tense, condition-first, one instruction per sentence, dash-gloss leftovers) go to editors as
 * jobs, and their answers come back through the guardrails a model rewrite passes. An editor is a
 * Rewriter that answers offline.
 * - exportJobs: one job per block with a finding a person must fix, masked the way the rewrite
 *   model sees a block.
 * - importAnswers: each answer is restored, turned into ops (list form allowed), and checked by
 *   every guardrail. The result is a SweepResult, so batches, decide, apply, and the report read it
 *   unchanged.
 */
import { applyOps, type DocBlock, type DocDocument, type DocOp } from "@codecaine-ai/docs-model";
import { lintRules } from "@codecaine-ai/docs-model/lint";
import { orderedBlocks } from "@codecaine-ai/docs-model/lint/engine";
import { verifyRewrite } from "../guardrails";
import { judgeBlocks } from "../judge";
import { protectSpans, restoreSpans, rewriteToOps } from "../rewrite";
import { ruleById } from "../rules";
import { blockMarkdown, excludedBlockIds } from "../text";
import { nearestHeading } from "../text/context";
import type {
  BlockChange,
  GuardrailId,
  Judge,
  PageResult,
  ProtectedToken,
  StyleFinding,
  StyleRule,
  SweepPage,
  SweepResult,
  Verifier,
} from "../types";
import { blockContext } from "./context";
import { coreRule } from "./core-rules";
import { exemptBlockIds } from "./exempt";
import { createLimiter } from "./limit";
import { limitVerifier } from "./meaning";
import { scopeFor, type Scope } from "./scope";
import { maskedSentences, sentenceKey } from "./sentences";
import { changeKey, docHash, rewriteIdsFor } from "./stage";
import { lintPage, lintStyle, pageStats } from "./tier1";
import { confirmed, judgePage, judgedFinding } from "./tier2";
import { applyRewrites } from "./tier3";

/** The block types an editor rewrites. A callout cannot hold bullets, so its answer stays one block. */
const EDITABLE: ReadonlySet<string> = new Set(["paragraph", "list-item", "callout"]);
/** A sibling's text is context, so a long one is cut. */
const SIBLING_CHARS = 300;
/** The most siblings a job lists, nearest first on each side. */
const SIBLINGS = 40;

/** One block for an editor to rewrite. */
export interface EditorJob {
  /** "page#blockId", the key the answer, the sweep result, and the reviewers use. */
  key: string;
  corpus?: string;
  page: string;
  blockId: string;
  blockType: string;
  /** docHash of the page when the job was made. An answer to a page that changed is refused. */
  baseHash: string;
  /** The block as inline markdown, with each code span, link, and reference as a token "⟦n⟧". */
  markdown: string;
  /** What each token stands for. Every token must come back exactly once. */
  tokens: { token: string; kind: ProtectedToken["kind"]; preview: string }[];
  /** What to fix. A finding with a sentence names the one sentence it is in, in masked form. */
  findings: { rule: string; message: string; hint: string; tier: 1 | 2; sentence?: string }[];
  heading?: string;
  previous?: string;
  next?: string;
  /** The parent list item, for a nested list item. */
  parent?: string;
  /** The blocks of the block's section, in order, for hierarchy decisions. The block is marked. */
  siblings: { blockId: string; blockType: string; text: string; self?: true }[];
  /** An editor may answer with a lead line plus "- " and "  - " bullet lines. */
  allowList: true;
}

/** One editor answer: the masked markdown of the block, which may hold a lead line plus bullets. */
export interface EditorAnswer {
  key: string;
  markdown: string;
  /** Who wrote it, for the report. Default "editor". */
  editor?: string;
}

/**
 * The rules editors fix by default: every structure rule that the sweep does not rewrite (its
 * rewrite mode is "none", or a core rule has none), plus the em dashes and semicolons a sweep left.
 * A rule that holds its block is left out: a person repairs held text by hand.
 */
export function defaultJobRules(rules: readonly StyleRule[]): Set<string> {
  const ids = new Set(["writing.no-em-dash", "writing.semicolon"]);
  for (const rule of rules) if (rule.layer === "structure" && rule.rewrite === "none") ids.add(rule.id);
  for (const rule of lintRules) {
    const core = coreRule(rule.id);
    if (core.layer === "structure" && !core.rewrite) ids.add(rule.id);
  }
  return ids;
}

export interface ExportOptions {
  pages: readonly SweepPage[];
  corpus?: string;
  /** The rule IDs to make jobs for. Default: defaultJobRules. */
  rules?: ReadonlySet<string>;
  /** Asks Jev the judge-only rules in the set. Without it, those rules make no jobs. */
  judge?: Judge;
}

export interface ExportResult {
  jobs: EditorJob[];
  /** Blocks with a finding that no job covers: held for a person, or in an exempt section. */
  held: number;
  exempt: number;
}

/** One job per editable block with a finding from the rule set. Exempt and held blocks get none. */
export async function exportJobs(options: ExportOptions): Promise<ExportResult> {
  const scope = scopeFor(options.corpus);
  const wanted = options.rules ?? defaultJobRules(scope.rules);
  const judgeRules = scope.rules.filter((rule) => wanted.has(rule.id) && rule.judge);
  const result: ExportResult = { jobs: [], held: 0, exempt: 0 };
  for (const { path, doc } of options.pages) {
    const exempt = exemptBlockIds(path, doc, scope.exemptions);
    // lintPage drops what an exempt section holds, so the count of skipped blocks reads the raw lint.
    if (exempt.size) result.exempt += countExempt(doc, exempt, wanted, scope);
    let findings = lintPage(path, doc, scope);
    if (options.judge && judgeRules.length) findings = (await judgePage(doc, findings, options.judge, judgeRules, exempt)).findings;
    const blocks = orderedBlocks(doc);
    const excluded = excludedBlockIds({ document: doc, blocks });
    const held = new Set(findings.filter((f) => f.blockId && confirmed(f) && ruleById(f.ruleId)?.rewrite === "hold").map((f) => f.blockId!));
    for (const block of blocks) {
      if (!EDITABLE.has(block.type) || !block.text?.length || excluded.has(block.id)) continue;
      const own = findings.filter((f) => f.blockId === block.id && f.field === "text" && confirmed(f) && wanted.has(f.ruleId));
      if (!own.length || exempt.has(block.id)) continue;
      if (held.has(block.id)) result.held += 1;
      else result.jobs.push(jobFor(path, doc, block, own, options.corpus));
    }
  }
  return result;
}

/** Exempt editable blocks with a Tier 1 finding from the rule set: the jobs an exemption keeps out. */
function countExempt(doc: DocDocument, exempt: ReadonlySet<string>, wanted: ReadonlySet<string>, scope: Scope): number {
  const blocks = new Set(
    lintStyle(doc, scope.rules)
      .filter((finding) => finding.blockId && exempt.has(finding.blockId) && finding.field === "text" && wanted.has(finding.ruleId))
      .map((finding) => finding.blockId!),
  );
  return [...blocks].filter((id) => EDITABLE.has(doc.blocks[id]?.type ?? "")).length;
}

function jobFor(path: string, doc: DocDocument, block: DocBlock, findings: readonly StyleFinding[], corpus: string | undefined): EditorJob {
  const { markdown, tokens } = protectSpans(block.text ?? []);
  const units = maskedSentences(markdown, tokens);
  const placed = (sentence: string | undefined) => (sentence ? units.find((unit) => unit.key === sentenceKey(sentence))?.masked : undefined);
  const context = blockContext(doc, block.id);
  return {
    key: changeKey(path, { blockId: block.id, kind: "rewrite" }),
    ...(corpus ? { corpus } : {}),
    page: path,
    blockId: block.id,
    blockType: block.type,
    baseHash: docHash(doc),
    markdown,
    tokens: tokens.map(({ token, kind, preview }) => ({ token, kind, preview })),
    findings: findings.map((finding) => {
      const sentence = placed(finding.sentence);
      return { rule: finding.ruleId, message: finding.message, hint: finding.hint, tier: finding.tier, ...(sentence ? { sentence } : {}) };
    }),
    ...withoutEmpty(context),
    siblings: siblingsOf(doc, block.id),
    allowList: true,
  };
}

/** The blocks of the block's section: its parent's children between the headings around it. */
function siblingsOf(doc: DocDocument, blockId: string): EditorJob["siblings"] {
  const parent = Object.values(doc.blocks).find((candidate) => candidate.children.includes(blockId));
  const children = parent?.children ?? [blockId];
  const at = children.indexOf(blockId);
  let start = at;
  while (start > 0 && doc.blocks[children[start - 1]!]?.type !== "heading") start -= 1;
  let end = at + 1;
  while (end < children.length && doc.blocks[children[end]!]?.type !== "heading") end += 1;
  const from = Math.max(start, Math.min(at - SIBLINGS / 2, end - SIBLINGS));
  return children.slice(from, Math.min(end, from + SIBLINGS)).flatMap((id) => {
    const sibling = doc.blocks[id];
    if (!sibling) return [];
    const text = blockMarkdown(sibling);
    return [
      {
        blockId: id,
        blockType: sibling.type,
        text: text.length > SIBLING_CHARS ? `${text.slice(0, SIBLING_CHARS)}…` : text,
        ...(id === blockId ? { self: true as const } : {}),
      },
    ];
  });
}

// ---------------------------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------------------------

export interface ImportOptions {
  jobs: readonly EditorJob[];
  answers: readonly EditorAnswer[];
  /** The corpus as it is now. A page that changed since the export gets no accepted change. */
  pages: readonly SweepPage[];
  corpus?: string;
  /** For the fact check, and to ask again any Tier 2 question a job was made for. */
  judge?: Judge;
  /** The meaning check. Every accepted answer must mean exactly what the block meant. */
  verifier?: Verifier;
  /** Answers checked at once. Default 8. */
  concurrency?: number;
  onAnswer?(key: string, status: BlockChange["status"]): void;
}

export interface ImportResult {
  result: SweepResult;
  /** Answers that could not be matched to a job or a page, in one line each. */
  problems: string[];
}

/** Checks every answer like a model rewrite and returns a SweepResult with one change per answer. */
export async function importAnswers(options: ImportOptions): Promise<ImportResult> {
  const startedAt = new Date().toISOString();
  const scope = scopeFor(options.corpus ?? options.jobs[0]?.corpus);
  const jobs = new Map(options.jobs.map((job) => [job.key, job]));
  const pages = new Map(options.pages.map((page) => [page.path, page]));
  const models = new Set<string>();
  const verifier = options.verifier && recordModels(limitVerifier(options.verifier, options.concurrency ?? 8), models);
  const slot = createLimiter(options.concurrency ?? 8);
  const problems: string[] = [];

  // One answer per key: a second answer is a mistake, and taking either would hide it.
  const byPage = new Map<string, { job: EditorJob; answer: EditorAnswer }[]>();
  const seen = new Set<string>();
  for (const answer of options.answers) {
    const job = jobs.get(answer.key);
    if (!job) problems.push(`${answer.key}: no job has this key`);
    else if (seen.has(answer.key)) problems.push(`${answer.key}: a second answer was ignored`);
    else if (!pages.has(job.page)) problems.push(`${answer.key}: the page ${job.page} is not in the corpus`);
    else {
      seen.add(answer.key);
      byPage.set(job.page, [...(byPage.get(job.page) ?? []), { job, answer }]);
    }
  }

  const results = await Promise.all(
    [...byPage].map(async ([path, entries]): Promise<PageResult> => {
      const { doc } = pages.get(path)!;
      const baseHash = docHash(doc);
      const before = lintPage(path, doc, scope);
      const order = new Map(orderedBlocks(doc).map((block, i) => [block.id, i]));
      const changes = await Promise.all(
        entries.map(({ job, answer }) =>
          slot(async () => {
            const change =
              job.baseHash !== baseHash
                ? refused(doc, job, "error", "the page changed since the job was exported")
                : await checkAnswer({ job, answer, doc, path, scope, before, judge: options.judge, verifier });
            options.onAnswer?.(job.key, change.status);
            if (change.status !== "error") models.add(answer.editor ?? "editor");
            return change;
          }),
        ),
      );
      changes.sort((a, b) => (order.get(a.blockId) ?? 0) - (order.get(b.blockId) ?? 0));
      const applied = applyRewrites(doc, changes);
      return {
        path,
        baseHash,
        title: doc.title ?? path,
        stats: pageStats(doc),
        findings: [...before, ...entries.flatMap(({ job }) => tierTwoFindings(job))],
        deep: true,
        changes: applied.changes,
        findingsAfter: lintPage(path, applied.doc, scope),
        wordsAfter: pageStats(applied.doc).words,
        after: applied.doc,
      };
    }),
  );

  return {
    result: {
      startedAt,
      finishedAt: new Date().toISOString(),
      config: {
        ...(scope.corpus ? { corpus: scope.corpus } : {}),
        judge: !!options.judge,
        rewriter: true,
        models: [...models].sort(),
        deepPages: results.map((page) => page.path),
      },
      pages: results.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    },
    problems,
  };
}

interface AnswerInput {
  job: EditorJob;
  answer: EditorAnswer;
  doc: DocDocument;
  path: string;
  scope: Scope;
  /** Tier 1 findings on the page as it is. */
  before: readonly StyleFinding[];
  judge?: Judge;
  verifier?: Verifier;
}

/** One answer through the same checks a model rewrite gets, except that bullets are allowed. */
async function checkAnswer({ job, answer, doc, path, scope, before, judge, verifier }: AnswerInput): Promise<BlockChange> {
  const block = doc.blocks[job.blockId];
  if (!block?.text?.length) return refused(doc, job, "error", "the block is gone");
  const { markdown, tokens } = protectSpans(block.text);
  if (markdown !== job.markdown) return refused(doc, job, "error", "the block changed since the job was exported");
  const original = restoreSpans(markdown, tokens);
  const restored = restoreSpans(answer.markdown, tokens);
  const base = changeBase(doc, job, original.ok ? renderBlocks(block, original.blocks) : blockMarkdown(block));
  const after = renderBlocks(block, restored.blocks);
  const attempt = { strength: "strong" as const, model: answer.editor ?? "editor", ms: 0, accepted: false, after, failed: [] as GuardrailId[] };
  if (restored.ok && restored.blocks.length === 1 && collapse(after) === collapse(base.before))
    return { ...base, after, status: "unchanged", reason: "the editor returned the block unchanged", attempts: [attempt], ops: [] };

  const ops = rewriteToOps(structuredClone(doc), block.id, restored.blocks, rewriteIdsFor(block.id));
  if (!ops.length) return { ...base, after, status: "error", reason: "the answer has no ops: an empty lead, or bullets the block cannot hold", attempts: [attempt], ops: [] };
  const scratch = applyOps(doc, ops);
  if (!scratch.ok) return { ...base, after, status: "error", reason: `the ops do not apply: ${scratch.issues.map((issue) => issue.message).join(", ")}`, attempts: [attempt], ops: [] };
  const produced = producedIds(ops);

  // The job's rules are the targets. A Tier 1 finding names its sentence, and only those sentences
  // may change. A Tier 2 finding covers the whole block.
  const rules = new Set(job.findings.map((finding) => finding.rule));
  const own = before.filter((finding) => finding.blockId === block.id && finding.tier === 1);
  const targets = own.filter((finding) => finding.field === "text" && rules.has(finding.ruleId));
  const tierTwo = tierTwoFindings(job);
  const findingsAfter = [
    ...lintPage(path, scratch.doc, scope).filter((finding) => finding.blockId !== undefined && produced.has(finding.blockId)),
    ...(await recheck(tierTwo, scratch.doc, produced, judge)),
  ];
  const verdict = await verifyRewrite(
    {
      beforeSpans: block.text,
      afterBlocks: restored.blocks.map((entry) => entry.spans),
      tokensOk: restored.ok,
      tokenProblems: restored.problems,
      targetRuleIds: [...rules],
      flaggedSentences: [...new Set(targets.flatMap((finding) => (finding.sentence ? [finding.sentence] : [])))],
      wholeBlockFlagged: tierTwo.length > 0 || targets.length === 0 || targets.some((finding) => !finding.sentence),
      findingsBefore: [...own, ...tierTwo],
      findingsAfter,
      vocabularyOnly: false,
      blockType: block.type,
      heading: nearestHeading(doc, block.id) || undefined,
      afterDepths: restored.blocks.map((entry) => entry.depth),
    },
    judge,
    verifier,
  );
  attempt.accepted = verdict.accepted;
  attempt.failed = verdict.checks.filter((check) => !check.ok).map((check) => check.id);
  if (verdict.accepted) return { ...base, after, status: "accepted", verdict, attempts: [attempt], produced: restored.blocks, ops };
  const failures = verdict.checks.filter((check) => !check.ok).map((check) => `${check.id} (${check.detail})`);
  return { ...base, after, status: "rejected", verdict, attempts: [attempt], reason: `rejected: ${failures.join(", ")}`, ops: [] };
}

function changeBase(doc: DocDocument, job: EditorJob, before: string) {
  const block = doc.blocks[job.blockId];
  return {
    blockId: job.blockId,
    blockType: block?.type ?? job.blockType,
    kind: "rewrite" as const,
    before,
    ruleIds: [...new Set(job.findings.map((finding) => finding.rule))],
    ...(block?.text ? { beforeSpans: block.text } : {}),
    context: block ? blockContext(doc, job.blockId) : {},
  };
}

function refused(doc: DocDocument, job: EditorJob, status: "error", reason: string): BlockChange {
  const block = doc.blocks[job.blockId];
  const before = block ? blockMarkdown(block) : "";
  return { ...changeBase(doc, job, before), after: before, status, reason, ops: [] };
}

/** The Tier 2 findings a job was made for, as findings, so the guardrails can count them. */
function tierTwoFindings(job: EditorJob): StyleFinding[] {
  return job.findings
    .filter((finding) => finding.tier === 2)
    .map((finding) => ({
      ruleId: finding.rule,
      source: "ste",
      layer: ruleById(finding.rule)?.layer ?? "structure",
      tier: 2,
      blockId: job.blockId,
      field: "text",
      message: finding.message,
      evidence: "",
      hint: finding.hint,
    }));
}

/** Asks Jev the job's Tier 2 questions again, about the blocks the answer produced. */
async function recheck(tierTwo: readonly StyleFinding[], doc: DocDocument, produced: ReadonlySet<string>, judge: Judge | undefined): Promise<StyleFinding[]> {
  const rules = [...new Set(tierTwo.map((finding) => finding.ruleId))].flatMap((id) => ruleById(id) ?? []).filter((rule) => rule.judge);
  if (!judge || !rules.length) return [];
  try {
    const answers = await judgeBlocks({ doc, targets: rules.map((rule) => ({ rule, blockIds: [...produced] })), judge });
    return answers.flatMap(({ ruleId, blockId, probability }) => {
      const rule = ruleById(ruleId)!;
      return probability >= rule.judge!.threshold ? [judgedFinding(doc, rule, blockId, probability)] : [];
    });
  } catch {
    return [];
  }
}

function recordModels(verifier: Verifier, models: Set<string>): Verifier {
  return {
    async compare(input) {
      const verdict = await verifier.compare(input);
      models.add(verdict.model);
      return verdict;
    },
  };
}

/** The lead line, then one "- " line per bullet, indented two spaces per level below the first. */
function renderBlocks(block: DocBlock, blocks: readonly { spans: DocBlock["text"]; depth: number }[]): string {
  return blocks
    .map(({ spans, depth }) => {
      const text = blockMarkdown({ ...block, text: spans });
      return depth > 0 ? `${"  ".repeat(depth - 1)}- ${text}` : text;
    })
    .join("\n");
}

/** The blocks an answer leaves behind: every block its ops insert or update. */
function producedIds(ops: readonly DocOp[]): Set<string> {
  const ids = new Set<string>();
  for (const op of ops) if (op.type === "insertBlock" || op.type === "updateBlock") ids.add(op.blockId);
  return ids;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function withoutEmpty<T extends object>(record: T): Partial<T> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== "")) as Partial<T>;
}
