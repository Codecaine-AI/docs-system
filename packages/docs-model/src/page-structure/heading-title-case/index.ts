import type { LintRule } from "../../lint/types";
import { excludedBlockIds, proseText } from "../../writing/prose";
const docsPath = "99-appendix/10-style-guide/20-structure";
const text = (b: { text?: { insert: string }[] }) =>
  b.text?.map((s) => s.insert).join("") ?? "";
/** Minor words stay lowercase inside a heading. Prepositions of four letters or more are capitalized. */
const minor = new Set(
  "a an the and but or nor for so yet as at by in of on to up via per vs versus".split(
    " ",
  ),
);
/**
 * Words that break Title Case. Code spans, numbers, versions like v2 and words
 * that start with punctuation are skipped. A hyphenated word checks its first part.
 */
function titleCaseViolations(heading: string): string[] {
  const tokens = heading.split(/\s+/).filter(Boolean);
  return tokens.flatMap((token, i) => {
    if (!/^\p{Ll}/u.test(token) || /^v\d/.test(token)) return [];
    const word = token.replace(/[^\p{L}\p{N}]+$/u, "");
    const edge = i === 0 || i === tokens.length - 1;
    return minor.has(word.split("-")[0]!) && !edge ? [] : [word];
  });
}
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
