import type { LintRule } from "../../lint/types";
const docsPath = "99-appendix/10-style-guide/20-structure";
const base = {
  docsPath,
  severity: "warning" as const,
  enforcement: [] as const,
  exclusions: ["Schema validity, handled by existing validators"],
};
const text = (b: { text?: { insert: string }[] }) =>
  b.text?.map((s) => s.insert).join("") ?? "";
export const singleH1Rule: LintRule = {
  ...base,
  id: "structure.single-h1",
  audit: { id: "W1", severity: "warning" },
  applicability: "Document headings",
  suggestion: "Keep at most one H1 and use H2 for sections.",
  check: ({ blocks }) =>
    blocks
      .filter((b) => b.type === "heading" && (b.props.level ?? 1) === 1)
      .slice(1)
      .map((b) => ({
        blockId: b.id,
        field: "props.level",
        evidence: text(b),
        message: "Document has more than one H1.",
      })),
};
