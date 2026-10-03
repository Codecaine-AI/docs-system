/**
 * Main-verb detection for sentence-shape: does a new sentence have a verb that can carry it, or is
 * it a noun phrase cut loose from its sentence? Neither tagger is reliable on short technical
 * sentences, so the check reads verb evidence from both and corrects each in the places where
 * reviewers found it wrong.
 *
 * Verb evidence:
 * - wink tags a VERB or AUX.
 * - compromise tags a verb. wink reads "The server checks the page." as all nouns.
 * - An "-s" word follows a noun: "The sweep stages proposals." Both taggers read "stages" as a
 *   plural noun. A word before a colon is a label ("Doc standards:"), not a verb.
 *
 * Evidence that is not a main verb:
 * - A participle right after the first comma, when a noun comes before the comma: "The backlinks
 *   index, held at zero stale." describes the index.
 * - A base form that only compromise reads as a verb, between a noun and a comma: "The backlinks
 *   index, ..." is a noun, not "the backlinks [verb] index". This also rejects the rare "The rows
 *   load, grouped by page.", which has the same shape.
 * - An "-s" word or a participle in a phrase the author wrote after a preposition: from "with typed
 *   reference spans", the new sentence "Typed reference spans for every link." has no verb.
 *
 * Verbs both taggers miss:
 * - A plural subject, then a word that can be a base-form verb: "Entries on an area page move with
 *   the page." Both taggers read "page move" as one noun.
 * - An imperative that opens with an adverb-verb compound: "Fast-forward `main`." wink splits it
 *   into two adverbs.
 *
 * Input is prose text: each code or reference span is one "\u0000" (see proseText).
 */
import nlp from "compromise";
import { isParticiple, tag, type Token } from "../text";

