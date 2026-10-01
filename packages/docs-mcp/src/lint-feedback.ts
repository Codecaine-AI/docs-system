import { isDeepStrictEqual } from "node:util";
import type { DocBlockType, DocDocument } from "@codecaine-ai/docs-model";
import { lintDocument, type LintReport, type RuleMatch } from "@codecaine-ai/docs-model/lint";
import { blockMarkdown, listRun, nearestHeading, nextSibling, parentOf, previousSibling } from "./doc-context";

/**
 * Write-time style policy. A gated rule fails docs_check when the current task introduced it.
 * Ungated rules are editorial review only: write results report them and docs_check does not
 * block on them. Unlisted rule IDs are ungated. Error rules block through lint.blocking instead.
 */
export const STYLE_RULE_POLICY: Record<string, { gate: boolean }> = {
  "writing.semicolon": { gate: true },
  "writing.dense-paragraph": { gate: true },
  "structure.list-length": { gate: true },
  "structure.list-item-sentences": { gate: true },
  "structure.heading-title-case": { gate: true },
  "structure.label-colon-opener": { gate: true },
  "structure.opening-length": { gate: true },
  "structure.opening-paragraph": { gate: true },
  "structure.heading-order": { gate: true },
  "structure.deep-list": { gate: true },
  "structure.image-alt": { gate: true },
  "writing.sentence-length": { gate: false },
  "writing.filler": { gate: false },
};

export function isGatedStyleRule(ruleId: string): boolean {
  return Object.hasOwn(STYLE_RULE_POLICY, ruleId) && STYLE_RULE_POLICY[ruleId]!.gate;
}

/** One finding as a write result reports it. */
export interface StyleFinding {
  /** Block to edit. Absent for document-level findings such as the title. */
  block?: string;
  rule: string;
  /** The rule message plus a short excerpt of the offending text. */
  problem: string;
  fix: string;
}
/** The worst findings first, capped at STYLE_FINDINGS_LIMIT. omitted counts the rest. */
export interface StyleFindings {
  shown: StyleFinding[];
  omitted: number;
}
export const STYLE_FINDINGS_LIMIT = 5;
const EXCERPT_CHARS = 80;

interface JudgmentRuleBase {
  /** Stable rule ID, reported as `rule`. */
  id: string;
  /** The typed question asked about each applicable block. Backticked names refer to fields of the rule's state. */
  question: string;
  appliesTo: readonly DocBlockType[];
  /** Minimum probability that reports a finding in write results. */
  threshold: number;
  /** Minimum probability that fails docs_check when the rule is gated. Defaults to JUDGMENT_GATE_THRESHOLD. */
  gateThreshold?: number;
  /** Gated rules rank with gated lint and block docs_check above gateThreshold. */
  gate: boolean;
  /** The finding's message. */
  problem?: string;
  /** Narrows appliesTo to the blocks the rule judges. */
  select?(doc: DocDocument, id: string): boolean;
  /** The blocks to judge when a write touches `id`. Defaults to the block itself. */
  anchors?(doc: DocDocument, id: string): string[];
  /** The state Jev reads for one block. Keep it to the block and the context the question needs. */
  state?(doc: DocDocument, id: string): Record<string, unknown>;
}
/**
 * A model-judged style rule. Jev (TypeSafe System One) answers typed questions about state with
 * calibrated probabilities, and the rule, not the model, supplies the fix text.
 * - noul: P(true) of a yes/no question. invert reports 1 - P(true), for questions phrased as the good case.
 * - choice: each option is a diagnosis with its own fix. An option without a fix is acceptable.
 * - score: a rating over ordered levels, normalized to 0 to 1, where higher is worse.
 */
export type JudgmentRule =
  | (JudgmentRuleBase & { kind: "noul"; fix: string; invert?: boolean; criteria?: { true: string; false: string } })
  | (JudgmentRuleBase & { kind: "score"; fix: string; levels?: readonly string[] })
  | (JudgmentRuleBase & { kind: "choice"; options: readonly { label: string; description?: string; problem?: string; fix?: string }[] });

