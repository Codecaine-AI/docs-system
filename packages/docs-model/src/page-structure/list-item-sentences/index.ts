import type { LintRule } from "../../lint/types";
import { excludedBlockIds, proseText, sentences } from "../../writing/prose";
const docsPath = "99-appendix/10-style-guide/20-structure";
const text = (b: { text?: { insert: string }[] }) =>
  b.text?.map((s) => s.insert).join("") ?? "";
export const listItemSentencesRule: LintRule = {
  id: "structure.list-item-sentences",
  docsPath,
  severity: "warning",
  enforcement: [],
  applicability: "List items whose own text has three or more sentences",
  exclusions: [
    "Nested items, which are checked on their own",
    "Inline code and reference spans",
  ],
  suggestion:
    "Keep the first sentence as the item. Nest its supporting sentences as sub-bullets, and move a separate idea into a sibling item.",
  check: (context) => {
    const excluded = excludedBlockIds(context);
    return context.blocks.flatMap((b) => {
      if (b.type !== "list-item" || excluded.has(b.id)) return [];
      const count = sentences(proseText(b.text)).length;
      return count >= 3
        ? [
            {
              blockId: b.id,
              field: "text",
              evidence: text(b),
              message: `List item has ${count} sentences.`,
            },
          ]
        : [];
    });
  },
};
