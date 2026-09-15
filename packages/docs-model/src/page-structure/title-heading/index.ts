import type { DocDocument } from "../../doc-schema";
import type { DocOp } from "../../doc-ops";
import { orderedBlocks } from "../../lint/engine";
import type { LintRule } from "../../lint/types";

const normalize = (text: string) => text.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

function repeatedOpeningTitle(document: DocDocument) {
  if (!document.title?.trim()) return undefined;
  const first = orderedBlocks(document)[0];
  return first?.type === "heading" && (first.props.level ?? 1) === 1 &&
    normalize(first.text?.map(span => span.insert).join("") ?? "") === normalize(document.title)
    ? first : undefined;
}

export const titleHeadingRule: LintRule = {
  id: "structure.title-heading",
  docsPath: "99-appendix/10-style-guide/20-structure",
  severity: "error",
  enforcement: ["complete"],
  applicability: "An opening H1 that repeats the document display title",
  exclusions: ["Distinct opening H1s", "Later H1s", "Untitled documents"],
  suggestion: "Remove only the opening H1 that repeats the display title. Saves do this automatically while preserving its children. Other H1s remain unchanged.",
  check: ({ document }) => {
    const block = repeatedOpeningTitle(document);
    return block ? [{ blockId: block.id, field: "text", evidence: block.text?.map(span => span.insert).join("") ?? "", message: "The opening H1 repeats the document display title." }] : [];
  },
};

/** Remove only an opening H1 that repeats the title; never change heading levels. */
export function titleHeadingFixOps(document: DocDocument): DocOp[] {
  const block = repeatedOpeningTitle(document);
  return block ? [{ type: "deleteBlock", blockId: block.id, mode: "reparent" }] : [];
}
