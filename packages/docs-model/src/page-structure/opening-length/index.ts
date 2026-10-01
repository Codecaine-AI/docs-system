import type { LintRule } from "../../lint/types";
import { proseText, sentences } from "../../writing/prose";
import { openingBlock } from "../opening-paragraph";
const docsPath = "99-appendix/10-style-guide/20-structure";
const text = (b: { text?: { insert: string }[] }) =>
  b.text?.map((s) => s.insert).join("") ?? "";
export const openingLengthRule: LintRule = {
  id: "structure.opening-length",
  docsPath,
  severity: "warning",
  enforcement: [],
  applicability: "An opening paragraph over four sentences",
  exclusions: [
    "Missing openers, reported by structure.opening-paragraph",
    "Inline code and reference spans",
  ],
  suggestion:
    "Cut the opening to 2 to 4 sentences. Move the remaining detail into the body.",
  check: ({ document, blocks }) => {
    const first = openingBlock(document, blocks);
    if (first?.type !== "paragraph") return [];
    const count = sentences(proseText(first.text)).length;
    return count > 4
      ? [
          {
            blockId: first.id,
            field: "text",
            evidence: text(first),
            message: `Opening paragraph has ${count} sentences.`,
          },
        ]
      : [];
  },
};
