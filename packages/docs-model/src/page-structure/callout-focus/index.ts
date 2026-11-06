import type { DocBlock } from "../../doc-schema";
import type { LintRule } from "../../lint/types";
import { proseText, sentences } from "../../writing/prose";

/** The words a printed callout label shows: each tone name and the forms a title uses to repeat it. */
const TONE_WORDS = new Set([
  "info", "note", "decision", "decided", "decide", "risk", "risky", "warning", "warn", "caution", "success", "succeeded", "important", "tip",
]);
/** Short words that carry no topic, so two texts that share only them do not repeat each other. */
const MINOR = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for", "from", "has", "in", "into", "is", "it", "its", "no", "not",
  "of", "on", "only", "or", "that", "the", "their", "them", "then", "this", "to", "until", "when", "with", "without",
]);
/** The most sentences a callout body holds: one labeled fact and at most one sentence of support. */
export const CALLOUT_MAX_SENTENCES = 2;
/** The share of a title's topic words that, found in the body's first sentence, makes the title a repeat. */
const ECHO_SHARE = 0.6;

const words = (text: string) => text.toLowerCase().replace(/\u0000/g, " ").split(/[^\p{L}\p{N}_]+/u).filter(Boolean);
/** A crude stem, so "writes" and "write" or "refused" and "refuses" match. */
const stem = (word: string) => word.replace(/(ing|ed|es|s)$/, "");
const topicWords = (text: string) => words(text).filter((w) => !MINOR.has(w)).map(stem);

/** The callout's body prose: its own text, then the text of each paragraph or list item nested in it. */
function bodyText(block: DocBlock, blocks: Record<string, DocBlock>): string {
  const parts = [proseText(block.text)];
  for (const id of block.children) {
    const child = blocks[id];
    if (child && ["paragraph", "list-item"].includes(child.type)) parts.push(proseText(child.text));
  }
  return parts.filter((p) => p.trim()).join(" ");
}

/**
 * A callout is one labeled fact. Three faults blur it:
 * - A title that repeats the printed label, such as "Decided: ..." under the Decision label.
 * - A title whose topic words mostly reappear in the body's first sentence, so the head line says it twice.
 * - A body of more than CALLOUT_MAX_SENTENCES sentences, a section wearing a rail.
 * The quality climb judges flagged each one on most callouts in the rich-text lane's round 0.
 */
export const calloutFocusRule: LintRule = {
  docsPath: "10-system-design/40-block-vocabulary/10-text-and-media/10-rich-text/14-callout",
  id: "structure.callout-focus",
  severity: "warning",
  enforcement: [],
  exclusions: ["A title that names a fact the body does not state", "A callout of one or two sentences"],
  applicability: "Callout blocks",
  suggestion: "Delete a title that repeats the label or the body, or make it name a fact the body does not state. Keep the body to one or two sentences and move reasons, examples and lists into the prose after the callout.",
  check: ({ document, blocks }) => {
    const matches: ReturnType<LintRule["check"]> = [];
    for (const block of blocks) {
      if (block.type !== "callout") continue;
      const title = typeof block.props.title === "string" ? block.props.title.trim() : "";
      const body = bodyText(block, document.blocks);
      const kind = typeof block.props.kind === "string" ? block.props.kind.trim().toLowerCase() : "";
      if (title) {
        const first = words(title)[0] ?? "";
        const tone = typeof block.props.tone === "string" ? block.props.tone : "info";
        if (TONE_WORDS.has(first) || first === tone || (kind && title.toLowerCase().startsWith(kind))) {
          matches.push({ blockId: block.id, field: "props.title", evidence: title, message: `The title "${title}" opens with "${title.split(/\s+/)[0]}", which repeats the printed label.` });
        } else {
          const own = [...new Set(topicWords(title))];
          const lead = new Set(topicWords(sentences(body)[0] ?? ""));
          const shared = own.filter((w) => lead.has(w));
          if (own.length >= 2 && shared.length / own.length >= ECHO_SHARE) {
            matches.push({ blockId: block.id, field: "props.title", evidence: title, message: `The title "${title}" repeats the body's first sentence (${shared.length} of its ${own.length} topic words), so the head line says it twice.` });
          }
        }
      }
      const count = sentences(body).length;
      if (count > CALLOUT_MAX_SENTENCES) {
        matches.push({ blockId: block.id, field: "text", evidence: body.replace(/\u0000/g, "…").slice(0, 80), message: `The callout body has ${count} sentences. A callout states one fact in one or two sentences.` });
      }
    }
    return matches;
  },
};
