import type { LintRule } from "../../lint/types";
import { authoredProse } from "../prose";
const docsPath = "99-appendix/10-style-guide/10-writing-style";
const exclusions = [
  "Code blocks and their descendants",
  "Inline code and reference spans",
  "Paths, signatures, example literals and Canvas/Sequence payloads",
  "URLs and HTML entities",
];
/** URLs and HTML entities carry literal semicolons. */
const literals = /\bhttps?:\/\/\S+|&(?:[a-z][a-z\d]*|#\d+|#x[\da-f]+);/gi;
export const semicolonRule: LintRule = {
  id: "writing.semicolon",
  docsPath,
  severity: "warning",
  enforcement: [],
  applicability: "Document-authored prose and descriptive metadata",
  exclusions,
  suggestion:
    "Split at the semicolon into two sentences. In a list item, move the second sentence into a sub-bullet.",
  check: (context) =>
    authoredProse(context).flatMap((p) =>
      p.text.replace(literals, "\u0000").includes(";")
        ? [
            {
              blockId: p.blockId,
              field: p.field,
              evidence: p.text,
              message: "Prose contains a semicolon.",
            },
          ]
        : [],
    ),
};
