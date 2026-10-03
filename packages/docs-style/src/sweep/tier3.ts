/**
 * Tier 3: a cheap model rewrites only the blocks that structure findings flag. Each rewrite is
 * masked, checked by the guardrails, and retried once on the strong model before it is given up.
 */
import { createHash } from "node:crypto";
import { applyOps, type DeltaSpan, type DocBlock, type DocDocument, type DocOp } from "@codecaine-ai/docs-model";
import { orderedBlocks } from "@codecaine-ai/docs-model/lint/engine";
import { verifyRewrite } from "../guardrails";
import { judgeBlocks } from "../judge";
import { protectSpans, restoreSpans, rewriteToOps } from "../rewrite";
import { ruleById } from "../rules";
import { blockMarkdown, excludedBlockIds, proseText } from "../text";
import { nearestHeading } from "../text/context";
import type {
  BlockChange,
  GuardrailId,
  Judge,
  ProtectedToken,
  RewritableBlockType,
  RewriteRequest,
  RewriteResponse,
  RewriteStrength,
  Rewriter,
  StyleFinding,
  StyleRule,
  Verdict,
  Verifier,
  VerifyInput,
} from "../types";
import { blockContext } from "./context";
import { coreRule } from "./core-rules";
import { maskedSentences, sentenceKey } from "./sentences";
import { changeOps, rewriteIdsFor } from "./stage";
import { lintPage } from "./tier1";
import { confirmed, judgedFinding } from "./tier2";

const REWRITABLE: ReadonlySet<string> = new Set<RewritableBlockType>(["paragraph", "list-item", "callout"]);
/** Jev's one-topic rule. Its finding starts a rewrite only when another trigger fires on the block. */
const ONE_TOPIC = "ste.one-topic";

type RewriteMode = NonNullable<StyleRule["rewrite"]>;

/** rewriteToOps returns no ops for a shape the block cannot take, such as bullets on a callout. */
const NO_OPS = "the rewrite has no ops: an empty lead, or bullets the block cannot hold";
/** A rewrite that answers with bullets. The sweep never accepts one: every rewrite stays one block. */
const LIST_NOT_ALLOWED = "list form not allowed";
/** The model kept the block as it was: nothing to verify, retry, or stage. */
const UNCHANGED = "model returned the block unchanged";

/** One block of a rewrite, as restoreSpans returns it. Depth 0 is the lead; 1 and 2 are bullets. */
export interface RestoredBlock {
  spans: DeltaSpan[];
  depth: number;
}

export interface RewriteJob {
  path: string;
  /** The page the rewrite reads: the page after its autofixes. */
  doc: DocDocument;
  block: DocBlock;
  /**
   * The findings that start the rewrite, and the only findings the model sees. Vocabulary findings
   * stay out: autofix already made the safe swaps, and the model drifted on the ambiguous rest.
   */
  triggers: StyleFinding[];
  /**
   * Tier 1 findings on the block, in any field, plus the Tier 2 triggers. The guardrails count the
   * rewrite's findings against them.
   */
  before: StyleFinding[];
}

export interface RewriteServices {
  rewriter: Rewriter;
  /**
   * The judge for the fact-check guardrail and the Tier 2 re-check. The fact check fails when Jev
   * cannot answer, so a rewrite that Jev did not check is never accepted.
   */
  judge?: Judge;
  /** The meaning verifier: Sol must find that the rewrite says exactly what the block said. */
  verifier?: Verifier;
}

/**
 * How Tier 3 treats a finding: its StyleRule's rewrite mode ("rewrite" by default), or the core-rule
 * table's. A vocabulary finding never starts a rewrite.
 */
function rewriteModeOf(finding: StyleFinding): RewriteMode | undefined {
  if (finding.layer === "vocabulary") return undefined;
  if (finding.source === "core") return coreRule(finding.ruleId).rewrite;
  return ruleById(finding.ruleId)?.rewrite ?? "rewrite";
}

/** A structure finding on block text that Jev did not overrule, whose rule lets Tier 3 rewrite the block. */
export function isTrigger(finding: StyleFinding): boolean {
  const mode = rewriteModeOf(finding);
  return finding.field === "text" && confirmed(finding) && mode === "rewrite";
}

/** A finding that holds its block for a person, such as broken text: no tier may rewrite it. */
function holds(finding: StyleFinding): boolean {
  return confirmed(finding) && rewriteModeOf(finding) === "hold";
}

/**
 * One job per rewritable block with at least one trigger, in document order. Exempt blocks get
 * none, and neither does a block with a finding that holds it for a person.
 *
 * A block whose only triggers are one-topic findings gets no job. Measured R1 rejection is 28.9%
 * for one-topic alone, against 9.3% when a semicolon also fires. When another trigger fires, the
 * one-topic finding stays among the job's triggers.
 */
