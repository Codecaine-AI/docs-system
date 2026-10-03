/**
 * The contracts every folder in docs-style shares. Read this file first: it is the whole
 * vocabulary of the style pipeline (rules, findings, adapters, guardrails, sweep results).
 *
 * The pipeline, in order:
 *   Tier 1  lint       StyleRule.detect finds problems with code. StyleRule.autofix fixes the safe ones.
 *   Tier 2  judge      StyleRule.judge asks Jev one yes/no question per block (or confirms a Tier 1 match).
 *   Tier 3  rewrite    A cheap model rewrites only blocks with structure findings (see RuleLayer).
 *   Verify  guardrails Every rewrite must keep all content and add no slop, or it is rejected.
 *
 * Adapters sit at two seams, so tests use fakes and runs use real services:
 *   Judge     answers yes/no questions (Jev over HTTP, or a fake).
 *   Rewriter  rewrites one block (BAML over codex-lb, or a fake).
 */
import type { DeltaSpan, DocBlock, DocBlockType, DocDocument, DocOp } from "@codecaine-ai/docs-model";
import type { LintContext, RuleMatch } from "@codecaine-ai/docs-model/lint";

export type { LintContext };

// ---------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------

/**
 * Which job a rule does.
 * - structure: sentence and block shape. Can gate a page, and triggers a Tier 3 rewrite.
 * - vocabulary: word choice. Never gates and never triggers a rewrite on its own. Its findings
 *   ride along as extra hints when a structure finding already triggers a rewrite of the block.
 */
export type RuleLayer = "structure" | "vocabulary";

/** One problem a rule found. Extends the docs-model lint match so rules plug into the lint engine. */
export interface StyleMatch extends RuleMatch {
  /**
   * The exact sentence that carries the problem, when the problem lives in one sentence. It is in
   * proseText form: one sentence from `sentences(proseText(field))`, so each code or reference
   * span is one "\u0000" character. Guardrails use it: a rewrite may change flagged sentences and
   * must keep every other sentence. Omit it when the whole field is the problem (for example, a
   * paragraph that is too long).
   */
  sentence?: string;
  /** True when StyleRule.autofix fixes this match with no review. */
  autofixable?: boolean;
}

/**
 * A Tier 2 question. Jev answers P(true) for each block; true always means "this is a problem".
 * - A rule with judge and no detect is judge-only: every applicable block is asked.
 * - A rule with both confirms its own detect matches: only blocks with a detect match are asked,
 *   and the matches survive only when P(true) >= threshold. Without a Judge adapter, detect
 *   matches stand unconfirmed.
 */
export interface JudgeSpec {
  appliesTo: readonly DocBlockType[];
  /** Narrows appliesTo. */
  select?(doc: DocDocument, blockId: string): boolean;
  /** The state Jev reads. Keep it to the block text and the context the question needs. */
  state(doc: DocDocument, blockId: string): Record<string, unknown>;
  /** A yes/no question about `state`. Backticked names refer to state fields. True means a problem. */
  question: string;
  /** Minimum P(true) that reports a finding. */
  threshold: number;
  /** The finding message. */
  message: string;
}

/**
 * One style rule: a vertical slice that owns its detection, its safe fix, its judge question,
 * and the instruction the rewrite model gets. Each rule lives in src/rules/<name>/.
 */
export interface StyleRule {
  /** Stable ID, "ste.<name>". */
  id: string;
  layer: RuleLayer;
  /** The docs page that defines the rule, relative to the docs root. */
  docsPath: string;
  /** One line for reports. */
  summary: string;
  /** The instruction the rewrite model gets for a finding of this rule. One or two sentences. */
  hint: string;
  /**
   * How Tier 3 treats a block with a finding of this rule. Structure rules only: vocabulary
   * rules never trigger a rewrite.
   * - "rewrite" (the default): the finding triggers a model rewrite of the block. The rewrite may
   *   split sentences and fix punctuation, and it stays exactly one block: the machine never makes
   *   bullets, because a cut into bullets lost or changed meaning in about 1 rewrite in 3.
   * - "none": the finding stays a finding and never triggers a rewrite. A person fixes it.
   * - "hold": the block needs a person. Tier 3 never rewrites it, even for other findings.
   */
  rewrite?: "rewrite" | "none" | "hold";
  /** Tier 1 detection. Pure. Runs on every page. */
  detect?(context: LintContext): StyleMatch[];
  /**
   * Tier 1 safe fix for one block's `text`. Returns the text with every safe fix applied, or
   * undefined when nothing changes. Never edits code, reference, or link spans, and never
   * changes meaning. Only paragraph, list-item, callout, and heading text is passed in. `page`
   * is the page the block is on, as detect saw it, for a fix whose safety depends on the rest
   * of the page: ste.replacement keeps a word that the page uses in a heading.
   */
  autofix?(text: DeltaSpan[], block: DocBlock, page?: DocDocument): DeltaSpan[] | undefined;
  /** Tier 2 question. */
  judge?: JudgeSpec;
}

