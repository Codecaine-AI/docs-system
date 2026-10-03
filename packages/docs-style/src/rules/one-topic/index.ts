/**
 * STE 4.1: one topic in each sentence. Judge-only: code cannot tell one topic from two, so Jev
 * reads each block long enough to hold a second topic.
 */
import { nearestHeading } from "../../text/context";
import { blockMarkdown, proseText, steWordCount } from "../../text";
import type { StyleRule } from "../../types";

/** A shorter block rarely has room for two topics, so it is not worth a question. */
const MIN_WORDS = 12;

export const oneTopicRule: StyleRule = {
  id: "ste.one-topic",
  layer: "structure",
  docsPath: "99-appendix/10-style-guide/30-ste-profile",
  summary: "One topic in each sentence (STE 4.1).",
  hint: "Split each sentence that joins two complete statements into two sentences, one topic each. Keep every fact and condition.",
  judge: {
    appliesTo: ["paragraph", "list-item", "callout"],
    select: (doc, id) => steWordCount(proseText(doc.blocks[id]?.text)) >= MIN_WORDS,
    state: (doc, id) => ({ heading: nearestHeading(doc, id), block: blockMarkdown(doc.blocks[id]) }),
    // Calibrated on 4 pages (130 blocks). Asked about "two topics", Jev scored blocks whose
    // sentences each carry one fact as high as true joins (AUC 0.83). Asked about the form
    // that carries two topics, two complete sentences joined into one, it separates (AUC 0.95).
    question: "Does `block` contain a sentence that holds two complete sentences joined by a comma and conjunction, a semicolon, a colon, or a dash?",
    threshold: 0.6,
    message: "A sentence joins two topics.",
  },
};
