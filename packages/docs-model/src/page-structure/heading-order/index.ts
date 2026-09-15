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
export const headingOrderRule: LintRule = {
  ...base,
  id: "structure.heading-order",
  applicability: "Document headings, with sections starting at H2",
  suggestion: "Use the next heading level without skipping a level.",
  check: ({ blocks }) => {
    let previous = 1;
    return blocks.flatMap((b) => {
      if (b.type !== "heading") return [];
      const level = Number(b.props.level ?? 1),
        skipped = level > previous + 1;
      const evidence = `${previous}:${level}:${text(b)}`;
      previous = level;
      return skipped
        ? [
            {
              blockId: b.id,
              field: "props.level",
              evidence,
              message: "Heading skips a level.",
            },
          ]
        : [];
    });
  },
};
