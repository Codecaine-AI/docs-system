import type { DeltaSpan } from "../../doc-schema";
import type { LintRule } from "../../lint/types";
import { excludedBlockIds, wordCount } from "../../writing/prose";
const docsPath = "99-appendix/10-style-guide/20-structure";
const text = (b: { text?: { insert: string }[] }) =>
  b.text?.map((s) => s.insert).join("") ?? "";
/**
 * A label colon is followed by a space or ends the text, so URLs and times
 * like 10:30 never match. Code spans and parenthetical asides do not count as
 * label words. Plain labels stop at three words because longer ones are
 * usually a clause before a list. A bold label reads as a label up to five words.
 */
function labelColonMessage(spans: DeltaSpan[]): string | undefined {
  let prose = "",
    bold = "";
  for (const s of spans) {
    const piece =
      s.attributes?.code || s.attributes?.reference
        ? "\u0000"
        : s.insert.replace(/(`+)[\s\S]*?\1/g, "\u0000");
    prose += piece;
    bold += (s.attributes?.bold ? "b" : " ").repeat(piece.length);
  }
  const colon = prose.search(/:(\s|$)/);
  if (colon < 0) return undefined;
  const label = prose.slice(0, colon),
    words = wordCount(label.replace(/\([^()]*\)/g, " "));
  if (words < 1) return undefined;
  if (!prose.slice(colon + 1).trim())
    return words <= 3
      ? "Text is a short lead-in that ends in a colon."
      : undefined;
  const boldLabel = [...label].every(
    (c, i) => bold[i] === "b" || /[\s\u0000]/.test(c),
  );
  return words <= (boldLabel ? 5 : 3)
    ? "Text opens with a label and a colon."
    : undefined;
}
export const labelColonOpenerRule: LintRule = {
  id: "structure.label-colon-opener",
  docsPath,
  severity: "warning",
  enforcement: [],
  applicability:
    "Paragraphs and list items that open with a label and a colon (up to 3 words, or 5 when bold), or are a lead-in of up to 3 words ending in a colon",
  exclusions: [
    "Labels made only of code spans",
    "Colons inside code spans, URLs and times",
  ],
  suggestion:
    "Write a complete sentence instead of a label and a colon. Put a label in a parent bullet and its detail in sub-bullets.",
  check: (context) => {
    const excluded = excludedBlockIds(context);
    return context.blocks.flatMap((b) => {
      if (
        (b.type !== "paragraph" && b.type !== "list-item") ||
        excluded.has(b.id)
      )
        return [];
      const message = labelColonMessage(b.text ?? []);
      return message
        ? [{ blockId: b.id, field: "text", evidence: text(b), message }]
        : [];
    });
  },
};
