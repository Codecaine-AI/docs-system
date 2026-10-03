/**
 * ste.filler: the Banned Filler list. Autofix deletes the "autofix" rows, such as "simply", and
 * capitalizes the next word at a sentence start. Every other row is flagged: "just" can mean
 * "only", and "whatnot" stands for a list the writer must name.
 */
import { replacements, type Replacement } from "../../profile";
import type { StyleRule } from "../../types";
import { denyListRule } from "../replacement/match";

/** The rule over the given deny-list rows. Only filler rows apply. */
export function fillerRuleFor(rows: readonly Replacement[]): StyleRule {
  return denyListRule({
    id: "ste.filler",
    docsPath: "99-appendix/10-style-guide/40-vocabulary",
    summary: "Deletes filler words, and flags filler that stands for something the writer must name.",
    hint: "Delete each filler word. If it stands for a list or a thing, name the list or the thing in full.",
    rows: rows.filter((row) => row.origin === "filler"),
  });
}

export const fillerRule: StyleRule = fillerRuleFor(replacements);
