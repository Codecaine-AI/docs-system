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
export const openingParagraphRule: LintRule = {
  ...base,
  id: "structure.opening-paragraph",
  audit: { id: "W4", severity: "warning" },
  applicability: "Document body, after an optional initial H1",
  suggestion:
    "Start the body with a nonempty paragraph that explains the page.",
  check: ({ document, blocks }) => {
    const body = blocks.filter(
      (b) =>
        b.id !== document.root || b.type !== "paragraph" || !!text(b).trim(),
    );
    const first =
      body[0]?.type === "heading" && (body[0].props.level ?? 1) === 1
        ? body[1]
        : body[0];
    return first?.type === "paragraph" && text(first).trim()
      ? []
      : [
          {
            blockId: first?.id,
            field: "body",
            evidence: "missing-opening-paragraph",
            message: "Document body needs an opening paragraph.",
          },
        ];
  },
};
