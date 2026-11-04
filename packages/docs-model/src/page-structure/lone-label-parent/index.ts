import type { LintRule } from "../../lint/types";

const text = (b: { text?: { insert: string }[] }) => b.text?.map((s) => s.insert).join("") ?? "";

/** A label: a short phrase with no sentence end, such as "Lane Rules". */
const isLabel = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 && !/[.!?]$/.test(trimmed) && trimmed.split(/\s+/).length <= 6;
};

/**
 * Label bullets that stand in for headings. Two shapes qualify:
 * - A list whose only item is a label over the real items. The label repeats
 *   the lead sentence or stands in for a heading, and it pushes every item one
 *   level down. Groups exist only when there are two or more.
 * - A list of two or more label groups with no lead sentence before it. With
 *   no lead to join, each label is a subsection title inside a list.
 */
export const loneLabelParentRule: LintRule = {
  docsPath: "99-appendix/10-style-guide/20-structure",
  id: "structure.lone-label-parent",
  severity: "warning",
  enforcement: [],
  exclusions: ["Two or more label groups after a lead sentence", "A one-item list whose item is a sentence"],
  applicability: "A run of list items that is one label bullet with list items under it, or label groups with no lead paragraph before them",
  suggestion: "Delete a lone label and put its items directly under the lead sentence. When label groups name subsections, make each label an h3 heading with a lead sentence and plain bullets.",
  check: ({ document }) => {
    const matches: ReturnType<LintRule["check"]> = [];
    const seen = new Set<string>();
    const labelGroup = (id: string) => {
      const block = document.blocks[id];
      if (block?.type !== "list-item" || !isLabel(text(block))) return 0;
      return block.children.filter((child) => document.blocks[child]?.type === "list-item").length;
    };
    function visit(id: string) {
      if (seen.has(id)) return;
      seen.add(id);
      const block = document.blocks[id];
      if (!block) return;
      const children = block.children;
      for (let start = 0; start < children.length; start++) {
        if (document.blocks[children[start]!]?.type !== "list-item") continue;
        let end = start;
        while (document.blocks[children[end + 1]!]?.type === "list-item") end++;
        const run = children.slice(start, end + 1);
        const lead = document.blocks[children[start - 1]!]?.type === "paragraph";
        if (run.length === 1 && labelGroup(run[0]!) >= 2) {
          const label = text(document.blocks[run[0]!]!).trim();
          matches.push({ blockId: run[0]!, field: "text", evidence: label, message: `"${label}" is the only bullet of its list and only labels the ${labelGroup(run[0]!)} items under it.` });
        } else if (run.length >= 2 && !lead && run.every((item) => labelGroup(item) >= 2)) {
          for (const item of run) {
            const label = text(document.blocks[item]!).trim();
            matches.push({ blockId: item, field: "text", evidence: label, message: `"${label}" labels a group in a list with no lead sentence, so it stands in for a subsection heading.` });
          }
        }
        start = end;
      }
      children.forEach(visit);
    }
    visit(document.root);
    return matches;
  },
};
