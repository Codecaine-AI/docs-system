import type { LintRule } from "../../lint/types";
import { authoredProse, sentences, wordCount } from "../prose";
const docsPath = "99-appendix/10-style-guide/10-writing-style";
const exclusions = [
  "Code and quote blocks and their descendants",
  "Inline code and reference spans, which do not count as words",
  "Paths, signatures, example literals and Canvas/Sequence payloads",
];
export const sentenceLengthRule: LintRule = {
  id: "writing.sentence-length",
  docsPath,
  severity: "warning",
  enforcement: [],
  applicability: "Prose sentences over 30 words",
  exclusions,
  suggestion:
    "Review the sentence. Split it at a second thought, not at an arbitrary count.",
  check: (context) =>
    authoredProse(context).flatMap((p) =>
      sentences(p.text).flatMap((sentence) => {
        const words = wordCount(sentence);
        return words > 30
          ? [
              {
                blockId: p.blockId,
                field: p.field,
                evidence: sentence,
                message: `Sentence has ${words} words.`,
              },
            ]
          : [];
      }),
    ),
};
