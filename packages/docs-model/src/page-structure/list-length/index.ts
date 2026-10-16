import type { DocBlock } from "../../doc-schema";
import type { LintRule, RuleMatch } from "../../lint/types";
import { excludedBlockIds } from "../../writing/prose";
const docsPath = "99-appendix/10-style-guide/20-structure";
const limit = 6;
const text = (b: { text?: { insert: string }[] }) =>
  b.text?.map((s) => s.insert).join("") ?? "";
/** A task item (`- [ ]` / `- [x]`) carries a boolean checked prop. */
const isTask = (b: DocBlock) => typeof b.props.checked === "boolean";
export const listLengthRule: LintRule = {
  id: "structure.list-length",
  docsPath,
  severity: "warning",
  enforcement: [],
  applicability:
    "Runs of sibling list items, and sibling Process Outline steps, over six items",
  exclusions: [
    "Process Outline clarification notes, which are not steps",
    "Runs made only of task items (checklists), which are legitimately long",
  ],
  suggestion:
    "Split the list into groups or rank it. Lists cap at about five items.",
  check: (context) => {
    const { document } = context;
    const excluded = excludedBlockIds(context);
    const matches: RuleMatch[] = [];
    // One finding per run. The count is evidence, so a longer list is a new finding.
    for (const parent of [document.blocks[document.root], ...context.blocks]) {
      if (!parent || excluded.has(parent.id)) continue;
      let run: DocBlock[] = [];
      for (const id of [...parent.children, ""]) {
        const child = document.blocks[id];
        if (child?.type === "list-item") {
          run.push(child);
          continue;
        }
        if (run.length > limit && !run.every(isTask))
          matches.push({
            blockId: run[0]!.id,
            field: "list",
            evidence: `${run.length}:${text(run[0]!)}`,
            message: `List has ${run.length} items.`,
          });
        run = [];
      }
    }
    for (const b of context.blocks) {
      if (b.type !== "process-outline" || excluded.has(b.id)) continue;
      const visit = (steps: unknown, field: string) => {
        if (!Array.isArray(steps)) return;
        const actions = steps.filter((s) => s && s.kind !== "note");
        if (actions.length > limit)
          matches.push({
            blockId: b.id,
            field,
            evidence: `${actions.length}:${String(actions[0].text ?? "")}`,
            message: `Process Outline level has ${actions.length} steps.`,
          });
        steps.forEach((s, i) => visit(s?.steps, `${field}[${i}].steps`));
      };
      visit(b.props.steps, "props.steps");
    }
    return matches;
  },
};