export interface JudgedFinding extends RuleMatch {
  ruleId: string;
  /**
   * P(true) for noul. For choice, the summed probability of the options that carry a fix, and the
   * fix of the likeliest of them. For score, the score scaled to 0 to 1.
   */
  probability: number;
  /** The rule's fix, or the chosen option's fix for a choice rule. */
  fix: string;
}
export interface JudgmentEngine {
  /**
   * Ask each rule about the blockIds it applies to. Returns every answer as a finding, and the
   * pipeline applies each rule's thresholds. Throws when judgment is unavailable.
   */
  judge(input: { doc: DocDocument; blockIds: string[]; rules: readonly JudgmentRule[] }): Promise<JudgedFinding[]>;
}
export const JUDGMENT_GATE_THRESHOLD = 0.85;
export const gateThresholdOf = (rule: JudgmentRule) => rule.gateThreshold ?? JUDGMENT_GATE_THRESHOLD;

/** True when the rule judges this block: its type is listed and select, when present, accepts it. */
export function ruleApplies(rule: JudgmentRule, doc: DocDocument, id: string): boolean {
  const type = doc.blocks[id]?.type;
  return type !== undefined && rule.appliesTo.includes(type) && (rule.select?.(doc, id) ?? true);
}
/** The blocks a rule judges when the given blocks changed. */
export function ruleTargets(rule: JudgmentRule, doc: DocDocument, touched: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const id of touched) for (const anchor of rule.anchors?.(doc, id) ?? [id]) if (ruleApplies(rule, doc, anchor)) out.add(anchor);
  return [...out];
}

const textOf = (doc: DocDocument, id: string | undefined) => blockMarkdown(id ? doc.blocks[id] : undefined);
/** List items that are not sub-bullets and not numbered steps. */
const topLevelBullet = (doc: DocDocument, id: string) => {
  const block = doc.blocks[id];
  const parent = parentOf(doc, id);
  return block?.type === "list-item" && block.props?.ordered !== true && (parent === undefined || doc.blocks[parent]?.type !== "list-item");
};
/** The first item of a run of three or more top-level bullets that have no sub-bullets. */
const flatRunStart = (doc: DocDocument, id: string) => {
  const run = listRun(doc, id);
  return run[0] === id && run.length >= 3 && run.every((item) => topLevelBullet(doc, item) && !doc.blocks[item]?.children?.length);
};
/** The paragraph right before the run that holds a list item. */
const leadOf = (doc: DocDocument, id: string) => {
  const run = listRun(doc, id);
  const lead = run.length ? previousSibling(doc, run[0]!) : undefined;
  return lead && doc.blocks[lead]?.type === "paragraph" ? lead : undefined;
};
const MAX_BULLETS = 8;
const bulletTexts = (doc: DocDocument, run: readonly string[]) => run.slice(0, MAX_BULLETS).map((item) => textOf(doc, item));

/**
 * The shipped judgment rules. Each asks one narrow question that the deterministic lint cannot
 * answer, and each fix follows docs/99-appendix/10-style-guide/20-structure.
 */
