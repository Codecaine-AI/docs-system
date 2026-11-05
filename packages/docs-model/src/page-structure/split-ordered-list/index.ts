import type { LintRule } from "../../lint/types";

/** Blocks that end a procedure on purpose. A numbered list after one starts at 1 by design. */
const SECTION_BREAKS = new Set(["heading", "divider"]);

/**
 * A block between two numbered steps. The viewer and the markdown number each run of ordered sibling
 * list items from 1, so a code block, a paragraph or a callout between step 4 and the next step makes that
 * step read "1.". The block belongs to the step above it: as that step's child it renders inside the
 * step, and the numbering continues. Round 7 brief 5 rendered its last step as "1." after a code block.
 */
export const splitOrderedListRule: LintRule = {
  docsPath: "99-appendix/10-style-guide/20-structure",
  id: "structure.split-ordered-list",
  severity: "warning",
  enforcement: [],
  exclusions: ["A heading or a divider between two numbered lists", "A block after the last numbered step"],
  applicability: "Blocks that sit between two numbered list items under the same parent",
  suggestion: "Move the block into the children of the step above it (moveBlock to that list item), so it renders inside that step and the numbering continues.",
  check: ({ document }) => {
    const matches: ReturnType<LintRule["check"]> = [];
    const isStep = (id: string | undefined) => {
      const block = id === undefined ? undefined : document.blocks[id];
      return block?.type === "list-item" && block.props.ordered === true;
    };
    const seen = new Set<string>();
    function visit(id: string) {
      if (seen.has(id)) return;
      seen.add(id);
      const children = document.blocks[id]?.children ?? [];
      let step = 0;
      for (let i = 0; i < children.length; i++) {
        if (isStep(children[i])) { step++; continue; }
        if (step === 0) continue;
        let end = i;
        while (end < children.length && !isStep(children[end]) && !SECTION_BREAKS.has(document.blocks[children[end]!]?.type ?? "")
          && document.blocks[children[end]!]?.type !== "list-item") end++;
        if (end > i && isStep(children[end])) {
          for (const split of children.slice(i, end)) {
            const type = document.blocks[split]?.type === "code" ? "code block" : document.blocks[split]?.type ?? "block";
            matches.push({ blockId: split, field: "children", evidence: split, message: `The ${type} ${split} sits between step ${step} and the next numbered step, so that step renders as "1.". Move ${split} into step ${step}'s children.` });
          }
        }
        step = 0;
        i = end - 1;
      }
      children.forEach(visit);
    }
    visit(document.root);
    return matches;
  },
};
