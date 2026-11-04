import type { LintRule } from "../lint/types";
import { noEmDashRule } from "./no-em-dash";
import { fillerRule } from "./filler";
import { denseParagraphRule } from "./dense-paragraph";
import { semicolonRule } from "./semicolon";
import { sentenceLengthRule } from "./sentence-length";
import { literalBackticksRule } from "./literal-backticks";
export const writingRules: LintRule[] = [
  noEmDashRule,
  fillerRule,
  denseParagraphRule,
  semicolonRule,
  sentenceLengthRule,
  literalBackticksRule,
];
