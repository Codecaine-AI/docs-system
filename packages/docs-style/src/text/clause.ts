/**
 * Clause tests over compromise tags, for autofixes that must keep a sentence whole: does a text
 * hold a full clause (a subject and a finite verb), and does a word read as a finite verb after a
 * subject. A "no" only skips a safe fix, so every doubtful case answers no.
 *
 * Input is proseText output: each code or reference span is one "\u0000", which stands for a name.
 */
import nlp from "compromise";

export interface Term {
  /** Lowercase. */
  text: string;
  tags: Set<string>;
  /** The punctuation and space after the word, such as ", ". */
  post: string;
}

/** Words that open a prepositional phrase. The main verb of a clause comes before any of them. */
export const PREPOSITIONS: ReadonlySet<string> = new Set(
  "about above across after against along among around at before behind below beneath beside between beyond by during except for from in inside into near of off on onto outside over past per since through throughout to toward towards under underneath until upon via with within without".split(
    " ",
  ),
);
/** A determiner right after a noun starts a reduced relative clause: "every module the package loads". */
const DETERMINERS = new Set("a an the this these those each every any no some its their our your my his her".split(" "));
/** A relative pronoun before a verb makes a relative clause, not a main clause: "every module that loads". */
const RELATIVES = new Set(["which", "that", "who", "whom", "whose", "where", "when", "what"]);
const PLURAL_PRONOUNS = new Set(["they", "we", "you", "i", "these", "those"]);

/** compromise's tags for each word of `text`. A code span becomes the name "Foo". */
export function termsOf(text: string): Term[] {
  const json = nlp(text.replace(/\u0000/g, " Foo ")).json() as { terms: { text: string; tags: string[]; post: string }[] }[];
  return json.flatMap((s) => s.terms).map((t) => ({ text: t.text.toLowerCase(), tags: new Set(t.tags), post: t.post ?? "" }));
}

/** True when a comma, semicolon, colon, or dash follows the word. */
function breaksAfter(term: Term): boolean {
  return /[,;:—–]/.test(term.post);
}

/**
 * True for a finite verb form: a modal, an auxiliary, a copula other than "be", or a present
 * form. An -ed word never counts, because it is often a participle ("externally owned").
 */
export function isFinite(term: Term): boolean {
  const { text, tags } = term;
  if (!tags.has("Verb") || tags.has("Gerund") || tags.has("Participle")) return false;
  if (tags.has("Modal") || tags.has("Auxiliary")) return true;
  if (tags.has("Copula")) return !["be", "been", "being"].includes(text);
  return tags.has("PresentTense") && !/ed$/.test(text);
}

/** An adverb or a negation that can stand between a subject and its verb: "never enters". */
function isModifier(term: Term): boolean {
  return (term.tags.has("Adverb") || term.tags.has("Negative")) && !term.tags.has("Verb");
}

/** A word that cannot be the subject right before a verb. */
function cannotBeSubject(term: Term): boolean {
  const { text, tags } = term;
  if (RELATIVES.has(text) || DETERMINERS.has(text) || PREPOSITIONS.has(text)) return true;
  if (tags.has("Conjunction") || tags.has("Preposition") || tags.has("Determiner")) return true;
  return tags.has("Adjective") && !tags.has("Noun");
}

function isPlural(term: Term): boolean {
  return term.tags.has("Plural") || PLURAL_PRONOUNS.has(term.text);
}

export interface ClauseOptions {
  /**
   * Let the verb end the clause: "ensure the tests pass". Off by default, because a plural noun
   * at the end often reads as a verb: "every future cookbook flags".
   */
  allowLast?: boolean;
}

/** A base form that is not a modal: "contract", "surface". Before a determiner, it is a noun. */
function isBaseForm(term: Term): boolean {
  return term.tags.has("Infinitive") && !term.tags.has("Modal");
}

/**
 * True when `clause` is a full clause: a subject, then a finite verb. compromise reads many
 * list nouns as verbs, so each check below rules out one such reading:
 * - A base form counts only after a plural subject: "future index capabilities land".
 * - The verb comes before any preposition, with a subject right before it and no punctuation
 *   between them. So "every command from standards files", "every module, which loads lazily",
 *   and the list "op semantics, inverses, undo" have no verb.
 * - The verb has no comma right after it, unless it ends the clause: "the backlinks index, ...".
 * - A word followed by a relative pronoun and a verb is a noun: "the content hashes that make".
 * - A determiner right after a noun ends the search: "every module the package loads" and "the
 *   linking contract this package makes" are noun phrases with a relative clause.
 */
export function hasFiniteVerb(clause: string, options: ClauseOptions = {}): boolean {
  const terms = termsOf(clause);
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i]!;
    if (PREPOSITIONS.has(term.text)) return false;
    const previous = terms[i - 1];
    if (DETERMINERS.has(term.text) && previous && (previous.tags.has("Noun") || isBaseForm(previous))) return false;
    const last = i === terms.length - 1;
    if (i === 0 || (last && !options.allowLast) || !isFinite(term)) continue;
    if (!last && breaksAfter(term)) continue;
    const next = terms[i + 1];
    if (next && RELATIVES.has(next.text) && terms[i + 2]?.tags.has("Verb")) continue;
    let j = i - 1;
    while (j > 0 && isModifier(terms[j]!)) j--;
    const subject = terms[j]!;
    if (cannotBeSubject(subject) || isModifier(subject)) continue;
    if (terms.slice(j, i).some(breaksAfter)) continue;
    if (isBaseForm(term) && !isPlural(subject)) continue;
    return true;
  }
  return false;
}
