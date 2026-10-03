/**
 * ste.modal-verbs: STE allows "must" and "can". This rule flags the other modals from the
 * profile ("should", "may", "might", "could", "would") with the word to write. It never
 * autofixes, because "should" can mean a requirement or a soft suggestion, and only a person or
 * a rewrite can tell which.
 */
import { modals, type ModalRule } from "../../profile";
import type { StyleRule } from "../../types";
import { denyListRule } from "../replacement/match";

/** The rule over the given modal rows. */
export function modalVerbsRuleFor(rules: readonly ModalRule[]): StyleRule {
  return denyListRule({
    id: "ste.modal-verbs",
    docsPath: "99-appendix/10-style-guide/30-ste-profile",
    summary: "Flags should, may, might, could, and would, and names the modal to write.",
    hint: 'Write "must" for a requirement and "can" for an ability or an option. Otherwise rewrite the sentence as a command.',
    rows: rules.map((modal) => ({
      find: modal.word,
      replace: modal.use,
      tier: "flag",
      category: "modal",
      note: modal.note,
      origin: "style-guides",
    })),
  });
}

export const modalVerbsRule: StyleRule = modalVerbsRuleFor(modals);
