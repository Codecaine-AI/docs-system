/**
 * Finds the condition clauses that follow a command, as in "Run the tests if the build passes."
 * The fix moves such a clause to the front, so this keeps only the clauses that can move. Each
 * skip below is a shape that the wave 1 reviews rejected or a shape that is not a condition:
 * - a phrase with no subject and verb: "once per repository", "before editing", "if needed";
 * - a clause that holds a pronoun, which would then come before its noun: "Only when they ...";
 * - a clause that belongs to another clause, or to the second of two commands;
 * - an asked question ("Check if the file exists") or a time ("a time when the server is idle").
 *
 * Input is proseText output, where each code or reference span is one "\u0000".
 */
import nlp from "compromise";
import { isProcedural, isQuoted, opensWithCommand, tag, type Token } from "../../text";

/**
 * The words that open a condition clause. "once" is not one of them: in this corpus it is almost
 * always a frequency ("once per repository"), and moving it changed what a step means.
 */
const CONDITION_WORDS = new Set(["if", "unless", "when", "whenever", "before", "after", "until"]);
/** These always open a clause. "before", "after", and "until" can also open a phrase: "before the release". */
const ALWAYS_CLAUSE = new Set(["if", "unless", "when", "whenever"]);
/** Adverbs that can come before the verb of a command, as in text/imperative.ts. */
const LEAD_ADVERBS = new Set(["then", "also", "first", "next", "finally", "always", "never", "only"]);
/** Verbs that take an if- or when-clause as their object: "Check if the file exists" asks a question. */
const ASKING_VERBS = new Set([
  "ask", "check", "choose", "confirm", "consider", "decide", "describe", "determine", "document", "establish",
  "evaluate", "examine", "explain", "find", "indicate", "inspect", "investigate", "know", "learn", "list", "log",
  "mention", "note", "record", "remember", "report", "say", "see", "show", "specify", "state", "tell", "test",
  "track", "verify", "watch",
]);
/** Nouns that "when" can describe: "a time when the server is idle" names a time. */
const TIME_NOUNS = new Set(["time", "times", "moment", "day", "days", "period", "point", "case", "cases", "situation", "situations"]);
/** Words that open a clause of their own. A condition after one belongs to that clause, not to the command. */
const NESTING = new Set(["because", "since", "so", "that", "which", "who", "whom", "whose", "where", "while", "although", "though", "whether"]);
/** Words that end a condition clause's subject-and-verb search. */
const RELATIVES = new Set(["that", "which", "who", "whose", "where"]);
/** Pronouns that point back to a noun. In a fronted clause they come before that noun. */
const POINTING_BACK = new Set(["it", "its", "they", "them", "their", "theirs"]);
const DEMONSTRATIVES = new Set(["this", "that", "these", "those"]);
const NOMINAL = new Set(["NOUN", "PROPN", "PRON", "NUM"]);
const MODIFIER = new Set(["DET", "ADJ", "NUM"]);
const QUOTE = /^["'“”‘’]$/;
const BOUNDARY = /^[.;:!?()[\]—–]$/;

interface Word extends Token {
  quoted: boolean;
  /** compromise reads the word as a verb or a noun. wink and compromise miss different verbs. */
  verb: boolean;
  noun: boolean;
}

/** The sentence's words, tagged by wink and by compromise, with offsets into `sentence`. */
function words(sentence: string): Word[] {
  const lead = sentence.length - sentence.replace(/^[^\p{L}\u0000]+/u, "").length;
  const opening = sentence.slice(lead);
  // "you " gives the first word its verb reading, as in text/imperative.ts.
  const tokens = tag(`you ${opening.charAt(0).toLowerCase()}${opening.slice(1)}`).slice(1);
  const second = new Map<number, string[]>();
  const terms = (nlp(sentence.replace(/\u0000/g, "X")).json({ offset: true } as never) as { terms: { offset: { start: number }; tags: string[] }[] }[]).flatMap(
    (part) => part.terms,
  );
  for (const term of terms) second.set(term.offset.start, term.tags);
  return tokens.map((token) => {
    const start = token.start - 4 + lead;
    const tags = second.get(start) ?? [];
    return { ...token, start, end: token.end - 4 + lead, quoted: isQuoted(sentence, start), verb: tags.includes("Verb"), noun: tags.includes("Noun") };
  });
}

const lower = (word: Word | undefined) => word?.text.toLowerCase() ?? "";
const isVerb = (word: Word) => word.pos === "VERB" || word.pos === "AUX" || word.verb;
const isBaseVerb = (word: Word | undefined) => word?.pos === "VERB" && lower(word) === word.lemma;
const isGerund = (word: Word) => word.pos === "VERB" && /ing$/i.test(word.text);
const isParticiple = (word: Word) => /(?:ed|en)$/i.test(word.text) && (word.pos === "VERB" || word.pos === "ADJ" || word.verb);
/** A word that can head a subject: a noun, a pronoun, a code span, or a quoted mention. */
const isHead = (word: Word) => NOMINAL.has(word.pos) || !!word.code || word.quoted || word.noun;

/** The index after the last word a condition clause can use to show its subject and verb. */
function clauseEnd(list: readonly Word[], start: number): number {
  for (let i = start; i < list.length; i++) {
    const word = list[i]!;
    const next = list[i + 1];
    if (word.quoted) continue;
    if (BOUNDARY.test(word.text) || RELATIVES.has(lower(word))) return i;
    // A comma continues a list ("when code, standards, or checkout locations change") and ends anything else.
    if (word.text === "," && !(next && (isHead(next) || MODIFIER.has(next.pos) || next.pos === "CCONJ" || QUOTE.test(next.text)))) return i;
    if (word.pos === "CCONJ" && isBaseVerb(next)) return i;
  }
  return list.length;
}

/**
 * True when the words after a condition word hold a subject and a verb. "if needed", "before
 * editing", and "before the release" do not.
 */
function hasSubjectAndVerb(conditionWord: string, clause: readonly Word[]): boolean {
  const first = clause[0];
  if (!first) return false;
  if (!first.quoted && !QUOTE.test(first.text)) {
    if (isGerund(first) || lower(first) === "to") return false;
    if (["ADV", "ADP", "PART", "SCONJ", "CCONJ", "AUX", "INTJ", "PUNCT"].includes(first.pos)) return false;
    // "when needed", "if necessary": a modifier with no noun after it.
    if ((first.pos === "ADJ" || isParticiple(first)) && !(clause[1] && isHead(clause[1]))) return false;
  }
  let subject = false;
  for (let i = 0; i < clause.length; i++) {
    const word = clause[i]!;
    // A participle before a noun describes it: "the intended deletion".
    const modifies = isParticiple(word) && !!clause[i + 1] && (isHead(clause[i + 1]!) || clause[i + 1]!.pos === "ADJ");
    if (subject && !word.quoted && !modifies) {
      if (isVerb(word)) return true;
      // After "if" or "when" a clause must follow, so a word that wink reads as a plural noun is its verb: "if the page loads".
      if (ALWAYS_CLAUSE.has(conditionWord) && word.pos === "NOUN" && /[a-z](?:s|ed)$/.test(word.text)) return true;
    }
    // A verb before any noun heads the subject ("when code, standards, or locations change"), unless it is a participle.
    if (isHead(word) || (isVerb(word) && !isParticiple(word) && !isGerund(word) && (i === 0 || MODIFIER.has(clause[i - 1]!.pos)))) subject = true;
  }
  return false;
}

/** True when a word is a pronoun that points back: "it", "they", or a demonstrative with no noun after it. */
function pointsBack(word: Word, next: Word | undefined): boolean {
  if (word.quoted) return false;
  if (POINTING_BACK.has(lower(word))) return true;
  return DEMONSTRATIVES.has(lower(word)) && (!next || next.pos === "AUX" || next.pos === "VERB" || next.pos === "PUNCT");
}

/**
 * The condition clauses that follow the command in a sentence, each from its condition word to
 * the end of its subject and verb. Empty when the sentence is not an instruction that opens with
 * its command, or when no clause can move to the front. `step` marks a numbered list item.
 */
export function conditionClauses(sentence: string, step = false): string[] {
  // Both tests: opensWithCommand rejects a leading condition, and isProcedural rejects a subject
  // that reads as a verb ("Edit in Canvas appears ...").
  if (!opensWithCommand(sentence) || !isProcedural(sentence, step)) return [];
  const list = words(sentence);
  let verb = 0;
  while (verb < list.length && (LEAD_ADVERBS.has(list[verb]!.lemma) || list[verb]!.pos === "PUNCT")) verb++;
  if (list[verb]?.lemma === "do" && /^(?:not|n't)$/i.test(list[verb + 1]?.text ?? "")) verb += 2;
  const clauses: string[] = [];
  for (let at = verb + 1; at < list.length; at++) {
    const word = list[at]!;
    const conditionWord = lower(word);
    if (!CONDITION_WORDS.has(conditionWord) || word.quoted) continue;
    const before = list[at - 1];
    if (lower(before) === "as") continue; // "as if"
    // An asked question: "Check if the file exists", "Find out when it runs".
    const asker = lower(before) === "out" ? list[at - 2] : before;
    if ((conditionWord === "if" || conditionWord === "when") && asker?.pos === "VERB" && ASKING_VERBS.has(asker.lemma)) continue;
    if (conditionWord === "when" && TIME_NOUNS.has(lower(before))) continue;
    const between = list.slice(verb + 1, at);
    const unquoted = (test: (other: Word, i: number) => boolean) => between.some((other, i) => !other.quoted && test(other, i));
    // The condition belongs to another clause: "because the service refuses writes until ...".
    if (unquoted((other) => NESTING.has(lower(other)))) continue;
    // The condition belongs to a phrase after a comma: "Write the renderer, with a node view when ...".
    if (unquoted((other, i) => other.text === "," && !!between[i + 1] && (["ADP", "ADV"].includes(between[i + 1]!.pos) || isParticiple(between[i + 1]!)))) continue;
    // Two commands: the condition may guard only the second ("Open the file and save it if ...",
    // "Expect A, then B when ..."), and a split into one command per sentence repeats it ("Split and link when ...").
    if (unquoted((other, i) => lower(other) === "then" || (/^(?:and|or)$/i.test(other.text) && (i === 0 || isBaseVerb(between[i + 1]))))) continue;
    const end = clauseEnd(list, at + 1);
    if (!hasSubjectAndVerb(conditionWord, list.slice(at + 1, end))) continue;
    if (list.slice(at + 1).some((other, i) => pointsBack(other, list[at + 2 + i]))) continue;
    clauses.push(sentence.slice(word.start, end < list.length ? list[end]!.start : sentence.length).trim());
  }
  return clauses;
}