export const judgmentRules: readonly JudgmentRule[] = [
  {
    id: "judgment.packed-bullet",
    kind: "choice",
    appliesTo: ["list-item"],
    threshold: 0.6,
    gateThreshold: 0.85,
    gate: true,
    problem: "Bullet packs more than one idea.",
    // A parent with sub-bullets is a label by design, so only leaf bullets are judged.
    select: (doc, id) => !doc.blocks[id]?.children?.length,
    state: (doc, id) => {
      const parent = parentOf(doc, id);
      return {
        heading: nearestHeading(doc, id) ?? "",
        parent_bullet: parent && doc.blocks[parent]?.type === "list-item" ? textOf(doc, parent) : "",
        bullet: textOf(doc, id),
        sibling_bullets: bulletTexts(doc, listRun(doc, id).filter((item) => item !== id)),
      };
    },
    question: "How much does the documentation bullet `bullet` carry? `sibling_bullets` are the other bullets in its list and `parent_bullet` is the bullet it sits under.",
    // Tuned on real pages: "two ideas" alone fired on compound instructions in the style guide,
    // so one_point absorbs a supporting second sentence and a short list of names.
    options: [
      { label: "one_point", description: "One point. A second sentence, if any, adds a detail, reason, or example for the same point. A short list of names or topics is one point." },
      { label: "unrelated_points", description: "Two or more unrelated points about different subjects that belong in separate bullets.",
        problem: "Bullet joins two ideas.", fix: "Keep the first idea in this bullet. Move the second idea to its own sub-bullet or sibling bullet." },
      { label: "paragraph", description: "A dense paragraph: three or more sentences of explanation, or one long sentence that strings together several separate claims.",
        problem: "Bullet is a whole paragraph.", fix: "Make the bullet a bold-label parent. Put each fact in its own one-sentence sub-bullet." },
      { label: "fragment", description: "A top-level bullet that is only a topic label, such as \"Kernel changes\", while its sibling bullets are full sentences. A noun phrase under a parent bullet is a gloss, not a fragment.",
        problem: "Bullet is a label fragment.", fix: "Write the bullet as a complete sentence. Or make it a bold label and add sub-bullets with the facts." },
    ],
  },
  {
    id: "judgment.flat-hierarchy",
    kind: "noul",
    appliesTo: ["list-item"],
    threshold: 0.7,
    gateThreshold: 0.85,
    gate: true,
    problem: "Flat list should be grouped under bold-label parents.",
    select: flatRunStart,
    // Any edit to a run re-judges the run, which reports on its first item.
    anchors: (doc, id) => {
      const lead = doc.blocks[id]?.type === "paragraph" ? nextSibling(doc, id) : id;
      const run = lead ? listRun(doc, lead) : [];
      return run.length ? [run[0]!] : [];
    },
    state: (doc, id) => ({
      heading: nearestHeading(doc, id) ?? "",
      lead: textOf(doc, leadOf(doc, id)),
      bullets: bulletTexts(doc, listRun(doc, id)),
    }),
    // Asking directly about regrouping scored 0.2 to 0.6 on every list. The wall-of-text framing separates.
    question: "Read the flat documentation list `bullets`. Is it a wall of text: bullets that pack a claim together with its explanation, details, or examples, instead of short parallel items?",
    fix: "Group the bullets under bold-label parent bullets. Give each parent one-sentence sub-bullets.",
  },
  {
    id: "judgment.join-test",
    kind: "noul",
    appliesTo: ["paragraph"],
    threshold: 0.5,
    gateThreshold: 0.85,
    gate: true,
    problem: "Lead and bullets fail the join test.",
    select: (doc, id) => doc.blocks[nextSibling(doc, id) ?? ""]?.type === "list-item",
    anchors: (doc, id) => doc.blocks[id]?.type === "list-item" ? [leadOf(doc, id) ?? ""] : [id],
    state: (doc, id) => {
      const first = nextSibling(doc, id)!;
      return { heading: nearestHeading(doc, id) ?? "", lead: textOf(doc, id), bullets: bulletTexts(doc, listRun(doc, first)) };
    },
    // The literal "reads as one paragraph" question failed almost every lead. Naming the two failure modes separates.
    question: "Does the pair `lead` and `bullets` fail to read as prose? It fails when `lead` is a bare label or fragment instead of a complete sentence, or when it does not introduce what `bullets` say.",
    fix: "Make the lead a complete sentence that introduces the bullets. Make each bullet a complete sentence that follows from it.",
  },
];

