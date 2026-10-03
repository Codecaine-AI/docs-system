/**
 * STE 6.6, tightened: a paragraph has at most 4 sentences. The whole paragraph is the finding, so
 * a rewrite may change every sentence in it.
 */
import { thresholds } from "../../profile";
import { authoredProse, sentences } from "../../text";
import type { StyleRule } from "../../types";

export const paragraphLengthRule: StyleRule = {
  id: "ste.paragraph-length",
  layer: "structure",
  // Restructuring a paragraph needs judgment, so a person does it. The finding stays a finding.
  rewrite: "none",
  docsPath: "99-appendix/10-style-guide/30-ste-profile",
  summary: `Paragraphs with more than ${thresholds.paragraphSentences} sentences.`,
  hint: `Bring the paragraph to at most ${thresholds.paragraphSentences} sentences, and use list form only when it is allowed. Keep every fact and condition.`,
  detect(context) {
    const limit = thresholds.paragraphSentences;
    return authoredProse(context).flatMap((field) => {
      if (!field.paragraph) return [];
      const count = sentences(field.text).length;
      if (count <= limit) return [];
      return [
        {
          blockId: field.blockId,
          field: field.field,
          message: `Paragraph has ${count} sentences. The limit is ${limit}.`,
          evidence: field.text,
        },
      ];
    });
  },
};
