/**
 * The rule registry. Order matters: autofix chains run in this order, and reports list rules in it.
 * To add a rule, create its folder and add it here. The pipeline needs no other change.
 */
import type { LintRule } from "@codecaine-ai/docs-model/lint";
import type { NamingGroup, Replacement } from "../profile";
import type { StyleRule } from "../types";
import { sentenceLengthRule } from "./sentence-length";
import { paragraphLengthRule } from "./paragraph-length";
import { verbFormsRule } from "./verb-forms";
import { passiveVoiceRule } from "./passive-voice";
import { nounClusterRule } from "./noun-cluster";
import { dashGlossRule } from "./dash-gloss";
import { replacementRule, replacementRuleFor } from "./replacement";
import { fillerRule, fillerRuleFor } from "./filler";
import { modalVerbsRule } from "./modal-verbs";
import { oneNameRule, oneNameRuleFor } from "./one-name";
import { oneTopicRule } from "./one-topic";
import { oneInstructionRule } from "./one-instruction";
import { conditionFirstRule } from "./condition-first";
import { undefinedTermRule } from "./undefined-term";
import { brokenSentenceRule } from "./broken-sentence";

export const styleRules: readonly StyleRule[] = [
  sentenceLengthRule,
  paragraphLengthRule,
  verbFormsRule,
  passiveVoiceRule,
  nounClusterRule,
  // Before replacement, so its autofix runs first.
  dashGlossRule,
  replacementRule,
  fillerRule,
  modalVerbsRule,
  oneNameRule,
  oneTopicRule,
  oneInstructionRule,
  conditionFirstRule,
  undefinedTermRule,
  brokenSentenceRule,
];

/**
 * The registry with its row-driven rules rebuilt over one corpus's profile rows: ste.replacement,
 * ste.filler, and ste.one-name. Every other rule reads no rows, so it is shared as is, in order.
 */
export function rulesFrom(profile: { replacements: readonly Replacement[]; namingCanon: readonly NamingGroup[] }): readonly StyleRule[] {
  const scoped = new Map(
    [replacementRuleFor(profile.replacements), fillerRuleFor(profile.replacements), oneNameRuleFor(profile.namingCanon, profile.replacements)].map(
      (rule) => [rule.id, rule],
    ),
  );
  return styleRules.map((rule) => scoped.get(rule.id) ?? rule);
}

const byId = new Map(styleRules.map((rule) => [rule.id, rule]));

/** The registered rule with this ID, if any. */
export function ruleById(id: string): StyleRule | undefined {
  return byId.get(id);
}

/**
 * Wraps a StyleRule in the docs-model LintRule shape so the core engine can run it. Style rules
 * advise: they warn and never block a phase. A judge-only rule has no detect, so it reports nothing.
 */
export function toLintRule(rule: StyleRule): LintRule {
  return {
    id: rule.id,
    docsPath: rule.docsPath,
    severity: "warning",
    enforcement: [],
    applicability: rule.summary,
    exclusions: [],
    suggestion: rule.hint,
    check: (context) => rule.detect?.(context) ?? [],
  };
}
