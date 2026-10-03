/**
 * STE 5.4: put the condition before the instruction it guards. Judge-only. Code finds a command
 * followed by a condition clause, as in "Run the tests if the build passes", and Jev confirms it.
 * See clause.ts for the shapes that are left out, such as "Run this once per repository".
 */
import type { DocBlock, DocDocument } from "@codecaine-ai/docs-model";
import { blockMarkdown, nearestHeading, proseText, sentences } from "../../text";
import type { StyleRule } from "../../types";
import { conditionClauses } from "./clause";

/** A block whose text is all bold is a label for the bullets under it, not an instruction. */
const isLabel = (block: DocBlock) => !!block.text?.length && block.text.every((span) => span.attributes?.bold || !span.insert.trim());

/**
 * The condition clauses in a block that follow their command, in order. proseText marks each
 * code or reference span with "\u0000", so the span text is put back for Jev to read.
 */
function clausesIn(doc: DocDocument, id: string): string[] {
  const block = doc.blocks[id];
  if (!block?.text || isLabel(block)) return [];
  const step = block.type === "list-item" && block.props.ordered === true;
  const prose = proseText(block.text);
  const literals = block.text.filter((span) => span.attributes?.code || span.attributes?.reference).map((span) => (span.attributes?.code ? `\`${span.insert}\`` : span.insert));
  const restore = (clause: string, at: number) => {
    let next = (prose.slice(0, at).match(/\u0000/g) ?? []).length;
    return clause.replace(/\u0000/g, () => literals[next++] ?? "…");
  };
  let cursor = 0;
  return sentences(prose).flatMap((sentence) => {
    const start = Math.max(cursor, prose.indexOf(sentence, cursor));
    cursor = start + sentence.length;
    return conditionClauses(sentence, step).map((clause) => restore(clause, start + sentence.indexOf(clause)));
  });
}

export const conditionFirstRule: StyleRule = {
  id: "ste.condition-first",
  layer: "structure",
  // R1 found 24% of its rewrites bad. The finding stays for a person in the editor phase.
  rewrite: "none",
  docsPath: "99-appendix/10-style-guide/30-ste-profile",
  summary: "Put the condition before the instruction it guards (STE 5.4).",
  hint: "Move the clause that starts with if, unless, when, whenever, before, after, or until to the start of its sentence, as in \"If the build passes, run the tests.\" Keep its exact words, and leave every other phrase, such as \"once per repository\", where it is.",
  judge: {
    appliesTo: ["paragraph", "list-item", "callout"],
    select: (doc, id) => clausesIn(doc, id).length > 0,
    state: (doc, id) => ({ heading: nearestHeading(doc, id), block: blockMarkdown(doc.blocks[id]), clause: clausesIn(doc, id)[0] ?? "" }),
    // Calibrated on the 21 blocks the selection keeps in the corpus, all real. Asked about the
    // whole block, Jev scored them p50 0.38 once the question listed the condition words. Naming
    // the found clause raised them to p50 0.79, and "not how often" put a frequency phrase such
    // as "once per repository" at 0.14 if the selection ever let one through.
    question:
      "Does `block` give a command and then `clause`, a clause with its own subject and verb that says when or whether to follow that command, not how often?",
    threshold: 0.6,
    message: "An instruction comes before the condition that guards it.",
  },
};
