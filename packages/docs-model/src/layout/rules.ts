import type { LintRule } from "../lint/types";
import { codeLineWidthRule } from "./code-line-width";
import { stackDetailFitRule } from "./stack-detail-fit";
import { tableFitRule } from "./table-fit";

/**
 * Layout rules: what a reader sees at stock settings. Every layout rule is a
 * warning with no enforcement phase, so it never blocks a save or docs_check.
 */
export const layoutRules: LintRule[] = [codeLineWidthRule, tableFitRule, stackDetailFitRule];