// ---------------------------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------------------------

/** One finding in the sweep, from any tier and from either rule set. */
export interface StyleFinding {
  ruleId: string;
  /** "ste" = a StyleRule in this package. "core" = an existing docs-model lint rule. */
  source: "ste" | "core";
  layer: RuleLayer;
  tier: 1 | 2;
  blockId?: string;
  /** The field the finding is in, such as "text" or "props.rows[0][1]". */
  field: string;
  message: string;
  evidence: string;
  /** See StyleMatch.sentence. */
  sentence?: string;
  /** The instruction the rewrite model gets for this finding. */
  hint: string;
  autofixable?: boolean;
  /** Jev's P(true): set on Tier 2 findings, and on Tier 1 matches that Jev was asked to confirm. */
  probability?: number;
  /**
   * True when Jev was asked to confirm this Tier 1 match and answered below the rule's threshold.
   * The finding stays for the record, but it triggers no rewrite and reports do not count it.
   */
  overruled?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------------------------

/** One yes/no question for the Judge. */
export interface JudgeQuestion {
  /** Caller-chosen key, unique within one ask() call. */
  key: string;
  question: string;
  state: Record<string, unknown>;
}

/**
 * The Tier 2 seam. Answers P(true) for each question.
 * Adapters: the Jev (TypeSafe System One) client, and a fake for tests.
 * Throws JudgeUnavailable when the service cannot answer; callers then skip Tier 2.
 */
export interface Judge {
  ask(questions: readonly JudgeQuestion[]): Promise<Map<string, number>>;
}

export class JudgeUnavailable extends Error {}

/** fast = the cheap model (GPT-6 Luna). strong = the retry model (GPT-6.1 Sol). */
export type RewriteStrength = "fast" | "strong";

/** Block types Tier 3 rewrites. Other blocks (tables, state shapes) are reported, not rewritten. */
export type RewritableBlockType = "paragraph" | "list-item" | "callout";

/** A placeholder that hides a code span, link, or reference from the model. */
export interface ProtectedToken {
  /** The placeholder in the masked markdown, such as "⟦0⟧". */
  token: string;
  kind: "code" | "link" | "reference";
  /** JSON of the exact original span or spans the token stands for. Restore puts them back byte for byte. */
  original: string;
  /** A short readable form for the model's legend, such as the code text. */
  preview: string;
}

export interface RewriteRequest {
  blockType: RewritableBlockType;
  /** The block text as inline markdown, with code spans and links replaced by tokens. */
  markdown: string;
  tokens: readonly ProtectedToken[];
  /** Everything wrong with the block: structure findings first, then vocabulary hints. */
  findings: readonly { ruleId: string; message: string; hint: string; evidence: string; sentence?: string }[];
  /** Sentences the model may change. Every other sentence must come back unchanged. */
  flaggedSentences: readonly string[];
  /** Nearby text, for meaning only. The model never edits it. */
  context: { heading?: string; previous?: string; next?: string; parent?: string };
  /** True when the model may answer with a lead sentence plus "- " bullets (a structural rewrite). */
  allowList: boolean;
}

export interface RewriteResponse {
  /** The rewritten block, still masked. May hold a lead line plus "- " bullet lines when allowList. */
  markdown: string;
  model: string;
  ms: number;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * The Tier 3 seam. Rewrites one block.
 * Adapters: the BAML client (Luna fast, Sol strong, over codex-lb or OpenRouter), and a fake for tests.
 */
export interface Rewriter {
  rewrite(request: RewriteRequest, strength: RewriteStrength): Promise<RewriteResponse>;
}

/** One way the two texts differ in meaning, as the verifier names it. */
export interface MeaningDifference {
  /** fact, number, name, condition, limit, modality, scope, relation, hierarchy, emphasis, added, or other. */
  kind: string;
  /** The words in BEFORE, or "" when the difference is an addition. */
  before: string;
  /** The words in AFTER, or "" when the difference is a drop. */
  after: string;
  why: string;
}

export interface MeaningVerdict {
  /** True only when AFTER says exactly what BEFORE says. */
  same: boolean;
  differences: MeaningDifference[];
  model: string;
  ms: number;
}

/**
 * The meaning seam: a strong model compares a block before and after a change, in both directions.
 * Adapters: the BAML client (GPT-6.1 Sol over codex-lb), and a fake for tests.
 * Texts are inline markdown that shows link and reference targets, and an AFTER with bullets is a
 * lead line plus "- " lines, so hierarchy is visible. Throws when the model cannot answer.
 */
export interface Verifier {
  compare(input: { before: string; after: string; blockType: string; heading?: string }): Promise<MeaningVerdict>;
}

// ---------------------------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------------------------

export type GuardrailId =
  | "tokens" //          every protected token comes back exactly once
  | "fact-ledger" //     code spans, links, numbers, paths, glossary terms, names, and quotes all survive
  | "content-coverage" // every content word of the original survives (by lemma)
  | "list-integrity" //  no semicolon becomes ", and"; no series gains or loses an item or its final "and"
  | "sentence-shape" //  no new sentence starts with And/So/But/Or or a lowercase word, is a How/Why fragment, or has no verb
  | "split-integrity" // a split sentence keeps its closing colon, citation, scope, and identifier case, and repeats no shared subject
  | "meaning-words" //   negations keep their count; limiters, quantifiers, modals, and connectors never drop or gain a new kind
  | "shrink-limit" //    the block loses at most 20% of its content words (function words do not count)
  | "smallest-edit" //   every sentence without a finding comes back unchanged
  | "fixes-target" //    at least one targeted finding is gone
  | "no-new-findings" // no Tier 1 rule fires more often than before
  | "slop" //            no new slop words or em dashes
  | "fact-check" //       Jev: the rewrite drops no fact and adds no claim
  | "meaning-equivalence"; // Sol: AFTER says exactly what BEFORE says, in both directions

export interface GuardrailResult {
  id: GuardrailId;
  ok: boolean;
  /** Why it passed or failed, in one short line. Reports show it. */
  detail: string;
  /** True when the check could not run (for example, no Judge for fact-check). Skipped counts as ok. */
  skipped?: boolean;
}

export interface Verdict {
  accepted: boolean;
  checks: GuardrailResult[];
}

/** Everything the guardrails need to judge one rewrite of one block. */
export interface VerifyInput {
  /** The original block text. */
  beforeSpans: DeltaSpan[];
  /** The text of each block the rewrite produced: the lead first, then any bullets in order. */
  afterBlocks: DeltaSpan[][];
  /** From restoreSpans: true when every protected token came back exactly once. */
  tokensOk: boolean;
  tokenProblems: string[];
  /** The rule IDs of the findings that triggered the rewrite. */
  targetRuleIds: string[];
  /** Sentences the rewrite may change, in proseText form (see StyleMatch.sentence). */
  flaggedSentences: string[];
  /** True when a finding covers the whole block, so every sentence may change. */
  wholeBlockFlagged: boolean;
  /** Tier 1 findings on the original block. */
  findingsBefore: StyleFinding[];
  /** Tier 1 findings on the blocks the rewrite produced. */
  findingsAfter: StyleFinding[];
  /** True when every target finding is a filler or wordy-phrase swap. Lifts the shrink limit. */
  vocabularyOnly: boolean;
  /** The rewritten block's type, for the meaning verifier. Default "paragraph". */
  blockType?: string;
  /** The nearest heading above the block, for the meaning verifier. */
  heading?: string;
  /**
   * The depth of each block in afterBlocks, in the same order: 0 the lead, 1 a bullet, 2 a
   * sub-bullet. The renderer needs it so a sub-bullet does not read as a bullet. Default: 0 for
   * the lead and 1 for every other block.
   */
  afterDepths?: number[];
}

// ---------------------------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------------------------

export interface SweepPage {
  /** Bundle path relative to the docs root, such as "10-system-design/30-data-model". */
  path: string;
  doc: DocDocument;
}

export type SweepEvent =
  | { type: "page-start"; path: string }
  | { type: "tier"; path: string; tier: 1 | 2 | 3; detail: string }
  | { type: "rewrite"; path: string; blockId: string; status: BlockChange["status"] }
  | { type: "page-done"; path: string };

export interface SweepOptions {
  pages: readonly SweepPage[];
  /**
   * The project name of the corpus, such as "docs-system". Profile rows and exemptions scoped to
   * another corpus do not apply. Omit it to apply only the rows that every corpus shares.
   */
  corpus?: string;
  /** Pages that also get Tier 2 and Tier 3. Default: every page. Tier 1 always runs on every page. */
  deepPages?: ReadonlySet<string>;
  /** Omit to skip Tier 2 and the fact-check guardrail. */
  judge?: Judge;
  /** Omit to skip Tier 3. */
  rewriter?: Rewriter;
  /**
   * The meaning verifier. Every change it checks must come back "same". Without it, Tier 3 is
   * skipped, as it is without a judge.
   */
  verifier?: Verifier;
  /** Rewrite calls in flight at once. Default 16. */
  concurrency?: number;
  onEvent?(event: SweepEvent): void;
}

/** One change to one block: a Tier 1 autofix or a Tier 3 rewrite. */
export interface BlockChange {
  blockId: string;
  blockType: string;
  kind: "autofix" | "rewrite";
  /** Inline markdown before the change. */
  before: string;
  /** Inline markdown after the change. A structural rewrite holds a lead line plus "- " bullet lines. */
  after: string;
  /** The findings this change targets. */
  ruleIds: string[];
  /** unchanged = the model returned the block as it was, so there is nothing to review or stage. */
  status: "accepted" | "rejected" | "error" | "unchanged";
  /**
   * Guardrail results for the attempt that decided the status. An autofix has one check,
   * meaning-equivalence, when a Verifier compared it.
   */
  verdict?: Verdict;
  attempts?: {
    strength: RewriteStrength;
    model: string;
    ms: number;
    accepted: boolean;
    after: string;
    failed: GuardrailId[];
  }[];
  /** Why the change errored or was rejected, in one line. */
  reason?: string;
  /**
   * The text of each block the change produces: the lead first, then any bullets with their depth.
   * This is the staging contract. A stage step recomputes ops from `produced` against the page as
   * it is then, for only the changes a person accepted, so rejecting one change never shifts
   * another. Set on accepted changes.
   */
  produced?: { spans: DeltaSpan[]; depth: number }[];
  /**
   * The block text the change starts from: the page's own text for an autofix, and the autofixed
   * text for a rewrite. With `produced`, it lets a review step render both sides in full.
   */
  beforeSpans?: DeltaSpan[];
  /** The text around the block when the change was made, for reviewers. Never edited. */
  context?: { heading?: string; previous?: string; next?: string; parent?: string };
  /**
   * Set on a rewrite that copies an earlier one, as the earlier change's key ("page#blockId"): the
   * same block text, block type, and trigger findings got that outcome first, so this block gets
   * the same accepted text or the same rejection, and no model call is made.
   */
  reusedFrom?: string;
  /**
   * A preview of the ops, computed in sweep order against the page with every earlier accepted
   * change applied. Do not stage these directly: they assume every earlier change was accepted.
   */
  ops: DocOp[];
}

export interface PageResult {
  path: string;
  /** The content hash of doc.json when the sweep read it. A stage step refuses a page whose hash changed. */
  baseHash: string;
  title: string;
  stats: { blocks: number; sentences: number; words: number };
  /** Tier 1 and Tier 2 findings on the page as it was. */
  findings: StyleFinding[];
  /** True when Tier 2 and Tier 3 ran on this page. */
  deep: boolean;
  changes: BlockChange[];
  /** Tier 1 findings after every accepted change is applied. */
  findingsAfter: StyleFinding[];
  /** Word count after every accepted change is applied. */
  wordsAfter: number;
  /** The page with every accepted change applied, in memory only. */
  after: DocDocument;
}

export interface SweepResult {
  startedAt: string;
  finishedAt: string;
  /** Which tiers ran, and with which adapters. */
  config: {
    /** SweepOptions.corpus: the project whose profile rows and exemptions applied. */
    corpus?: string;
    judge: boolean;
    /** Set when a Judge was given but became unavailable, so Tier 2 and the fact check were skipped. */
    judgeError?: string;
    rewriter: boolean;
    /**
     * Set when a Rewriter was given but Tier 3 skipped deep pages, with the reason: every rewrite
     * needs the Jev fact check and the meaning Verifier, so without both none could be accepted.
     * judgeError holds Jev's error, if any.
     */
    rewriteSkipped?: string;
    models: string[];
    deepPages: string[];
  };
  pages: PageResult[];
}