/** Collapse whitespace, mark literal spans, and cap the evidence at EXCERPT_CHARS characters on a whole word. */
function excerpt(evidence: string): string {
  const chars = Array.from(evidence.replaceAll("\u0000", "…").replace(/\s+/g, " ").trim());
  if (chars.length <= EXCERPT_CHARS) return chars.join("");
  const cut = chars.slice(0, EXCERPT_CHARS - 1).join("");
  const whole = chars[EXCERPT_CHARS - 1] === " " ? cut : cut.replace(/ \S*$/, "") || cut;
  return `${whole.trimEnd()}…`;
}

function compact(match: RuleMatch & { ruleId: string }, fix: string): StyleFinding {
  const quoted = excerpt(match.evidence);
  return {
    ...(match.blockId ? { block: match.blockId } : {}),
    rule: match.ruleId,
    problem: quoted && !match.message.includes(quoted) ? `${match.message} Evidence: "${quoted}"` : match.message,
    fix,
  };
}

/**
 * Blocks a write touched: new blocks, blocks whose type, props, or text changed, and the named
 * IDs that still exist. A child-order change alone does not count, and the root never does.
 */
export function touchedBlockIds(before: DocDocument | null, after: DocDocument, named: Iterable<string> = []): Set<string> {
  const touched = new Set([...named].filter((id) => id in after.blocks));
  for (const [id, block] of Object.entries(after.blocks)) {
    const prior = before?.blocks[id];
    if (!prior || prior.type !== block.type || !isDeepStrictEqual(prior.props, block.props)
      || !isDeepStrictEqual(prior.text ?? null, block.text ?? null)) touched.add(id);
  }
  touched.delete(after.root);
  return touched;
}

/**
 * Compact feedback for one write. A lint finding is relevant when the write introduced it or it
 * sits on a touched block. Judged findings count when they clear their rule's threshold. Errors
 * come first, then gated rules, then the rest. Within a group, rules take turns, in input order. Returns undefined when
 * nothing is relevant, so a clean write adds no keys.
 */
export function summarizeStyleFindings(
  report: LintReport,
  touched: Iterable<string>,
  judged: readonly JudgedFinding[] = [],
  rules: readonly JudgmentRule[] = judgmentRules,
): StyleFindings | undefined {
  const blocks = new Set(touched);
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const ranked = [
    ...report.findings
      .filter((finding) => finding.introduced || (finding.blockId !== undefined && blocks.has(finding.blockId)))
      .map((finding) => ({
        rank: finding.severity === "error" ? 0 : isGatedStyleRule(finding.ruleId) ? 1 : 2,
        finding: compact(finding, finding.suggestion),
      })),
    ...judged.flatMap((finding) => {
      const rule = byId.get(finding.ruleId);
      return rule && finding.probability >= rule.threshold
        ? [{ rank: rule.gate ? 1 : 2, finding: compact(finding, finding.fix) }]
        : [];
    }),
  ];
  // Within a rank, each rule's first finding comes before any rule's second, so four findings of
  // one rule cannot push a different rule past the cap. Ties keep input order.
  const seen = new Map<string, number>();
  const ordered = ranked.map((entry, index) => {
    const key = `${entry.rank}\u0000${entry.finding.rule}`;
    const nth = seen.get(key) ?? 0;
    seen.set(key, nth + 1);
    return { ...entry, nth, index };
  }).sort((a, b) => a.rank - b.rank || a.nth - b.nth || a.index - b.index);
  if (!ordered.length) return undefined;
  return {
    shown: ordered.slice(0, STYLE_FINDINGS_LIMIT).map(({ finding }) => finding),
    omitted: Math.max(0, ordered.length - STYLE_FINDINGS_LIMIT),
  };
}

/** docs_check's blocking list: every gated finding the task introduced, uncapped, in report order. */
export function styleGate(report: LintReport): StyleFinding[] {
  return report.findings
    .filter((finding) => finding.introduced && isGatedStyleRule(finding.ruleId))
    .map((finding) => compact(finding, finding.suggestion));
}

