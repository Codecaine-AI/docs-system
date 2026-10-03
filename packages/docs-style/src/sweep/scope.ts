/**
 * What one corpus's sweep reads: its rules, built over its profile rows, and its exemptions.
 * Profile rows and exemptions can be scoped to one project, so the same rule finds different words
 * in docs-system than in another corpus.
 */
import { exemptionsFor, profileFor, type CorpusExemptions } from "../profile";
import { rulesFrom } from "../rules";
import type { StyleRule } from "../types";

export interface Scope {
  /** The project name, such as "docs-system". Undefined applies only the rows every corpus shares. */
  corpus?: string;
  rules: readonly StyleRule[];
  exemptions: CorpusExemptions;
}

const scopes = new Map<string, Scope>();

/** The scope of one corpus. Built once per corpus, because rules compile their rows on first use. */
export function scopeFor(corpus?: string): Scope {
  const key = corpus ?? "";
  let scope = scopes.get(key);
  if (!scope) {
    scope = { corpus, rules: rulesFrom(profileFor(corpus)), exemptions: exemptionsFor(corpus) };
    scopes.set(key, scope);
  }
  return scope;
}

/** Why Tier 3 skips this corpus, or undefined when it may rewrite. */
export function rewriteExemption(scope: Scope): string | undefined {
  const exemption = scope.exemptions.corpus;
  return exemption ? `the corpus is exempt from rewrites (${exemption.reason})` : undefined;
}