export function planRewrites(
  path: string,
  doc: DocDocument,
  findings: readonly StyleFinding[],
  exempt: ReadonlySet<string> = new Set(),
): RewriteJob[] {
  const context = { document: doc, blocks: orderedBlocks(doc) };
  const excluded = excludedBlockIds(context);
  return context.blocks.flatMap((block) => {
    if (!REWRITABLE.has(block.type) || !block.text?.length || excluded.has(block.id) || exempt.has(block.id)) return [];
    const own = findings.filter((finding) => finding.blockId === block.id);
    const triggers = own.filter(isTrigger);
    if (!triggers.some((finding) => finding.ruleId !== ONE_TOPIC) || own.some(holds)) return [];
    const before = [...own.filter((finding) => finding.tier === 1), ...triggers.filter((finding) => finding.tier === 2)];
    return [{ path, doc, block, triggers, before }];
  });
}

interface RequestPlan {
  request: RewriteRequest;
  targetRuleIds: string[];
  /** The triggers' sentences in proseText form, for the smallest-edit guardrail. */
  flagged: string[];
  wholeBlock: boolean;
}

/** Builds the model request for one masked block. */
export function planRequest(job: RewriteJob, markdown: string, tokens: readonly ProtectedToken[]): RequestPlan {
  const units = maskedSentences(markdown, tokens);
  const placed = new Map<string, string>();
  // A trigger without a sentence covers the whole block, so every sentence may change.
  let wholeBlock = job.triggers.some((finding) => !finding.sentence);
  for (const finding of job.triggers) {
    if (!finding.sentence || placed.has(finding.sentence)) continue;
    const key = sentenceKey(finding.sentence);
    const unit = units.find((candidate) => candidate.key === key);
    if (unit) placed.set(finding.sentence, unit.masked);
    // A sentence that cannot be placed leaves no safe sentence to pin.
    else wholeBlock = true;
  }
  const blockKeys = new Set([sentenceKey(proseText(job.block.text)), sentenceKey(plainText(job.block.text))]);
  const findings = job.triggers.map((finding) => {
    const sentence = finding.sentence ? placed.get(finding.sentence) : undefined;
    return {
      ruleId: finding.ruleId,
      message: finding.message,
      hint: finding.hint,
      evidence: requestEvidence(finding, sentence, blockKeys),
      sentence,
    };
  });
  const targetRuleIds = [...new Set(job.triggers.map((finding) => finding.ruleId))];
  return {
    request: {
      blockType: job.block.type as RewritableBlockType,
      markdown,
      tokens,
      findings,
      // An empty list tells the model that the findings cover the whole block.
      flaggedSentences: wholeBlock ? [] : [...new Set(placed.values())],
      context: blockContext(job.doc, job.block.id),
      // The machine never makes bullets: a rewrite stays one block (see StyleRule.rewrite).
      allowList: false,
    },
    targetRuleIds,
    flagged: [...new Set(job.triggers.flatMap((finding) => (finding.sentence ? [finding.sentence] : [])))],
    wholeBlock,
  };
}

/**
 * Evidence the model can read. A placed sentence shows in its masked form. Evidence that is the
 * whole block adds nothing to the markdown, so it is left empty. Literal spans show as "⟦…⟧".
 */
function requestEvidence(finding: StyleFinding, sentence: string | undefined, blockKeys: ReadonlySet<string>): string {
  if (sentence && finding.evidence === finding.sentence) return sentence;
  if (blockKeys.has(sentenceKey(finding.evidence))) return "";
  const evidence = finding.evidence.replace(/\u0000/g, "⟦…⟧");
  return evidence.length > 200 ? `${evidence.slice(0, 200)}…` : evidence;
}

function plainText(spans: readonly DeltaSpan[] | undefined): string {
  return (spans ?? []).map((span) => span.insert).join("");
}

/**
 * The identity of a rewrite's input: the masked block markdown with the exact spans behind each
 * token, the block type, and the trigger findings. Shared boilerplate on many pages has one key,
 * so it gets one rewrite (see reuseRewrite). The surrounding text is not part of the key.
 */
export function rewriteKey(job: RewriteJob): string {
  const { markdown, tokens } = protectSpans(job.block.text ?? []);
  const triggers = job.triggers.map((finding) => JSON.stringify([finding.ruleId, finding.message, finding.sentence ?? "", finding.evidence])).sort();
  const input = JSON.stringify([markdown, tokens.map((token) => token.original), job.block.type, triggers]);
  return createHash("sha256").update(input).digest("hex");
}

