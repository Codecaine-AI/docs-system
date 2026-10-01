import type { LintRule } from "../lint/types";
import { openingParagraphRule } from "./opening-paragraph";
import { titleHeadingRule } from "./title-heading";
import { headingOrderRule } from "./heading-order";
import { imageAltRule } from "./image-alt";
import { deepListRule } from "./deep-list";
import { openingLengthRule } from "./opening-length";
import { listLengthRule } from "./list-length";
import { listItemSentencesRule } from "./list-item-sentences";
import { headingTitleCaseRule } from "./heading-title-case";
import { labelColonOpenerRule } from "./label-colon-opener";
export const pageStructureRules: LintRule[] = [
  openingParagraphRule,
  titleHeadingRule,
  headingOrderRule,
  imageAltRule,
  deepListRule,
  openingLengthRule,
  listLengthRule,
  listItemSentencesRule,
  headingTitleCaseRule,
  labelColonOpenerRule,
];
