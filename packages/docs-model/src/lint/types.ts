import type { DocBlock, DocDocument } from "../doc-schema";
export type LintPhase = "draft" | "complete";
export type LintSeverity = "error" | "warning";
export interface RuleMatch {
  blockId?: string;
  field: string;
  message: string;
  evidence: string;
}
export interface LintFinding extends RuleMatch {
  audit?: { id: string; severity: LintSeverity };
  ruleId: string;
  severity: LintSeverity;
  suggestion: string;
  docsPath: string;
  introduced: boolean;
}
export interface LintReport {
  phase: LintPhase;
  findings: LintFinding[];
  blocking: LintFinding[];
}
export interface LintOptions {
  phase: LintPhase;
  baseline?: DocDocument;
}
export interface LintContext {
  document: DocDocument;
  blocks: DocBlock[];
}
export interface LintRule {
  audit?: { id: string; severity: LintSeverity };
  id: string;
  docsPath: string;
  severity: LintSeverity;
  enforcement: readonly LintPhase[];
  applicability: string;
  exclusions: readonly string[];
  suggestion: string;
  check(context: LintContext): RuleMatch[];
}
