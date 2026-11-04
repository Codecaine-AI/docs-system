import type { LintRule } from "../../lint/types";
import type { DeltaSpan } from "../../doc-schema";
const docsPath = "99-appendix/10-style-guide/10-writing-style";
/** Text blocks whose delta renders as is: a backtick in a plain span shows as a backtick, not as inline code. */
const TEXT_BLOCKS = new Set(["paragraph", "heading", "list-item", "callout"]);
/** A pair inside one run of plain text. A code or reference span breaks the run. */
const pair = /`[^`\n\u0000]+`/;
export const literalBackticksRule: LintRule = {
  id: "writing.literal-backticks",
  docsPath,
  severity: "error",
  enforcement: ["complete"],
  applicability: "Plain spans of paragraph, heading, list-item and callout text",
  exclusions: ["Spans with the code or reference mark", "Code blocks and string props that render markdown"],
  suggestion:
    "Delta text is literal, so the reader sees the backticks. Rewrite the block with docs_write_text markdown, or give the span attributes { code: true } without the backticks.",
  check: (context) =>
    context.blocks.flatMap((b) => {
      if (!TEXT_BLOCKS.has(b.type)) return [];
      const plain = (b.text ?? []).map((s: DeltaSpan) => (s.attributes?.code || s.attributes?.reference ? "\u0000" : s.insert)).join("");
      const match = plain.match(pair);
      return match ? [{ blockId: b.id, field: "text", evidence: match[0], message: "Plain text shows a literal backtick pair instead of inline code." }] : [];
    }),
};
