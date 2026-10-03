/**
 * ste.dash-gloss: one fixed repair for the two most common em-dash shapes. The rewrite model fixed
 * these shapes three different ways, so Tier 1 fixes them one way.
 *
 * A block that opens with a reference or code span (the label), or a run of them joined by spaces:
 * - When the gloss starts with a verb the label is the subject of, the dash goes and the words
 *   stay: "[Interaction] — owns the gesture behavior" becomes "[Interaction] owns the gesture
 *   behavior". A colon there would read as a label-colon opener.
 * - When the gloss is a noun phrase that defines the label, the dash becomes a colon:
 *   "[The data model] — the shapes it realizes" becomes "[The data model]: the shapes it realizes".
 *   The house label-colon rule ignores reference labels.
 * - Any other gloss, such as a clause with its own subject, keeps its dash for a rewrite.
 *
 * A block that opens with "Applies to:":
 * - "Applies to: X — rule text" becomes "Applies to: X. Rule text", but only when the rule text is
 *   a full clause with a finite verb. A verbless phrase cut off by a period reads as a fragment.
 *
 * In both shapes, a gloss that opens with an attaching word ("including", "such as") gets a comma,
 * which keeps it attached. A gloss with another em dash gets no fix, and neither does a fix that
 * would add a colon to a sentence that has one, or open the item with a label and a colon.
 * The fix edits only the plain span that holds the dash, so code, reference, and link spans never
 * change. Every other em dash stays with writing.no-em-dash and the rewrite model.
 */
import type { DeltaSpan, DocBlock, DocDocument } from "@codecaine-ai/docs-model";
import { lintRules } from "@codecaine-ai/docs-model/lint";
import { excludedBlockIds, sentences, tag } from "../../text";
import { hasFiniteVerb, isFinite, termsOf } from "../../text/clause";
import { editPlainSpans, isPlainSpan, spanProse } from "../../text/span-edit";
import type { StyleMatch, StyleRule } from "../../types";
import { sentenceAt, sentenceSpans } from "../replacement/match";

/** Block types whose `text` StyleRule.autofix receives. */
const FIXABLE = new Set(["paragraph", "list-item", "callout", "heading"]);
/**
 * Plain text that may join two labels in a run: spaces only. The core label-colon rule counts
 * "," and "and" as label words, so "`a.ts`, `b.ts`: gloss" would trade this finding for that one.
 */
const JOINER = /^\s+$/;
const DASH = /\s*—\s*/;
/**
 * Words that attach a phrase to the words before it, so a comma can replace the dash. Lowercase
 * only: a capital after a comma would read as a new sentence.
 */
const ATTACHING =
  /^(including|excluding|especially|except|such as|other than|apart from|aside from|along with|together with|as well as)(?![\p{L}\p{N}])/u;
const MODALS = new Set(["can", "cannot", "must", "may", "might", "will", "would", "shall", "should", "could"]);
/** Finite forms that agree with one label as a singular subject. */
const SINGULAR_AUXILIARIES = new Set(["is", "has", "does", "was"]);
/** Words after a verb that start its object or complement: "decides where", "owns only". */
const COMPLEMENTS = new Set(["how", "what", "where", "when", "whether", "which", "why", "who", "that", "if"]);
/** wink tags that start an object noun phrase. */
const OBJECT_TAGS = new Set(["DET", "ADJ", "NOUN", "PROPN", "NUM", "PRON", "ADV"]);

type Outcome = "colon" | "join" | "period" | "comma" | "verbless" | "clause" | "nested";

interface Plan {
  shape: "gloss" | "applies";
  outcome: Outcome;
  /** The index of the plain span that holds the dash. */
  span: number;
  /** The offset of the dash in spanProse(spans). */
  at: number;
  /** That span's text after the fix. Undefined when no fix is safe. */
  text?: string;
  /** The attaching word, for a comma. */
  word?: string;
}

function isLiteral(span: DeltaSpan | undefined): boolean {
  return Boolean(span?.attributes?.code || span?.attributes?.reference);
}

