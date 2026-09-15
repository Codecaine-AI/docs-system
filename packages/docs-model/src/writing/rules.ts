import type { LintRule } from "../lint/types";
import { noEmDashRule } from "./no-em-dash";
import { fillerRule } from "./filler";
import { denseParagraphRule } from "./dense-paragraph";
export const writingRules: LintRule[] = [
  noEmDashRule,
  fillerRule,
  denseParagraphRule,
];
