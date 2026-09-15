import type { LintRule } from "../lint/types";
import { openingParagraphRule } from "./opening-paragraph";
import { titleHeadingRule } from "./title-heading";
import { headingOrderRule } from "./heading-order";
import { imageAltRule } from "./image-alt";
import { deepListRule } from "./deep-list";
export const pageStructureRules: LintRule[] = [
  openingParagraphRule,
  titleHeadingRule,
  headingOrderRule,
  imageAltRule,
  deepListRule,
];