/** Where the dash sits, and how to fix it. Undefined when neither shape fits. */
function plan(spans: readonly DeltaSpan[]): Plan | undefined {
  const offsetOf = (index: number) => spanProse(spans.slice(0, index)).length;
  let shape: Plan["shape"];
  let i: number;
  if (isLiteral(spans[0])) {
    // Skip the opening run: labels, and the joiners between two labels.
    shape = "gloss";
    i = 1;
    const joins = (span: DeltaSpan | undefined) => !!span && isPlainSpan(span) && JOINER.test(span.insert);
    while (isLiteral(spans[i]) || (joins(spans[i]) && isLiteral(spans[i + 1]))) i++;
    const span = spans[i];
    if (!span || !isPlainSpan(span) || !/^\s*—/.test(span.insert)) return undefined;
  } else {
    if (!/^\s*applies to:/i.test(spanProse(spans))) return undefined;
    shape = "applies";
    i = spans.findIndex((span) => isPlainSpan(span) && span.insert.includes("—"));
    if (i === -1) return undefined;
  }
  const insert = spans[i]!.insert;
  const dash = DASH.exec(insert)!;
  const at = offsetOf(i) + insert.indexOf("—");
  const head = insert.slice(0, dash.index);
  const rest = insert.slice(dash.index + dash[0].length);
  const gloss = spanProse(spans).slice(at + 1).trim();
  // A gloss of nothing, or of a lone code span, has no words to judge.
  if (!/[\p{L}\p{N}]/u.test(gloss)) return undefined;
  const base = { shape, span: i, at };
  const sentence = sentences(gloss)[0] ?? gloss;
  const hasColon = /:(\s|$)/.test(sentence);
  if (sentence.includes("—")) return { ...base, outcome: "nested" };
  const word = ATTACHING.exec(gloss)?.[1];
  if (word) return hasColon ? { ...base, outcome: "nested" } : { ...base, outcome: "comma", word, text: `${head}, ${rest}` };
  if (shape === "gloss") {
    const verb = leadingVerb(gloss, i === 1);
    if (verb === "join") {
      const text = `${head} ${rest}`;
      // "[X] owns gesture behavior: the machine" would open the item with a label and a colon.
      const joined = spans.map((span, k) => (k === i ? { ...span, insert: text } : span));
      return opensWithLabel(joined) ? { ...base, outcome: "nested" } : { ...base, outcome: "join", text };
    }
    if (verb === "unsure") return { ...base, outcome: "clause" };
    if (hasColon) return { ...base, outcome: "nested" };
    const clause = sentence.split(";")[0]!;
    if (!isNounPhrase(clause)) return { ...base, outcome: "clause" };
    return { ...base, outcome: "colon", text: `${head}: ${rest}` };
  }
  if (hasColon) return { ...base, outcome: "nested" };
  if (!hasFiniteVerb(sentence.split(";")[0]!)) return { ...base, outcome: "verbless" };
  return { ...base, outcome: "period", text: `${head}. ${rest.charAt(0).toUpperCase()}${rest.slice(1)}` };
}

/**
 * Whether the gloss opens with a verb whose subject is the label: "join" when it does, "unsure"
 * when the first word could be a verb, and undefined when it is not one.
 * - A modal joins any label: "[X] must stay pure".
 * - "is", "has", "does", and "was", and an -s verb ("owns", "defines"), join one label only.
 * - An -s word is also a plural noun ("rules for writing"), so an -s verb joins only when
 *   compromise reads it as a verb after a subject, a second reading agrees (compromise on the
 *   gloss alone, or wink), and an object follows. One vote alone is "unsure".
 */
function leadingVerb(gloss: string, oneLabel: boolean): "join" | "unsure" | undefined {
  const first = /^[\p{L}]+/u.exec(gloss)?.[0];
  if (!first) return undefined;
  const word = first.toLowerCase();
  const tokens = tag(gloss);
  const next = tokens[1];
  if (!next || /^\p{P}/u.test(next.text)) return MODALS.has(word) || SINGULAR_AUXILIARIES.has(word) ? "unsure" : undefined;
  if (MODALS.has(word)) return next.pos === "VERB" || next.pos === "AUX" || next.pos === "ADV" || next.pos === "PART" ? "join" : "unsure";
  if (SINGULAR_AUXILIARIES.has(word)) return oneLabel ? "join" : "unsure";
  if (!/[^s]s$/.test(word) || word.length < 4) return undefined;
  const afterSubject = termsOf(`Foo ${gloss}`)[1];
  const alone = termsOf(gloss)[0];
  const votes = [afterSubject && isFinite(afterSubject), alone?.tags.has("Verb") && !alone.tags.has("Noun"), tokens[0]?.pos === "VERB"];
  if (!votes.some(Boolean)) return undefined;
  const object = next.code || OBJECT_TAGS.has(next.pos) || COMPLEMENTS.has(next.text.toLowerCase());
  return oneLabel && object && votes[0] && (votes[1] || votes[2]) ? "join" : "unsure";
}

