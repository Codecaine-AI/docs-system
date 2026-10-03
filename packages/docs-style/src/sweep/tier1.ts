/**
 * Tier 1: the code rules. The core docs-model lint and the STE rules run side by side, so one
 * finding list covers both rule sets. Free, exact, and pure.
 */
import type { DocDocument } from "@codecaine-ai/docs-model";
import { lintDocument, type LintFinding } from "@codecaine-ai/docs-model/lint";
import { orderedBlocks } from "@codecaine-ai/docs-model/lint/engine";
import { roleMarkers } from "../profile";
import { authoredProse, sentences, steWordCount } from "../text";
import type { StyleFinding, StyleMatch, StyleRule } from "../types";
import { coreRule } from "./core-rules";
import { exemptBlockIds, isExemptPage } from "./exempt";
import { scopeFor, type Scope } from "./scope";

/** URLs and HTML entities hold literal semicolons. The core semicolon rule skips them the same way. */
const LITERALS = /\bhttps?:\/\/\S+|&(?:[a-z][a-z\d]*|#\d+|#x[\da-f]+);/gi;

/**
 * Core rules that report a whole field when the problem sits in single sentences, with a test for
 * the sentences that hold it. Their findings split into one finding per such sentence, so a
 * rewrite may touch only those sentences.
 */
const SENTENCE_TESTS: Readonly<Record<string, (sentence: string) => boolean>> = {
  "writing.semicolon": (sentence) => sentence.replace(LITERALS, "\u0000").includes(";"),
  "writing.no-em-dash": (sentence) => sentence.includes("—"),
};

const ROLE_MARKERS: ReadonlySet<string> = new Set(roleMarkers.map((marker) => marker.toLowerCase()));

/**
 * Every Tier 1 finding on a page: the core lint first, then the STE rules in registry order. The
 * default rules read only the profile rows that every corpus shares.
 */
export function lintStyle(doc: DocDocument, rules: readonly StyleRule[] = scopeFor().rules): StyleFinding[] {
  const core = lintDocument(doc, { phase: "complete" }).findings.filter((finding) => !isRoleLabel(finding)).flatMap(fromCore);
  const context = { document: doc, blocks: orderedBlocks(doc) };
  const ste = rules.flatMap((rule) => rule.detect?.(context).map((match) => fromRule(rule, match)) ?? []);
  return [...core, ...ste];
}

/** lintStyle for one page of a corpus, with its scope's rules, and without its exempt sections. */
export function lintPage(path: string, doc: DocDocument, scope: Scope = scopeFor()): StyleFinding[] {
  if (isExemptPage(path, scope.exemptions)) return [];
  const exempt = exemptBlockIds(path, doc, scope.exemptions);
  const findings = lintStyle(doc, scope.rules);
  return exempt.size ? findings.filter((finding) => !finding.blockId || !exempt.has(finding.blockId)) : findings;
}

/** A label-colon opener whose label is a role marker, such as "Why:", is template, not style. */
function isRoleLabel(finding: LintFinding): boolean {
  if (finding.ruleId !== "structure.label-colon-opener") return false;
  const colon = finding.evidence.search(/:(\s|$)/);
  return colon > 0 && ROLE_MARKERS.has(finding.evidence.slice(0, colon).trim().toLowerCase());
}

function fromCore(finding: LintFinding): StyleFinding[] {
  const base: StyleFinding = {
    ruleId: finding.ruleId,
    source: "core",
    layer: coreRule(finding.ruleId).layer,
    tier: 1,
    blockId: finding.blockId,
    field: finding.field,
    message: finding.message,
    evidence: finding.evidence,
    // The core sentence-length rule reports one proseText sentence as its evidence. Naming it lets
    // the rewrite touch only that sentence.
    sentence: finding.ruleId === "writing.sentence-length" ? finding.evidence : undefined,
    hint: coreRule(finding.ruleId).hint ?? finding.suggestion,
  };
  // The evidence of these rules is the field's proseText, so its sentences are the lint's sentences.
  const test = SENTENCE_TESTS[finding.ruleId];
  const hits = test ? sentences(finding.evidence).filter(test) : [];
  return hits.length ? hits.map((sentence) => ({ ...base, evidence: sentence, sentence })) : [base];
}

function fromRule(rule: StyleRule, match: StyleMatch): StyleFinding {
  return {
    ruleId: rule.id,
    source: "ste",
    layer: rule.layer,
    tier: 1,
    blockId: match.blockId,
    field: match.field,
    message: match.message,
    evidence: match.evidence,
    sentence: match.sentence,
    // A match may name its exact fix, the same override the lint engine honors.
    hint: match.suggestion ?? rule.hint,
    autofixable: match.autofixable,
  };
}

/** Page size in the units the reports use. Sentences and words come from authored prose only. */
export function pageStats(doc: DocDocument): { blocks: number; sentences: number; words: number } {
  const blocks = orderedBlocks(doc);
  const prose = authoredProse({ document: doc, blocks });
  return {
    blocks: blocks.length,
    sentences: prose.reduce((sum, field) => sum + sentences(field.text).length, 0),
    words: prose.reduce((sum, field) => sum + steWordCount(field.text), 0),
  };
}