/** A word that ends in one "s", such as "stages" or "checks", but not "class" or "status". */
const S_FORM = /^[a-z]{2,}[^s'’u]s$/;
const isSForm = (token: Token | undefined) => !!token && !token.code && S_FORM.test(token.text.toLowerCase());

const baseVerbs = new Map<string, boolean>();
/** True when compromise's lexicon gives the word, on its own, a base-form verb reading: "move", "forward". */
function canBeBaseVerb(word: string): boolean {
  const key = word.toLowerCase();
  let known = baseVerbs.get(key);
  if (known === undefined) baseVerbs.set(key, (known = /^[a-z]+$/.test(key) && nlp(key).has("#Infinitive")));
  return known;
}

/** A past participle such as "held" or "typed", or an -ing form, that is not also a base form such as "run" or "set". */
function isNonFiniteForm(token: Token | undefined): boolean {
  if (!token || token.code) return false;
  const word = token.text.toLowerCase();
  return (isParticiple({ ...token, pos: "VERB" }) || /^[a-z]{2,}ing$/.test(word)) && !canBeBaseVerb(word);
}

const isNounLike = (token: Token | undefined) => !!token && (token.code || token.pos === "NOUN" || token.pos === "PROPN");

/**
 * The character ranges of the words compromise tags as verbs, in `text`. compromise reads a code
 * span as "Foo". A verb with no word of its own, such as the "is" compromise reads into "item's",
 * has no range: `unplaced` is true, and it counts as a verb, as any compromise verb always did.
 */
function compromiseVerbs(text: string): { ranges: [number, number][]; unplaced: boolean } {
  const back: number[] = [];
  let masked = "";
  for (let i = 0; i < text.length; i++) {
    const piece = text[i] === "\u0000" ? "Foo" : text[i]!;
    for (let j = 0; j < piece.length; j++) back.push(i);
    masked += piece;
  }
  const terms = (nlp(masked).json({ offset: true }) as { terms: { tags: string[]; offset: { start: number; length: number } }[] }[])
    .flatMap((sentence) => sentence.terms)
    .filter((term) => term.tags.includes("Verb"));
  const ranges: [number, number][] = [];
  let unplaced = false;
  for (const { offset } of terms) {
    const start = offset.length > 0 ? back[offset.start] : undefined;
    const end = offset.length > 0 ? back[offset.start + offset.length - 1] : undefined;
    if (start === undefined || end === undefined) unplaced = true;
    else ranges.push([start, end + 1]);
  }
  return { ranges, unplaced };
}

/** Who reads a token as a verb: wink or the "-s" rule ("tagger"), compromise alone, or nobody. */
type Reading = "tagger" | "compromise" | undefined;

/**
 * The tokens of `text` and each one's verb reading. `other` is true when compromise reads a verb
 * on no plain token: a contraction's "is", or a code span ("To nest, `Tab` an item").
 */
function readVerbs(text: string): { tokens: Token[]; readings: Reading[]; other: boolean } {
  const tokens = tag(text);
  const { ranges, unplaced } = compromiseVerbs(text);
  const covers = (token: Token) => ranges.some(([start, end]) => start < token.end && token.start < end);
  const readings = tokens.map((token, i): Reading => {
    if (token.code) return undefined;
    const sForm = isNounLike(tokens[i - 1]) && token.pos === "NOUN" && S_FORM.test(token.text) && tokens[i + 1]?.text !== ":";
    if (token.pos === "VERB" || token.pos === "AUX" || sForm) return "tagger";
    return covers(token) ? "compromise" : undefined;
  });
  const other = unplaced || ranges.some(([start, end]) => !tokens.some((token) => !token.code && start < token.end && token.start < end));
  return { tokens, readings, other };
}

/** Two words in order, as a key of an author's noun pairs. A code span has no key: every span is the same "\u0000". */
const pairKey = (first: Token | undefined, second: Token | undefined) =>
  first && second && !first.code && !second.code ? `${first.text.toLowerCase()}\u0001${second.text.toLowerCase()}` : "";

/** Words wink tags ADP that often open a clause rather than a noun phrase: "after the job finishes". */
const CLAUSE_PREPOSITIONS = new Set(["after", "as", "before", "once", "since", "than", "till", "until", "while"]);
/** Punctuation and conjunctions that end a clause. */
const endsClause = (token: Token) => (token.pos === "PUNCT" && /^[,;:—–()!?.]$/.test(token.text)) || token.pos === "CCONJ" || token.pos === "SCONJ";

/**
 * Adds the neighbouring word pairs of the noun phrase that starts at tokens[from]: "typed
 * reference spans" gives "typed reference" and "reference spans". A determiner opens the phrase.
 * A participle or "-s" word that the tagger reads as a verb is an adjective before a noun
 * ("typed"). After a noun it is the head of the phrase ("spans") only when punctuation follows;
 * otherwise it may be the verb of a new clause, so the phrase ends before it. A hyphen with no
 * space around it joins the words on each side ("rich-text").
 */
function addPhrasePairs(tokens: readonly Token[], from: number, pairs: Set<string>): void {
  let last: Token | undefined;
  const add = (first: Token | undefined, second: Token) => {
    const key = pairKey(first, second);
    if (key) pairs.add(key);
  };
  for (let j = from; j < tokens.length; j++) {
    const next = tokens[j]!;
    if (next.text === "-" && last && next.start === last.end) continue;
    const shaped = next.pos === "VERB" && (isSForm(next) || isNonFiniteForm(next));
    if (shaped && isNounLike(last)) {
      if (!tokens[j + 1] || tokens[j + 1]!.pos === "PUNCT") add(last, next);
      return;
    }
    const nounWord = next.code || ["NUM", "ADJ", "NOUN", "PROPN"].includes(next.pos) || (next.pos === "DET" && (!last || last.pos === "DET"));
    if (!nounWord && !shaped) return;
    add(last, next);
    last = next;
  }
}

/**
 * Each pair of neighbouring words inside a noun phrase that the author wrote after a preposition,
 * in a clause whose verb came first: in "Docs link to docs with typed reference spans", "typed
 * reference spans" is a noun phrase. A phrase in a subject, as in "An entry on an area page moves",
 * gives nothing: the verb can follow the phrase.
 */
export function authorNounPairs(sentences: readonly string[]): ReadonlySet<string> {
  const pairs = new Set<string>();
  for (const sentence of sentences) {
    const { tokens, readings } = readVerbs(sentence);
    let verbInClause = false;
    tokens.forEach((token, at) => {
      if (endsClause(token)) verbInClause = false;
      else if (readings[at]) verbInClause = true;
      else if (verbInClause && !token.code && token.pos === "ADP" && !CLAUSE_PREPOSITIONS.has(token.text.toLowerCase())) addPhrasePairs(tokens, at + 1, pairs);
    });
  }
  return pairs;
}

/**
 * True when a tagger's verb reading of tokens[i] is evidence of a main verb. An auxiliary always
 * is. The others are not in the three places listed at the top of this file. A participle after a
 * later comma may be the main verb after an aside: "Each block, checked by Jev, passed."
 */
function isMainVerbEvidence(tokens: readonly Token[], i: number, reading: Reading, authorNouns: ReadonlySet<string>): boolean {
  const token = tokens[i]!;
  if (token.pos === "AUX") return true;
  const before = tokens[i - 1];
  const after = tokens[i + 1];
  const firstComma = tokens.findIndex((other) => other.text === ",");
  if (firstComma === i - 1 && isNounLike(tokens[i - 2]) && isNonFiniteForm(token)) return false;
  if (reading === "compromise" && isNounLike(before) && after?.text === "," && !isSForm(token) && !isNonFiniteForm(token)) return false;
  const nounShaped = isSForm(token) || isNonFiniteForm(token);
  return !(nounShaped && (authorNouns.has(pairKey(before, token)) || authorNouns.has(pairKey(token, after))));
}

/** Wink splits "fast-forward" into "fast", "-", "forward". Each word here is one or more tokens joined by tight hyphens. */
function hyphenatedWords(tokens: readonly Token[]): { text: string; first: Token; last: number }[] {
  const words: { text: string; first: Token; last: number }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    let text = tokens[i]!.text;
    let last = i;
    for (;;) {
      const hyphen = tokens[last + 1];
      const next = tokens[last + 2];
      if (hyphen?.text !== "-" || !next || next.code || hyphen.start !== tokens[last]!.end || next.start !== hyphen.end) break;
      text += `-${next.text}`;
      last += 2;
    }
    words.push({ text, first: tokens[i]!, last });
    i = last;
  }
  return words;
}

