import type { LintRule } from "../../lint/types";
import { excludedBlockIds, proseText } from "../../writing/prose";
import { titleCaseViolations } from "../../writing/title-case";
const docsPath = "99-appendix/10-style-guide/20-structure";
const text = (b: { text?: { insert: string }[] }) =>
  b.text?.map((s) => s.insert).join("") ?? "";
export const headingTitleCaseRule: LintRule = {
  id: "structure.heading-title-case",
  docsPath,
  severity: "warning",
  enforcement: [],
  applicability: "Document headings",
  exclusions: [
    "Code-marked spans and reference chips",
    "Numbers and words that start with punctuation",
    "Capitalized minor words",
  ],
  suggestion:
    "Use Title Case. Capitalize every major word and the first and last word. Code-mark identifiers.",
  check: (context) => {
    const excluded = excludedBlockIds(context);
    return context.blocks.flatMap((b) => {
      if (b.type !== "heading" || excluded.has(b.id)) return [];
      const words = titleCaseViolations(proseText(b.text));
      return words.length
        ? [
            {
              blockId: b.id,
              field: "text",
              evidence: text(b),
              message: `Heading is not in Title Case: ${words.join(", ")}.`,
            },
          ]
        : [];
    });
  },
};