/** The outcome of an earlier rewrite with the same key, on this block: no model call is made. */
export function reuseRewrite(first: BlockChange, firstKey: string, job: RewriteJob): BlockChange {
  return {
    ...first,
    blockId: job.block.id,
    blockType: job.block.type,
    beforeSpans: job.block.text,
    context: blockContext(job.doc, job.block.id),
    attempts: [],
    reusedFrom: firstKey,
    ops: [],
  };
}

/** Rewrites one block: the fast model first, then the strong model once if the first attempt fails. */
export async function runRewrite(job: RewriteJob, services: RewriteServices): Promise<BlockChange> {
  const { markdown, tokens } = protectSpans(job.block.text ?? []);
  const plan = planRequest(job, markdown, tokens);
  // The before side takes the same mask-and-restore trip as the rewrite, so a diff shows only edits.
  const unchanged = restoreSpans(markdown, tokens);
  const before = unchanged.ok ? renderBlocks(job.block, unchanged.blocks) : blockMarkdown(job.block);
  const attempts: AttemptRecord[] = [];
  let last: Attempt | undefined;
  for (const strength of ["fast", "strong"] as const) {
    last = await attempt(job, plan, tokens, before, strength, services);
    attempts.push(last.record);
    // A model that keeps the block as it was would keep it again on a retry.
    if (last.status === "accepted" || last.status === "unchanged") break;
  }
  const decided = last!;
  const accepted = decided.status === "accepted";
  return {
    blockId: job.block.id,
    blockType: job.block.type,
    kind: "rewrite",
    before,
    after: decided.record.after,
    ruleIds: plan.targetRuleIds,
    status: decided.status,
    verdict: decided.verdict,
    attempts,
    reason: decided.reason,
    // The staging artifact: a stage step rebuilds ops from these blocks against the page it stages to.
    produced: accepted ? decided.blocks : undefined,
    beforeSpans: job.block.text,
    context: plan.request.context,
    ops: accepted ? decided.ops : [],
  };
}

type AttemptRecord = NonNullable<BlockChange["attempts"]>[number];

interface Attempt {
  status: BlockChange["status"];
  record: AttemptRecord;
  verdict?: Verdict;
  reason?: string;
  ops: DocOp[];
  blocks?: RestoredBlock[];
}

async function attempt(
  job: RewriteJob,
  plan: RequestPlan,
  tokens: readonly ProtectedToken[],
  before: string,
  strength: RewriteStrength,
  services: RewriteServices,
): Promise<Attempt> {
  const started = performance.now();
  let response: RewriteResponse;
  try {
    response = await services.rewriter.rewrite(plan.request, strength);
  } catch (error) {
    const ms = Math.round(performance.now() - started);
    const record: AttemptRecord = { strength, model: "", ms, accepted: false, after: "", failed: [] };
    return { status: "error", record, reason: `${strength} rewrite failed: ${messageOf(error)}`, ops: [] };
  }
  const restored = restoreSpans(response.markdown, tokens);
  const after = renderBlocks(job.block, restored.blocks);
  const record: AttemptRecord = { strength, model: response.model, ms: response.ms, accepted: false, after, failed: [] };
  // Unchanged text passes checks that look for damage, so it never reaches the guardrails.
  if (restored.ok && collapse(after) === collapse(before)) return { status: "unchanged", record, reason: UNCHANGED, ops: [] };
  // A rewrite may only split sentences and fix punctuation inside the block, so it is one block.
  if (restored.blocks.length > 1) return { status: "error", record, reason: `${strength}: ${LIST_NOT_ALLOWED}`, ops: [] };
  const scratch = scratchRewrite(job, restored.blocks);
  // Without ops there is nothing to stage or re-lint, so the guardrails have nothing to judge.
  if (scratch.error !== undefined) return { status: "error", record, reason: `${strength}: ${scratch.error}`, ops: [] };
  const findingsAfter = [...scratch.findingsAfter, ...(await recheckTier2(job, scratch.doc, scratch.produced, services.judge))];
  let verdict: Verdict;
  try {
    verdict = await verify(job, plan, restored, findingsAfter, services);
  } catch (error) {
    return { status: "error", record, reason: `${strength} verify failed: ${messageOf(error)}`, ops: [] };
  }
  record.failed = verdict.checks.filter((check) => !check.ok).map((check): GuardrailId => check.id);
  if (!verdict.accepted) {
    const failures = verdict.checks.filter((check) => !check.ok).map((check) => `${check.id} (${check.detail})`);
    return { status: "rejected", record, verdict, reason: `${strength} rejected: ${failures.join(", ")}`, ops: [] };
  }
  record.accepted = true;
  return { status: "accepted", record, verdict, ops: scratch.ops, blocks: restored.blocks };
}

