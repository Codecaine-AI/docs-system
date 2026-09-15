import type { DocDocument } from "../doc-schema";
import { writingRules } from "../writing/rules";
import { pageStructureRules } from "../page-structure/rules";
import { runLintRules } from "./engine";
import type { LintOptions, LintReport } from "./types";
export * from "./types";
export { formatLintReport, validateLintRules } from "./engine";
export const lintRules = [...pageStructureRules, ...writingRules];
export function lintDocument(
  document: DocDocument,
  options: LintOptions,
): LintReport {
  return runLintRules(document, options, lintRules);
}

export { titleHeadingFixOps } from "../page-structure/title-heading";
