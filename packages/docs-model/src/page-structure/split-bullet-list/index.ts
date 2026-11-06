import type { LintRule } from "../../lint/types";

/** Blocks that belong to the bullet above them when they sit inside a bullet list. */
const DETAIL = new Set(["code", "callout"]);

const isBullet = (block: { type: string; props: Record<string, unknown> } | undefined) =>
  block?.type === "list-item" && block.props.ordered !== true && typeof block.props.checked !== "boolean";

/**
 * A code block or callout between two bullets of one list. The block cuts the list in two, so the reader
 * loses that the bullets on each side are siblings. As a child of the bullet above it, the block renders
 * inside that bullet and the list stays whole. split-ordered-list covers numbered steps. The quality climb
 * judges flagged command bullets cut apart by their code blocks in the rich-text lane's round 0.
 */
export const splitBulletListRule: LintRule = {
  docsPath: "99-appendix/10-style-guide/20-structure",
  id: "structure.split-bullet-list",
  severity: "warning",
  enforcement: [],
  exclusions: ["A paragraph or heading between two bullets", "A block after the last bullet", "Numbered steps, which split-ordered-list checks"],
  applicability: "Code blocks and callouts that sit between two bullet items under the same parent",
  suggestion: "Move the block into the children of the bullet above it (moveBlock to that list item), so it renders inside that bullet and the list stays whole.",
  check: ({ document }) => {
    const matches: ReturnType<LintRule["check"]> = [];
    const seen = new Set<string>();
    function visit(id: string) {
      if (seen.has(id)) return;
      seen.add(id);
      const children = document.blocks[id]?.children ?? [];
      for (let i = 1; i < children.length - 1; i++) {
        const block = document.blocks[children[i]!];
        if (!block || !DETAIL.has(block.type)) continue;
        let end = i;
        while (DETAIL.has(document.blocks[children[end]!]?.type ?? "")) end++;
        const before = children[i - 1]!;
        if (isBullet(document.blocks[before]) && isBullet(document.blocks[children[end]!])) {
          for (const split of children.slice(i, end)) {
            const type = document.blocks[split]!.type === "code" ? "code block" : "callout";
            matches.push({ blockId: split, field: "children", evidence: split, message: `The ${type} ${split} sits between two bullets of one list, so the list reads as two lists. Move ${split} into the children of ${before}.` });
          }
        }
        i = end - 1;
      }
      children.forEach(visit);
    }
    visit(document.root);
    return matches;
  },
};
