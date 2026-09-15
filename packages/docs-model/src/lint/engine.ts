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
export function runLintRules(
  document: DocDocument,
  options: LintOptions,
  rules: readonly LintRule[],
): LintReport {
  validateLintRules(rules);
  function collect(doc: DocDocument): LintFinding[] {
    const context = { document: doc, blocks: orderedBlocks(doc) };
    return rules.flatMap((rule) =>
      rule.check(context).map((match) => ({
        ...match,
        audit: rule.audit,
        ruleId: rule.id,
        severity: rule.severity,
        suggestion: rule.suggestion,
        docsPath: rule.docsPath,
        introduced: true,
      })),
    );
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
