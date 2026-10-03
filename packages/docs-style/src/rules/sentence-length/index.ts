/**
 * STE 5.1 and 6.3: an instruction has at most 20 words and a description at most 25. Words are
 * STE words, so a code span, a number with its unit, and a parenthetical each count as one.
 */
import { thresholds } from "../../profile";
import { sentences, steWordCount } from "../../text";
import { isInstruction } from "../../text/procedural";
import { sentenceFields } from "../../text/sentence-fields";
import type { StyleMatch, StyleRule } from "../../types";

export const sentenceLengthRule: StyleRule = {
  id: "ste.sentence-length",
  layer: "structure",
  docsPath: "99-appendix/10-style-guide/30-ste-profile",
  summary: `Instructions over ${thresholds.proceduralSentenceWords} words and descriptions over ${thresholds.descriptiveSentenceWords} words.`,
  hint: `Split the sentence at a second thought, so an instruction has at most ${thresholds.proceduralSentenceWords} words and a description at most ${thresholds.descriptiveSentenceWords}. Keep every fact and condition, and the words that link the ideas.`,
  detect(context) {
    const { proceduralSentenceWords, descriptiveSentenceWords } = thresholds;
    return sentenceFields(context).flatMap((field) =>
      sentences(field.text).flatMap((sentence): StyleMatch[] => {
        const words = steWordCount(sentence);
        // Only a sentence between the two limits needs the (slower) instruction test.
        if (words <= Math.min(proceduralSentenceWords, descriptiveSentenceWords)) return [];
        const instruction = isInstruction(sentence, field);
        const limit = instruction ? proceduralSentenceWords : descriptiveSentenceWords;
        if (words <= limit) return [];
        return [
          {
            blockId: field.blockId,
            field: field.field,
            message: `${instruction ? "Instruction" : "Sentence"} has ${words} words. The limit is ${limit}.`,
            evidence: sentence,
            sentence,
          },
        ];
      }),
    );
  },
};
