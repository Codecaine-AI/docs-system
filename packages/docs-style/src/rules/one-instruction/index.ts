/**
 * STE 5.2: one instruction in each sentence and each numbered step. Judge-only: Jev reads
 * blocks that read as instructions, either because they open with a command or because they
 * are numbered steps.
 */
import type { DocBlock } from "@codecaine-ai/docs-model";
import { markdownSentences, nearestHeading } from "../../text/context";
import { opensWithCommand } from "../../text/imperative";
import { blockMarkdown, proseText, sentences } from "../../text";
import type { StyleRule } from "../../types";

const numbered = (block: DocBlock | undefined) => block?.type === "list-item" && block.props.ordered === true;
/** A block whose text is all bold is a label for the bullets under it, not an instruction. */
const label = (block: DocBlock | undefined) => !!block?.text?.length && block.text.every((span) => span.attributes?.bold || !span.insert.trim());

export const oneInstructionRule: StyleRule = {
  id: "ste.one-instruction",
  layer: "structure",
  // R1 found 20% of its rewrites bad. The finding stays for a person in the editor phase.
  rewrite: "none",
  docsPath: "99-appendix/10-style-guide/30-ste-profile",
  summary: "One instruction in each sentence and each numbered step (STE 5.2).",
  hint: "Give each instruction its own sentence, in the order the reader does them. Keep every condition with its instruction.",
  judge: {
    appliesTo: ["list-item", "paragraph"],
    select: (doc, id) => {
      const block = doc.blocks[id];
      if (label(block)) return false;
      if (numbered(block)) return true;
      const first = sentences(proseText(block?.text))[0];
      return first !== undefined && opensWithCommand(first);
    },
    // Jev judges each sentence alone, so `step` lists them. A numbered step is one unit, so its
    // sentences stay together: two commands anywhere in the step break the rule.
    state: (doc, id) => {
      const markdown = blockMarkdown(doc.blocks[id]);
      return { heading: nearestHeading(doc, id), step: numbered(doc.blocks[id]) ? [markdown] : markdownSentences(markdown) };
    },
    // Calibrated on 10 pages. Asked about the whole block, Jev flagged blocks of one-command
    // sentences and commands with several objects (AUC 0.70). Asked per sentence, with the
    // several-objects case named, it separates (AUC 0.98 on the 4 calibration pages).
    question: "Does any one sentence in `step` tell the reader to do two separate actions, each with its own verb? One verb with several objects is one action.",
    threshold: 0.75,
    message: "A sentence or numbered step gives more than one instruction.",
  },
};
