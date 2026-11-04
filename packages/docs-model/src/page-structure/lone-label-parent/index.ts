import type { LintRule } from "../../lint/types";

const text = (b: { text?: { insert: string }[] }) => b.text?.map((s) => s.insert).join("") ?? "";

/** A label: a short phrase with no sentence end, such as "Lane Rules". */
const isLabel = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 && !/[.!?]$/.test(trimmed) && trimmed.split(/\s+/).length <= 6;
};

/**
 * A list whose only item is a label bullet over the real items. The label
 * repeats the lead sentence or stands in for a heading, and it pushes every
 * item one level down. Groups exist only when there are two or more.
 */
export const loneLabelParentRule: LintRule = {
  docsPath: "99-appendix/10-style-guide/20-structure",
  id: "structure.lone-label-parent",
  severity: "warning",
  enforcement: [],
  exclusions: ["A list with two or more label groups", "A one-item list whose item is a sentence"],
  applicability: "A run of list items that is one label bullet with list items under it",
  suggestion: "Delete the label and put its items directly under the lead sentence. If the label names a section, make it a heading.",
  check: ({ document }) => {
    const matches: ReturnType<LintRule["check"]> = [];
    const seen = new Set<string>();
    function visit(id: string) {
      if (seen.has(id)) return;
      seen.add(id);
      const block = document.blocks[id];
      if (!block) return;
      const children = block.children.map((child) => document.blocks[child]);
      children.forEach((child, index) => {
        if (child?.type !== "list-item") return;
        const lone = children[index - 1]?.type !== "list-item" && children[index + 1]?.type !== "list-item";
        const items = child.children.filter((grandchild) => document.blocks[grandchild]?.type === "list-item");
        if (lone && items.length >= 2 && isLabel(text(child))) {
          matches.push({
            blockId: child.id,
            field: "text",
            evidence: text(child),
            message: `"${text(child).trim()}" is the only bullet of its list and only labels the ${items.length} items under it.`,
          });
        }
      });
      block.children.forEach(visit);
    }
    visit(document.root);
    return matches;
  },
};
