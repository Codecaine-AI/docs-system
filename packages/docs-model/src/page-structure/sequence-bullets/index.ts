import type { LintRule } from "../../lint/types";

const text = (b: { text?: { insert: string }[] }) => b.text?.map((s) => s.insert).join("") ?? "";

/** Openers that put an item after the one before it, so the run is a sequence. */
/** The opener must end at a space or comma, so a name such as "Next.js" or "First-class" never matches. */
const ORDER_OPENER = /^(first|firstly|second|secondly|third|then|next|after that|afterwards|finally|lastly|start with|start by|begin with|end with)(?=[\s,])/i;

/**
 * Bullets that carry an order in their words. "Start with X" then "Then read Y" is a sequence, and a numbered
 * list shows the order by its markers, so the reader sees it before reading the words. The quality climb judges
 * flagged a "Start with" and "Then read" bullet pair on most samples of the rich-text lane's round 0.
 */
export const sequenceBulletsRule: LintRule = {
  docsPath: "99-appendix/10-style-guide/20-structure",
  id: "structure.sequence-bullets",
  severity: "warning",
  enforcement: [],
  exclusions: ["Bullets whose order does not matter", "Numbered items", "Task items"],
  applicability: "A run of two or more bullet items under one parent where an item after the first opens with an order word such as Then, Next or Finally",
  suggestion: "Make the run a numbered list (set ordered: true on each item), and drop the order words that the numbers now show.",
  check: ({ document }) => {
    const matches: ReturnType<LintRule["check"]> = [];
    const isBullet = (id: string | undefined) => {
      const block = id === undefined ? undefined : document.blocks[id];
      return block?.type === "list-item" && block.props.ordered !== true && typeof block.props.checked !== "boolean";
    };
    const seen = new Set<string>();
    function visit(id: string) {
      if (seen.has(id)) return;
      seen.add(id);
      const children = document.blocks[id]?.children ?? [];
      for (let start = 0; start < children.length; start++) {
        if (!isBullet(children[start])) continue;
        let end = start;
        while (isBullet(children[end + 1])) end++;
        const run = children.slice(start, end + 1);
        const ordered = run.slice(1).find((item) => ORDER_OPENER.test(text(document.blocks[item]!).trim()));
        if (run.length >= 2 && ordered) {
          const opener = text(document.blocks[ordered]!).trim().match(ORDER_OPENER)![0];
          matches.push({ blockId: run[0]!, field: "props.ordered", evidence: opener, message: `The bullet run that starts at ${run[0]} is a sequence: item ${ordered} opens with "${opener}". A numbered list shows the order.` });
        }
        start = end;
      }
      children.forEach(visit);
    }
    visit(document.root);
    return matches;
  },
};
