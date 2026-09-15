import type { LintRule } from "../../lint/types";
import { authoredProse } from "../prose";
const docsPath = "99-appendix/10-style-guide/10-writing-style";
const exclusions = [
  "Code and quote blocks and their descendants",
  "Inline code and reference spans",
  "Paths, signatures, example literals and Canvas/Sequence payloads",
];
export const noEmDashRule: LintRule = {
  id: "writing.no-em-dash",
  docsPath,
  severity: "error",
  enforcement: ["complete"],
  applicability: "Document-authored prose and descriptive metadata",
  exclusions,
  suggestion:
    "Replace the em dash with a period or comma, or rewrite the sentence.",
  check: (context) =>
    authoredProse(context).flatMap((p) =>
      p.text.includes("—")
        ? [
            {
              blockId: p.blockId,
              field: p.field,
              evidence: p.text,
              message: "Authored prose contains an em dash.",
            },
          ]
        : [],
    ),
};
