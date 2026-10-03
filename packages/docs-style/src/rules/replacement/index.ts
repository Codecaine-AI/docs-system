/**
 * ste.replacement: the Vocabulary replacement tables. Each listed word gets a finding that names
 * the plainer word. Autofix applies the "autofix" rows, and the "pos" rows when the tagger
 * confirms the part of speech. "flag" rows and rows with several options stay suggestions.
 */
import { replacements, type Replacement } from "../../profile";
import type { StyleRule } from "../../types";
import { denyListRule } from "./match";

/** The rule over the given deny-list rows. Only style-guide and habit rows apply; filler has its own rule. */
export function replacementRuleFor(rows: readonly Replacement[]): StyleRule {
  return denyListRule({
    id: "ste.replacement",
    docsPath: "99-appendix/10-style-guide/40-vocabulary",
    summary: "Swaps deny-list words for plainer words, and flags the swaps that need a person.",
    hint: "Replace each listed word with the suggested word when the meaning stays the same.",
    rows: rows.filter((row) => row.origin === "style-guides" || row.origin === "habit"),
  });
}

export const replacementRule: StyleRule = replacementRuleFor(replacements);
