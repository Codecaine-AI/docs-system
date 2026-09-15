import type { LintRule } from "../../lint/types";
import { authoredProse } from "../prose";
const docsPath = "99-appendix/10-style-guide/10-writing-style";
const exclusions = [
  "Code and quote blocks and their descendants",
  "Inline code and reference spans",
  "Paths, signatures, example literals and Canvas/Sequence payloads",
];
export const fillerRule: LintRule = {
  id: "writing.filler",
  docsPath,
  severity: "warning",
  enforcement: [],
  applicability: "Document-authored prose and descriptive metadata",
  exclusions,
  suggestion: "Remove the filler and state the fact directly.",
  check: (context) =>
    authoredProse(context).flatMap((p) =>
      /\b(in order to|due to the fact that|it is important to note that|as mentioned above)\b/i.test(
        p.text,
      )
        ? [
            {
              blockId: p.blockId,
              field: p.field,
              evidence: p.text,
              message:
                "Prose contains a filler phrase or assumes reader memory.",
            },
          ]
        : [],
    ),
};