/**
 * True for an imperative that opens with an adverb-verb compound, perhaps after an adverb such as
 * "Then": "Fast-forward `main`.", "Then fast-forward `main`." wink must read the first part as an
 * adverb or a verb, so "Client-side `fetch`." stays a noun phrase. The last part must be able to
 * be a base-form verb, and an object must follow: a code span, a determiner, a pronoun, or a number.
 */
function opensHyphenatedImperative(tokens: readonly Token[]): boolean {
  const words = hyphenatedWords(tokens);
  const lead = words[0];
  const word = lead && !lead.first.code && !lead.text.includes("-") && lead.first.pos === "ADV" ? words[1] : lead;
  if (!word || word.first.code || !word.text.includes("-") || !["ADV", "VERB"].includes(word.first.pos)) return false;
  const object = tokens[word.last + 1];
  return canBeBaseVerb(word.text.slice(word.text.lastIndexOf("-") + 1)) && !!object && (object.code || ["DET", "PRON", "NUM"].includes(object.pos));
}

/**
 * True for a plural subject followed by a word that can be a base-form verb: "Entries on an area page
 * move with the page.", "The 42 blocks total 1.42 MiB.", "`a` and `b` call `c`." The subject is
 * plural when its head noun is an "-s" word or it joins nouns with "and". The head is the noun
 * right before the verb, or, when a prepositional phrase sits between them, the noun before that
 * phrase. An object must follow the verb: a code span, a determiner, a pronoun, or a number. A
 * preposition counts too after a prepositional phrase, as in "page move with", but not right after
 * the head: "The backlinks index for every page." is a noun phrase.
 */
function pluralSubjectVerb(tokens: readonly Token[]): boolean {
  let head: Token | undefined;
  let joined = false;
  let phrase = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const before = tokens[i - 1];
    const after = tokens[i + 1];
    const object = !!after && (after.code || ["DET", "PRON", "NUM"].includes(after.pos) || (phrase && after.pos === "ADP"));
    if (
      isNounLike(before) && !token.code && ["NOUN", "ADJ", "PROPN"].includes(token.pos) && /^[a-z]+$/.test(token.text) &&
      !isSForm(token) && object && canBeBaseVerb(token.text) && (joined || isSForm(phrase ? head : before))
    )
      return true;
    if (token.code || ["DET", "NUM", "ADJ", "NOUN", "PROPN"].includes(token.pos)) {
      if (!phrase && isNounLike(token)) head = token;
    } else if (!phrase && token.pos === "CCONJ" && /^and$/i.test(token.text)) joined = true;
    else if (!phrase && token.pos === "ADP" && head) phrase = true;
    else if (!(token.text === "-" || token.text === "," || token.pos === "PART")) return false;
  }
  return false;
}

/**
 * True when something in the text reads as a main verb. A miss rejects a good sentence, so any one
 * signal is enough. `authorNouns` comes from authorNounPairs over the text the rewrite replaced.
 */
export function hasMainVerb(text: string, authorNouns: ReadonlySet<string> = new Set()): boolean {
  const { tokens, readings, other } = readVerbs(text);
  if (other) return true;
  if (readings.some((reading, i) => reading && isMainVerbEvidence(tokens, i, reading, authorNouns))) return true;
  return opensHyphenatedImperative(tokens) || pluralSubjectVerb(tokens);
}