/** One judge call over the blocks some rule targets after a change to `touched`. Throws when the engine does. */
async function judgeTouched(engine: JudgmentEngine, rules: readonly JudgmentRule[], doc: DocDocument, touched: Iterable<string>): Promise<JudgedFinding[]> {
  const ids = [...touched];
  const targets = new Map(rules.map((rule) => [rule, ruleTargets(rule, doc, ids)] as const));
  const blockIds = [...new Set([...targets.values()].flat())];
  if (!blockIds.length) return [];
  const asked = new Set(blockIds);
  const judged = await engine.judge({ doc, blockIds, rules: rules.filter((rule) => targets.get(rule)!.length) });
  return judged.filter((finding) => finding.blockId !== undefined && asked.has(finding.blockId));
}

/** Judgment for write feedback. The write is already saved and judgment is advisory, so any failure reports nothing. */
async function judge(engine: JudgmentEngine, rules: readonly JudgmentRule[], doc: DocDocument, touched: ReadonlySet<string>): Promise<JudgedFinding[]> {
  try { return await judgeTouched(engine, rules, doc, touched); } catch { return []; }
}

export type JudgedGate = { available: true; gate: StyleFinding[] } | { available: false; reason: string };
/**
 * docs_check's judged gate: gated rules judged over the blocks the task changed since its baseline,
 * kept at or above each rule's gateThreshold. A finding the baseline already had at that level on
 * the same block is not the task's, so it does not block. Never throws.
 */
export async function judgedStyleGate(input: {
  engine?: JudgmentEngine;
  baseline: DocDocument | null;
  doc: DocDocument;
  rules?: readonly JudgmentRule[];
}): Promise<JudgedGate> {
  const rules = (input.rules ?? judgmentRules).filter((rule) => rule.gate);
  if (!input.engine) return { available: false, reason: "No judgment engine is configured." };
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const clears = (finding: JudgedFinding) => {
    const rule = byId.get(finding.ruleId);
    return rule !== undefined && finding.probability >= gateThresholdOf(rule) && finding.probability >= rule.threshold;
  };
  try {
    const touched = touchedBlockIds(input.baseline, input.doc);
    const found = (await judgeTouched(input.engine, rules, input.doc, touched)).filter(clears);
    const prior = input.baseline;
    const existed = prior ? found.filter((f) => ruleApplies(byId.get(f.ruleId)!, prior, f.blockId!)) : [];
    let inherited = new Set<string>();
    if (prior && existed.length) {
      const again = await input.engine.judge({ doc: prior, blockIds: [...new Set(existed.map((f) => f.blockId!))], rules: rules.filter((rule) => existed.some((f) => f.ruleId === rule.id)) });
      inherited = new Set(again.filter(clears).map((f) => `${f.ruleId}\u0000${f.blockId}`));
    }
    return { available: true, gate: found.filter((f) => !inherited.has(`${f.ruleId}\u0000${f.blockId}`)).map((f) => compact(f, f.fix)) };
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Style feedback for a saved write: lint `after` against `before` (null for a new document),
 * then merge one judge call over the touched blocks when an engine and rules exist.
 */
export async function writeStyleFeedback(input: {
  before: DocDocument | null;
  after: DocDocument;
  /** Block IDs the write named: op targets, store changedIds, and normalization ops. */
  named?: Iterable<string>;
  engine?: JudgmentEngine;
  rules?: readonly JudgmentRule[];
}): Promise<StyleFindings | undefined> {
  const rules = input.rules ?? judgmentRules;
  const report = lintDocument(input.after, { phase: "complete", baseline: input.before ?? undefined });
  const touched = touchedBlockIds(input.before, input.after, input.named);
  const judged = input.engine && rules.length ? await judge(input.engine, rules, input.after, touched) : [];
  return summarizeStyleFindings(report, touched, judged, rules);
}