/**
 * True when `clause` is a noun phrase: it opens with a determiner, an adjective, a number, a
 * name, a noun, or a gerund ("routing, anchor resolution"), and it has no finite verb of its own.
 */
function isNounPhrase(clause: string): boolean {
  const first = termsOf(clause)[0];
  if (!first) return false;
  const { tags } = first;
  const opens =
    tags.has("Determiner") ||
    tags.has("Gerund") ||
    tags.has("Value") ||
    ((tags.has("Adjective") || tags.has("Noun") || tags.has("ProperNoun")) && !tags.has("Verb"));
  return opens && !hasFiniteVerb(clause);
}

const labelColonRule = lintRules.find((rule) => rule.id === "structure.label-colon-opener");

/** True when the core label-colon rule would flag this text as a paragraph. */
function opensWithLabel(text: DeltaSpan[]): boolean {
  if (!labelColonRule) return false;
  const block: DocBlock = { id: "b", type: "paragraph", props: {}, text, children: [] };
  const root: DocBlock = { id: "r", type: "paragraph", props: {}, children: ["b"] };
  const document: DocDocument = { schemaVersion: 1, id: "dash-gloss", root: "r", blocks: { r: root, b: block } };
  return labelColonRule.check({ document, blocks: [block] }).length > 0;
}

// ---------------------------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------------------------

function message(found: Plan): string {
  switch (found.outcome) {
    case "colon":
      return "Replace the em dash after the opening reference or code span with a colon.";
    case "join":
      return "Delete the em dash. The label is the subject of the verb after it.";
    case "period":
      return 'End the "Applies to" list with a period instead of an em dash, and start the rule as a new sentence.';
    case "comma":
      return `Replace the em dash before "${found.word}" with a comma.`;
    case "verbless":
      return 'Rewrite the em dash after the "Applies to" list. The text after it has no verb, so keep it attached to the list.';
    case "clause":
      return "Rewrite the em dash after the label. A colon fits only a phrase that defines the label, and a space only a verb the label is the subject of.";
    case "nested":
      return "Rewrite the em dash. A colon or another em dash in the text after it rules out a simple fix.";
  }
}

export const dashGlossRule: StyleRule = {
  id: "ste.dash-gloss",
  layer: "structure",
  // Every dash this rule flags is also a writing.no-em-dash finding, which starts the rewrite. This
  // finding adds the fix and the hint, and never starts a rewrite of its own.
  rewrite: "none",
  docsPath: "99-appendix/10-style-guide/10-writing-style",
  summary: 'Fixes the em dash after an opening reference label and after an "Applies to" list.',
  hint: 'After an opening reference or code span, delete the em dash when the label is the subject of the verb after it, and use a colon only when a phrase after it defines the label. After "Applies to: X", make the rule its own sentence only when it has its own verb, and otherwise keep the phrase attached to the list.',
  detect(context) {
    const excluded = excludedBlockIds(context);
    const matches: StyleMatch[] = [];
    for (const block of context.blocks) {
      if (!FIXABLE.has(block.type) || !block.text || excluded.has(block.id)) continue;
      const found = plan(block.text);
      if (!found) continue;
      const sentence = sentenceAt(sentenceSpans(spanProse(block.text)), found.at);
      matches.push({
        blockId: block.id,
        field: "text",
        message: message(found),
        evidence: sentence ?? spanProse(block.text),
        sentence,
        autofixable: found.text !== undefined,
      });
    }
    return matches;
  },
  autofix(text) {
    const found = plan(text);
    if (found?.text === undefined) return undefined;
    const start = spanProse(text.slice(0, found.span)).length;
    return editPlainSpans(text, (insert, at) => (at.start === start ? found.text! : insert));
  },
};
