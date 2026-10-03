/**
 * How the sweep treats each core docs-model lint rule. A StyleRule declares its own layer and
 * rewrite mode, but a core rule cannot, so this table does. A core rule starts a rewrite only when
 * the table gives it a mode: most core rules (headings, list length, page openers) are not fixed
 * by rewriting the sentences of one block.
 */
import type { RuleLayer, StyleRule } from "../types";

export interface CoreRule {
  layer: RuleLayer;
  /** See StyleRule.rewrite. Without a mode, the rule's findings start no rewrite. */
  rewrite?: NonNullable<StyleRule["rewrite"]>;
  /**
   * The instruction the rewrite model gets, when the core rule's own suggestion would contradict
   * the rewrite prompt. Without it, the model gets the core rule's suggestion.
   */
  hint?: string;
}

const CORE_RULES: Readonly<Record<string, CoreRule>> = {
  // A semicolon becomes a period: the clauses stay in one block.
  "writing.semicolon": { layer: "structure", rewrite: "rewrite" },
  "writing.sentence-length": { layer: "structure", rewrite: "rewrite" },
  // Restructuring a paragraph or a list item needs judgment, so a person does it. These findings
  // stay findings.
  "writing.dense-paragraph": { layer: "structure" },
  "structure.list-item-sentences": { layer: "structure" },
  // The core suggestion says "period or comma". A comma turns a gloss into what reads as a list,
  // so the model gets the rewrite prompt's dash rule instead.
  "writing.no-em-dash": {
    layer: "structure",
    rewrite: "rewrite",
    hint: "Replace each em dash. Put parentheses around a paired-dash aside. Use a colon before a gloss or explanation. Start a new sentence only when the part after the dash is a full clause. Never use a comma.",
  },
  // The house fix turns the label into a parent bullet. A sentence rewrite drops labels such as
  // "Why:" that give a decision entry its role.
  "structure.label-colon-opener": { layer: "structure" },
  "writing.filler": { layer: "vocabulary" },
};

/** A core rule's layer and rewrite mode. A rule the table does not list shapes structure and starts no rewrite. */
export function coreRule(ruleId: string): CoreRule {
  return CORE_RULES[ruleId] ?? { layer: "structure" };
}
