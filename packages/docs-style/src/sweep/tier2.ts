/**
 * Tier 2: Jev answers one yes/no question per block. A judge-only rule asks about every block it
 * applies to. A rule with detect asks only about blocks with a detect match, to confirm them.
 */
import type { DocDocument } from "@codecaine-ai/docs-model";
import { orderedBlocks } from "@codecaine-ai/docs-model/lint/engine";
import { judgeBlocks } from "../judge";
import { ruleById } from "../rules";
import { authoredProse, blockMarkdown } from "../text";
import type { Judge, JudgeSpec, StyleFinding, StyleRule } from "../types";

export interface JudgedPage {
  /** The Tier 1 findings, judged matches carrying their probability, then the Tier 2 findings. */
  findings: StyleFinding[];
  /** Jev's P(true) for every rule and block it was asked about. See answerKey. */
  answers: Map<string, number>;
}

export function answerKey(ruleId: string, blockId: string | undefined): string {
  return `${ruleId}\u0000${blockId ?? ""}`;
}

/** True unless Jev judged the finding and found no problem. An unjudged finding stands. */
export function confirmed(finding: StyleFinding): boolean {
  return !finding.overruled;
}

/** Attaches Jev's answer to a Tier 1 match, and marks the match overruled below the rule's threshold. */
export function withAnswer(finding: StyleFinding, probability: number | undefined): StyleFinding {
  if (probability === undefined) return finding;
  const threshold = ruleById(finding.ruleId)?.judge?.threshold;
  return { ...finding, probability, overruled: threshold !== undefined && probability < threshold };
}

/**
 * Asks Jev every question the page needs, never about an exempt block. Throws what the Judge
 * throws, JudgeUnavailable included.
 */
export async function judgePage(
  doc: DocDocument,
  tier1: readonly StyleFinding[],
  judge: Judge,
  rules: readonly StyleRule[],
  exempt: ReadonlySet<string> = new Set(),
): Promise<JudgedPage> {
  const blocks = orderedBlocks(doc);
  const withProse = new Set(authoredProse({ document: doc, blocks }).map((field) => field.blockId));
  const targets: { rule: StyleRule; blockIds: string[] }[] = [];
  for (const rule of rules) {
    const spec = rule.judge;
    if (!spec) continue;
    const candidates = rule.detect
      ? [...new Set(tier1.flatMap((f) => (f.ruleId === rule.id && f.blockId ? [f.blockId] : [])))]
      : blocks.map((block) => block.id);
    const blockIds = candidates.filter((id) => withProse.has(id) && !exempt.has(id) && applies(spec, doc, id));
    if (blockIds.length) targets.push({ rule, blockIds });
  }
  if (targets.length === 0) return { findings: [...tier1], answers: new Map() };

  const answers = new Map<string, number>();
  for (const answer of await judgeBlocks({ doc, targets, judge }))
    answers.set(answerKey(answer.ruleId, answer.blockId), answer.probability);

  const judged = tier1.map((finding) => withAnswer(finding, answers.get(answerKey(finding.ruleId, finding.blockId))));
  const added = targets.flatMap(({ rule, blockIds }) =>
    rule.detect
      ? []
      : blockIds.flatMap((blockId) => {
          const probability = answers.get(answerKey(rule.id, blockId));
          return probability !== undefined && probability >= rule.judge!.threshold ? [judgedFinding(doc, rule, blockId, probability)] : [];
        }),
  );
  return { findings: [...judged, ...added], answers };
}

function applies(spec: JudgeSpec, doc: DocDocument, blockId: string): boolean {
  const block = doc.blocks[blockId];
  return !!block && spec.appliesTo.includes(block.type) && (spec.select?.(doc, blockId) ?? true);
}

/** The Tier 2 finding for a judge-only rule that Jev answered yes about, at or above its threshold. */
export function judgedFinding(doc: DocDocument, rule: StyleRule, blockId: string, probability: number): StyleFinding {
  const spec = rule.judge!;
  const block = doc.blocks[blockId]!;
  return {
    ruleId: rule.id,
    source: "ste",
    layer: rule.layer,
    tier: 2,
    blockId,
    field: block.text ? "text" : "block",
    message: spec.message,
    evidence: blockMarkdown(block) || JSON.stringify(spec.state(doc, blockId)).slice(0, 400),
    hint: rule.hint,
    probability,
  };
}
