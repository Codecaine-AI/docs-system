/**
 * STE 3.6: use the active voice. A description may keep the passive when the actor is unknown or
 * not relevant, and a rewrite of an agentless passive tends to invent a wrong actor. So Tier 1
 * flags only the two passives that have an actor:
 * - a passive with a "by" phrase that names the actor: "The schema is validated by the server.";
 * - a passive in an instruction, whose actor is the reader: "Run the check after the file is saved."
 * The judge then keeps a block only when the active form keeps its meaning.
 */
import { nearestHeading } from "../../text/context";
import { blockMarkdown, sentences, tag, type Token } from "../../text";
import { isInstruction } from "../../text/procedural";
import { isQuoted } from "../../text/quotes";
import { sentenceFields } from "../../text/sentence-fields";
import { isAttributive, isBe, isParticiple, skipModifiers } from "../../text/verbs";
import type { StyleMatch, StyleRule } from "../../types";

export const passiveVoiceRule: StyleRule = {
  id: "ste.passive-voice",
  layer: "structure",
  docsPath: "99-appendix/10-style-guide/30-ste-profile",
  summary: "Passive voice with a known actor: a \"by\" phrase, or an instruction to the reader.",
  hint: "Make the sentence active only when the actor is named in a 'by' phrase or the sentence is an instruction to the reader. Keep every word of meaning. Do not add new instructions.",
  detect(context) {
    return sentenceFields(context).flatMap((field) =>
      sentences(field.text).flatMap((sentence) => {
        const found = passives(tag(sentence)).filter(({ start }) => !isQuoted(sentence, start));
        if (!found.length) return [];
        const instruction = isInstruction(sentence, field);
        return found
          .filter(({ byActor }) => byActor || instruction)
          .map(
            ({ start, end }): StyleMatch => ({
              blockId: field.blockId,
              field: field.field,
              message: `Passive voice: "${sentence.slice(start, end)}".`,
              evidence: sentence.slice(start, end),
              sentence,
            }),
          );
      }),
    );
  },
  judge: {
    appliesTo: ["paragraph", "list-item", "callout"],
    state: (doc, blockId) => ({ heading: nearestHeading(doc, blockId), block: blockMarkdown(doc.blocks[blockId]) }),
    question:
      "Does `block` contain a passive-voice sentence that can be rewritten in active voice because the actor is known or obvious, without losing meaning?",
    threshold: 0.7,
    message: "Passive voice where the actor is known.",
  },
};

interface Passive {
  start: number;
  end: number;
  /** A "by" phrase in the same clause names the actor. */
  byActor: boolean;
}

/** Participles that read as a plain state after "be": "The sweep is done." */
const STATES = new Set(["closed", "done", "finished", "gone", "locked", "opened", "unlocked"]);
/** Degree words make the participle an adjective: "is very limited", "is well known". */
const DEGREE = new Set(["less", "least", "more", "most", "quite", "rather", "so", "too", "very", "well"]);

const word = (token: Token | undefined) => token?.text.toLowerCase() ?? "";

/** Each be + participle phrase, such as "is validated", "are not stored", or "is being written". */
function passives(tokens: readonly Token[]): Passive[] {
  const found: Passive[] = [];
  tokens.forEach((aux, i) => {
    if (!isBe(aux)) return;
    const from = word(tokens[i + 1]) === "being" ? i + 2 : i + 1;
    const at = skipModifiers(tokens, from);
    const verb = tokens[at];
    if (at < 0 || !verb || !isParticiple(verb)) return;
    // An un- participle names a state with no active verb: "is unchanged", "is unused".
    if (STATES.has(word(verb)) || DEGREE.has(word(tokens[at - 1])) || /^un(?!der)/.test(word(verb))) return;
    // A participle that is part of a compound, or that describes a noun, is an adjective:
    // "is read-only", "document order is curated order".
    const next = tokens[at + 1];
    if ((next?.text === "-" && next.start === verb.end) || isAttributive(next)) return;
    found.push({ start: aux.start, end: verb.end, byActor: hasByActor(tokens, at + 1) });
  });
  return found;
}

/** Words that end a clause: a "by" past them belongs to another verb. */
const CLAUSE_END = new Set([",", ";", ":", "(", ")", "—", "–", ".", "!", "?"]);
const CLAUSE_WORDS = new Set(["because", "if", "unless", "when", "where", "which", "while", "who", "although", "though", "since", "until"]);

/** True when a "by" phrase after the participle, in the same clause, names an actor. */
function hasByActor(tokens: readonly Token[], from: number): boolean {
  for (let i = from; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (CLAUSE_END.has(token.text) || token.pos === "SCONJ" || CLAUSE_WORDS.has(word(token)) || isBe(token)) return false;
    if (word(token) === "by") return isActor(tokens[i + 1], tokens[i + 2]);
  }
  return false;
}

/**
 * An actor after "by": "the server", "Jev", "agents", or a code name. A bare singular noun or an
 * -ing verb names a means or a manner instead: "by default", "by name", "by using a key".
 */
function isActor(next: Token | undefined, after: Token | undefined): boolean {
  if (!next) return false;
  if (next.code || next.pos === "PROPN") return true;
  if (next.pos === "DET") return !(word(next) === "the" && /^(?:time|way)$/.test(word(after)));
  if (next.pos === "PRON") return !/sel(?:f|ves)$/.test(word(next));
  return next.pos === "NOUN" && /s$/.test(word(next)) && word(next) !== next.lemma;
}
