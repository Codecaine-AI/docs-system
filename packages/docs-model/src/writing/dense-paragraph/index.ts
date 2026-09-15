import type { LintRule } from "../../lint/types";
import { authoredProse } from "../prose";
const docsPath = "99-appendix/10-style-guide/10-writing-style";
const exclusions = [
  "Code and quote blocks and their descendants",
  "Inline code and reference spans",
  "Paths, signatures, example literals and Canvas/Sequence payloads",
];
export const denseParagraphRule: LintRule = {
  id: "writing.dense-paragraph",
  docsPath,
  severity: "warning",
  enforcement: [],
  applicability: "Paragraphs over 120 prose words",
  exclusions,
  suggestion:
    "Split the paragraph by topic or move independent facts into a short list.",
  check: (context) =>
    authoredProse(context).flatMap((p) =>
      p.paragraph && p.text.split(/[\s\u0000]+/).filter(Boolean).length > 120
        ? [
            {
              blockId: p.blockId,
              field: p.field,
              evidence: p.text,
              message: "Paragraph exceeds 120 words.",
            },
          ]
        : [],
    ),
};
