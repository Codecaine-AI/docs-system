/**
 * Content coverage: every content word of the original block must survive in the rewrite. Words
 * compare by lemma, so "retries" and "retry" are one word, and a passive turned active keeps
 * "checked" as "checks". The fact ledger tracks only what code can name, and the shrink limit only
 * counts. Neither notices a plain sentence that vanished: a semicolon fix once deleted the
 * unrelated sentence "Retries work." and passed every other check.
 */
import { namingCanon, replacements, slopWords } from "../profile";
import { tag, type Token } from "../text";
import type { GuardrailResult } from "../types";
import { afterProse, beforeProse, inflectedPattern, STOP_WORDS, type RewriteText } from "./prose";

/**
 * How many content words a rewrite may lose. Zero: on the r2 pilot, every rewrite that lost one
 * either lost information or swapped a word the profile does not ask to swap.
 */
export const CONTENT_COVERAGE_ALLOWED_MISSING = 0;

/** Parts of speech that carry content. Pronouns, articles, prepositions, conjunctions, and auxiliaries do not. */
const CONTENT_POS: ReadonlySet<string> = new Set(["NOUN", "PROPN", "VERB", "ADJ", "ADV", "NUM"]);

/** Connectors only join sentences, so a split or a merge may drop or add one. */
const CONNECTORS: ReadonlySet<string> = new Set([
  "also", "then", "so", "thus", "hence", "however", "therefore", "furthermore", "moreover", "additionally", "consequently", "accordingly",
]);

/**
 * Suffixes stripped to find a crude root, so inflected and derived forms of a word meet. The tagger
 * lemmatizes an adjective participle as itself ("registered" against "registers"), and STE prefers
 * a verb to its noun ("deleting" for "deletion", "defines" for "definition").
 */
const SUFFIXES = [
  "ization", "isation", "ation", "ition", "ution", "tion", "sion", "ion", "ment", "ance", "ence", "ity", "ness",
  "able", "ible", "ing", "ive", "ers", "er", "ors", "or", "al", "ly", "ed", "es", "s", "e",
];
/** "When" may become "if" when a condition moves to the front of its sentence. */
const SAME_AS: Readonly<Record<string, readonly string[]>> = { when: ["if", "whenever"], whenever: ["if", "when"] };

/** A word without case, a possessive "'s", or punctuation the tagger left on it ("O." in "I/O."). */
const bare = (word: string) => word.toLowerCase().replace(/['’]s$/u, "").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/** The forms that count as the same word: the lemma, the word itself, their crude roots, and any SAME_AS word. */
function formsOf(token: Token): string[] {
  const forms = new Set([bare(token.lemma), bare(token.text)].filter(Boolean));
  // Two passes, so a plural nominalization ("definitions") loses both "-s" and "-ition".
  for (let pass = 0; pass < 2; pass++)
    for (const form of [...forms])
      for (const suffix of SUFFIXES) if (form.endsWith(suffix) && form.length - suffix.length >= 4) forms.add(form.slice(0, -suffix.length));
  for (const form of [...forms]) SAME_AS[form]?.forEach((same) => forms.add(same));
  return [...forms];
}

const isWord = (token: Token) => !token.code && /[\p{L}\p{N}]/u.test(token.text);
const isContent = (token: Token) => {
  const word = token.text.toLowerCase();
  return isWord(token) && CONTENT_POS.has(token.pos) && ![word, token.lemma].some((form) => STOP_WORDS.has(form) || CONNECTORS.has(form));
};

/** Every form of every word in the rewrite, in any part of speech. */
const formsIn = (texts: readonly string[]) => new Set(texts.flatMap((text) => tag(text).filter(isWord).flatMap(formsOf)));

// ---------------------------------------------------------------------------------------------
// Swaps the profile asks for. A rewrite that makes one loses the old word on purpose.
// ---------------------------------------------------------------------------------------------

interface Swap {
  pattern: RegExp;
  find: string;
  /** What may replace the find. An empty list means the find may simply go. */
  options: string[];
}

/** "" and "(delete)" drop the word. "(rewrite)" leaves the wording open, so the word may go too. */
const dropsWord = (option: string) => option === "" || option.startsWith("(");

const SWAPS: Swap[] = [
  ...replacements.map(({ find, replace }) => ({ find, options: replace.split("|").map((option) => option.trim()) })),
  ...namingCanon.flatMap(({ use, avoid }) => avoid.map((find) => ({ find, options: [use] }))),
  ...slopWords.map((find) => ({ find, options: [""] })),
].map(({ find, options }) => ({
  pattern: inflectedPattern(find, "iu"),
  find,
  options: options.some(dropsWord) ? [] : options,
}));

/** The words a phrase needs, in any form: every word except stop words and the "..." placeholder. */
const requiredForms = (phrase: string) => tag(phrase.replace(/\.\.\./g, " ")).filter(isWord).filter((token) => !STOP_WORDS.has(token.lemma));

/**
 * The lemmas of profile swaps the rewrite made: a find in the original block whose word is gone,
 * because an option the profile names, or nothing when the profile allows that, took its place.
 */
function swappedForms(before: string, after: ReadonlySet<string>): Set<string> {
  const swapped = new Set<string>();
  for (const swap of SWAPS) {
    if (!swap.pattern.test(before)) continue;
    const replaced =
      !swap.options.length || swap.options.some((option) => requiredForms(option).every((token) => formsOf(token).some((form) => after.has(form))));
    if (replaced) for (const token of tag(swap.find)) formsOf(token).forEach((form) => swapped.add(form));
  }
  return swapped;
}

// ---------------------------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------------------------

/** The content words of the original block that no block of the rewrite keeps, once each, in order. */
function missingContent(input: RewriteText): Token[] {
  const before = beforeProse(input);
  const after = formsIn(afterProse(input));
  const swapped = swappedForms(before, after);
  const missing = new Map<string, Token>();
  for (const token of tag(before).filter(isContent)) {
    const forms = formsOf(token);
    if (forms.some((form) => after.has(form) || swapped.has(form))) continue;
    if (!missing.has(token.lemma)) missing.set(token.lemma, token);
  }
  return [...missing.values()];
}

/** "content-coverage": every content word of the original block appears, in some form, in the rewrite. */
export function checkContentCoverage(input: RewriteText): GuardrailResult {
  const missing = missingContent(input);
  const allowed = CONTENT_COVERAGE_ALLOWED_MISSING;
  if (missing.length <= allowed)
    return { id: "content-coverage", ok: true, detail: missing.length ? `missing ${missing.length}, allowed ${allowed}` : "kept every content word" };
  const named = missing.slice(0, 3).map((token) => `"${token.text}"`).join(", ");
  const more = missing.length > 3 ? `, and ${missing.length - 3} more` : "";
  return { id: "content-coverage", ok: false, detail: `missing ${named}${more}` };
}