type Scratch = { ops: DocOp[]; doc: DocDocument; produced: Set<string>; findingsAfter: StyleFinding[]; error?: undefined } | { error: string };

/** Applies one rewrite to a scratch copy of the page, then lints the blocks the rewrite produced. */
function scratchRewrite(job: RewriteJob, blocks: RestoredBlock[]): Scratch {
  try {
    const ops = rewriteToOps(structuredClone(job.doc), job.block.id, blocks, rewriteIdsFor(job.block.id));
    if (ops.length === 0) return { error: NO_OPS };
    const applied = applyOps(job.doc, ops);
    if (!applied.ok) return { error: `the ops do not apply: ${issuesLine(applied.issues)}` };
    const produced = producedIds(ops);
    const findingsAfter = lintPage(job.path, applied.doc).filter((f) => f.blockId !== undefined && produced.has(f.blockId));
    return { ops, doc: applied.doc, produced, findingsAfter };
  } catch (error) {
    return { error: `the ops failed: ${messageOf(error)}` };
  }
}

/**
 * Re-asks Jev the Tier 2 questions that started the rewrite, about the blocks it produced. Code
 * cannot see a Tier 2 problem, so without fresh answers the guardrails could not tell whether the
 * rewrite fixed it. Jev being down leaves the list empty: the fact check then rejects the rewrite.
 */
async function recheckTier2(job: RewriteJob, doc: DocDocument, produced: ReadonlySet<string>, judge: Judge | undefined): Promise<StyleFinding[]> {
  const rules = [...new Set(job.triggers.filter((finding) => finding.tier === 2).map((finding) => finding.ruleId))].flatMap(
    (id) => ruleById(id) ?? [],
  );
  if (!judge || rules.length === 0) return [];
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

async function verify(
  job: RewriteJob,
  plan: RequestPlan,
  restored: { blocks: RestoredBlock[]; ok: boolean; problems: string[] },
  findingsAfter: StyleFinding[],
  services: RewriteServices,
): Promise<Verdict> {
  const input: VerifyInput = {
    beforeSpans: job.block.text ?? [],
    afterBlocks: restored.blocks.map((block) => block.spans),
    tokensOk: restored.ok,
    tokenProblems: restored.problems,
    targetRuleIds: plan.targetRuleIds,
    flaggedSentences: plan.flagged,
    wholeBlockFlagged: plan.wholeBlock,
    findingsBefore: job.before,
    findingsAfter,
    // Every target is a structure finding, so no rewrite is a pure word swap.
    vocabularyOnly: false,
    blockType: job.block.type,
    heading: nearestHeading(job.doc, job.block.id) || undefined,
    afterDepths: restored.blocks.map((block) => block.depth),
  };
  return verifyRewrite(input, services.judge, services.verifier);
}

/**
 * Applies the accepted rewrites to a page one at a time, for the page's `after` and the sweep-order
 * ops preview. Each rewrite's ops are rebuilt against the page as it is then, because an earlier
 * rewrite's inserts shift the indexes of later blocks.
 */
export function applyRewrites(doc: DocDocument, rewrites: readonly BlockChange[]): { doc: DocDocument; changes: BlockChange[] } {
  let working = doc;
  const changes = rewrites.map((change) => {
    if (change.status !== "accepted" || !change.produced) return change;
    try {
      const ops = changeOps(working, change);
      if (ops.length === 0) throw new Error(NO_OPS);
      const applied = applyOps(working, ops);
      if (!applied.ok) throw new Error(issuesLine(applied.issues));
      working = applied.doc;
      return { ...change, ops };
    } catch (error) {
      const reason = `accepted, but the ops do not apply to the page: ${messageOf(error)}`;
      return { ...change, status: "error" as const, reason, produced: undefined, ops: [] };
    }
  });
  return { doc: working, changes };
}

/** The lead line, then one "- " line per bullet, indented two spaces per level below the first. */
function renderBlocks(block: DocBlock, blocks: readonly RestoredBlock[]): string {
  return blocks
    .map(({ spans, depth }) => {
      const text = blockMarkdown({ ...block, text: spans });
      return depth > 0 ? `${"  ".repeat(depth - 1)}- ${text}` : text;
    })
    .join("\n");
}

/** The blocks a rewrite leaves behind: every block it inserts or updates and does not delete. */
function producedIds(ops: readonly DocOp[]): Set<string> {
  const ids = new Set<string>();
  for (const op of ops) {
    if (op.type === "insertBlock" || op.type === "updateBlock") ids.add(op.blockId);
    else if (op.type === "deleteBlock") ids.delete(op.blockId);
  }
  return ids;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function issuesLine(issues: readonly { path: string; message: string }[]): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join(", ");
}

function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").trim();
}
