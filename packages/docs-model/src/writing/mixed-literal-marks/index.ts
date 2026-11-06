import type { LintRule } from "../../lint/types";
import { authoredProse, sentences } from "../prose";

/** A short literal in straight or curly double quotes: up to 3 words, no space inside either quote mark. */
const QUOTED = /["“]([^"”\s](?:[^"”]{0,30}[^"”\s])?)["”]/g;

/**
 * A sentence that marks one literal as inline code and quotes another, such as
 * 'replaces `in order to` with "to"'. The two literals play the same role, so they take the same mark.
 * Every quality climb judge flagged this pair on one rich-text climb page in each of rounds 0 to 7.
 */
export const mixedLiteralMarksRule: LintRule = {
  id: "writing.mixed-literal-marks",
  docsPath: "99-appendix/10-style-guide/10-writing-style",
  severity: "warning",
  enforcement: [],
  applicability: "A sentence of authored prose that holds an inline code span and a quoted literal of 3 words or fewer",
  exclusions: ["Quoted text of more than 3 words, such as a quoted sentence", "Sentences with no inline code"],
  suggestion: "Mark the quoted literal as inline code too, so both literals in the sentence share one mark.",
  // A doc reference prints its own text, so only a code span counts as a code literal here.
  check: (context) =>
    authoredProse(context, { referencesAsText: true }).flatMap((p) =>
      sentences(p.text).flatMap((sentence) => {
        if (!sentence.includes("\u0000")) return [];
        const quoted = [...sentence.matchAll(QUOTED)].map((m) => m[1]!).filter((q) => q.split(/\s+/).length <= 3);
        return quoted.length
          ? [{ blockId: p.blockId, field: p.field, evidence: sentence.replace(/\u0000/g, "…"), message: `The sentence marks a literal as code but quotes "${quoted[0]}". Give both literals the code mark.` }]
          : [];
      }),
    ),
};
