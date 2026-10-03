import type { DocBlock, DocDocument } from "../doc-schema";
import type { LintFinding, LintOptions, LintReport, LintRule } from "./types";

/** Walk document-owned blocks only; malformed graphs are the schema validator's job. */
export function orderedBlocks(document: DocDocument): DocBlock[] {
  const result: DocBlock[] = [],
    seen = new Set<string>();
  function visit(id: string) {
    if (seen.has(id)) return;
    seen.add(id);
    const b = document.blocks[id];
    if (!b) return;
    if (id !== document.root) result.push(b);
    b.children.forEach(visit);
  }
  visit(document.root);
  return result;
}
export function validateLintRules(rules: readonly LintRule[]): void {
  const ids = new Set<string>();
  for (const rule of rules) {
    if (ids.has(rule.id)) throw new Error(`Duplicate lint rule ID: ${rule.id}`);
    ids.add(rule.id);
    if (!rule.docsPath.trim())
      throw new Error(`Missing corpus reference: ${rule.id}`);
  }
}
/** Rule failures already logged, so a rule that throws on every lint of a page logs once. */
const loggedFailures = new Set<string>();

/**
 * The finding a rule that threw leaves behind. A warning, never blocking,
 * and never carrying the rule's audit severity: one broken check must not
 * fail a save, an audit or docs_check, or hide the other rules' findings.
 */
function failedRuleFinding(rule: LintRule, error: unknown): LintFinding {
  const reason = (error instanceof Error ? error.message : String(error)).trim() || "unknown error";
  const key = `${rule.id}\u0000${reason}`;
  if (!loggedFailures.has(key)) {
    if (loggedFailures.size >= 200) loggedFailures.clear();
    loggedFailures.add(key);
    console.error(`lint: rule ${rule.id} threw and was skipped: ${reason}`);
  }
  return {
    field: "document",
    message: `The ${rule.id} check failed on this page and was skipped: ${reason.replace(/[.\s]*$/, "")}.`,
    evidence: `internal error: ${reason}`,
    audit: undefined,
    ruleId: rule.id,
    severity: "warning",
    suggestion: "The page itself may be fine. Report the error to the docs-system maintainers.",
    docsPath: rule.docsPath,
    introduced: true,
  };
}

export function runLintRules(
  document: DocDocument,
  options: LintOptions,
  rules: readonly LintRule[],
): LintReport {
  validateLintRules(rules);
  function collect(doc: DocDocument): LintFinding[] {
    const context = { document: doc, blocks: orderedBlocks(doc) };
    return rules.flatMap((rule): LintFinding[] => {
      let matches;
      try {
        matches = rule.check(context);
      } catch (error) {
        return [failedRuleFinding(rule, error)];
      }
      return matches.map((match) => ({
        ...match,
        audit: rule.audit,
        ruleId: rule.id,
        severity: rule.severity,
        suggestion: match.suggestion ?? rule.suggestion,
        docsPath: rule.docsPath,
        introduced: true,
      }));
    });
  }
  // Match exact semantic evidence with multiplicity. IDs and array positions may
  // change during full-document writes; different content never inherits a waiver.
  const key = (f: LintFinding) =>
    JSON.stringify([f.ruleId, f.field.replace(/\[\d+\]/g, "[]"), f.evidence]);
  const remaining = new Map<string, number>();
  if (options.baseline)
    for (const finding of collect(options.baseline))
      remaining.set(key(finding), (remaining.get(key(finding)) ?? 0) + 1);
  const findings = collect(document).map((finding) => {
    const k = key(finding),
      count = remaining.get(k) ?? 0;
    if (count) {
      remaining.set(k, count - 1);
      return { ...finding, introduced: false };
    }
    return finding;
  });
  const blocking = findings.filter(
    (f) =>
      f.introduced &&
      f.severity === "error" &&
      rules.find((r) => r.id === f.ruleId)!.enforcement.includes(options.phase),
  );
  return { phase: options.phase, findings, blocking };
}
export function formatLintReport(report: LintReport): string {
  return report.findings
    .map(
      (f) =>
        `${f.severity} ${f.ruleId} ${f.blockId ? `${f.blockId}.` : ""}${f.field}${f.introduced ? "" : " (existing)"}: ${f.message} ${f.suggestion} See ${f.docsPath}.`,
    )
    .join("\n");
}
