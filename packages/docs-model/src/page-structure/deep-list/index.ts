import type { LintRule } from "../../lint/types";
const docsPath = "99-appendix/10-style-guide/20-structure";
const base = {
  docsPath,
  severity: "error" as const,
  enforcement: ["complete"] as const,
  exclusions: ["Schema validity, handled by existing validators"],
};
const text = (b: { text?: { insert: string }[] }) =>
  b.text?.map((s) => s.insert).join("") ?? "";
export const deepListRule: LintRule = {
  ...base,
  id: "structure.deep-list",
  severity: "warning",
  enforcement: [],
  applicability: "Lists nested more than three list items deep",
  suggestion: "Flatten the list or move a branch into its own section.",
  check: ({ document }) => {
    const matches: ReturnType<LintRule["check"]> = [],
      seen = new Set<string>();
    function visit(id: string, depth: number) {
      if (seen.has(id)) return;
      seen.add(id);
      const b = document.blocks[id];
      if (!b) return;
      const next = b.type === "list-item" ? depth + 1 : 0;
      if (next > 3)
        matches.push({
          blockId: b.id,
          field: "children",
          evidence: `${next}:${text(b)}`,
          message: "List exceeds three nesting levels.",
        });
      b.children.forEach((id) => visit(id, next));
    }
    document.blocks[document.root]?.children.forEach((id) => visit(id, 0));
    return matches;
  },
};
