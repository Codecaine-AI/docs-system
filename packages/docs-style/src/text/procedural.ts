/**
 * Procedural or descriptive. STE gives an instruction 20 words and a description 25, and only an
 * instruction always has a known actor (the reader) for its passives, so rules must tell the two
 * apart. An instruction is an imperative: it opens with a base-form verb, after an optional
 * leading clause such as "If the hash is stale,".
 *
 * wink tags many sentence-initial verbs as names or nouns ("Click", "Open", "Use"). So the test
 * reads the sentence twice:
 * - as "you <sentence>", which gives the first word its verb reading when it has one;
 * - as "the <sentence>", which gives it its noun reading. A noun reading that runs into a verb
 *   ("Code blocks hold text.") means the sentence opens with its subject, so it describes.
 */
import type { SentenceField } from "./sentence-fields";
import { tag, type Token } from "./tagger";

/**
 * True when the sentence gives an instruction. Only prose blocks and process steps give
 * instructions. Reference text (table cells, field and operation descriptions, captions)
 * describes, even when it opens with a verb: "Update an existing canvas object by ID" says what
 * an operation does.
 */
export function isInstruction(sentence: string, field: SentenceField): boolean {
  const type = field.block?.type;
  const prose = (type === "paragraph" || type === "list-item" || type === "callout") && field.field === "text";
  return (prose || type === "process-outline") && isProcedural(sentence, field.step);
}

/** A short label such as "Decision:" or "Input rules:", when a new sentence follows it. */
const LABEL = /^\p{Lu}[\p{L}-]*(?:\s+[\p{L}-]+){0,2}:\s+(?=[\p{Lu}\d"'“\u0000])/u;
/** A leading condition, purpose, or time clause that an instruction can follow. */
const LEADING_CLAUSE =
  /^(?:if|when|whenever|before|after|to|once|unless|while|until|for|in|on|from|with|without|during|then|next|first|finally|otherwise|instead)\b[^,]{0,80},\s+/i;
/** An adverb that can open an instruction: "Always run the check.", "Never edit doc.json." */
const LEADING_ADVERB = /^(?:always|never|then|also|first|next|finally|now|only|just|again|instead|optionally|please)\s+/i;
const NEGATIVE_IMPERATIVE = /^(?:do not|don't|don’t)\s/i;
/**
 * A first word that can be a verb: a plain word, capitalized at most at its first letter. A word
 * joined to more text by ".", "-", or "_" is an identifier, such as "structure.label-colon-opener".
 */
const PLAIN_WORD = /^\p{L}\p{Ll}*(?=[\s,;:!?]|\.(?:\s|$)|$)/u;
/**
 * First words that are never an imperative: pronouns that wink can read as a verb, and gerunds
 * ("Reimplementing interactions was rejected"), which wink leaves unlemmatized when it does not
 * know the word.
 */
const NOT_A_COMMAND = /^(?:(?:every|any|no|some)(?:thing|one|body)|\p{L}{3,}ing)$/iu;

/**
 * True when the sentence is an instruction. In a step (a numbered list item or a process-outline
 * action) an opening verb is enough: the context already says "do this", so the noun-reading
 * check, which guards plain prose against "Code blocks hold text.", is skipped.
 */
export function isProcedural(sentence: string, step = false): boolean {
  let rest = sentence
    .trim()
    .replace(/^["'(\[“‘]+/, "")
    .replace(LABEL, "")
    .replace(LEADING_CLAUSE, "");
  if (NEGATIVE_IMPERATIVE.test(rest)) return true;
  rest = rest.replace(LEADING_ADVERB, "");
  const first = PLAIN_WORD.exec(rest)?.[0];
  if (!first || NOT_A_COMMAND.test(first)) return false;
  // wink splits "self-navigation" at the hyphen and tags the parts apart. Spaced, the parts read
  // as the nouns they are.
  const lowered = (rest.charAt(0).toLowerCase() + rest.slice(1)).replace(/(?<=\p{L})-(?=\p{L})/gu, " ");
  const asVerb = tag(`you ${lowered}`).slice(1);
  const verb = asVerb[0];
  if (verb?.pos !== "VERB" || verb.text.toLowerCase() !== verb.lemma) return false;
  // "Further," and "Note:" open with a sentence adverb or a label, not a verb.
  if (/^[,:]$/.test(asVerb[1]?.text ?? "")) return false;
  if (hasOwnVerb(asVerb)) return false;
  return step || !opensWithSubject(tag(`the ${lowered}`).slice(1));
}

const NOUN_LIKE = new Set(["NOUN", "PROPN", "ADJ"]);
/** Plural nouns that this corpus uses as modifiers, as in "docs root". */
const PLURAL_MODIFIERS = new Set(["docs"]);

/**
 * True when, in the verb reading, the opening words take a verb of their own before any object
 * starts: "Canvas declares an agent", "Edit in Canvas opens a tab". An imperative cannot.
 */
function hasOwnVerb(tokens: readonly Token[]): boolean {
  for (const token of tokens.slice(1)) {
    if (token.pos === "AUX" || (token.pos === "VERB" && /s$/i.test(token.text) && token.text.toLowerCase() !== token.lemma))
      return true;
    if (!NOUN_LIKE.has(token.pos) && token.pos !== "ADP" && token.pos !== "CCONJ") return false;
  }
  return false;
}

/**
 * True when the noun reading of the opening words is a subject that a verb follows:
 * "Code blocks hold text.", "Block props, atom text, and references travel as JSON."
 */
function opensWithSubject(tokens: readonly Token[]): boolean {
  const pos = (i: number) => tokens[i]?.pos ?? "";
  const nounAt = (i: number) => NOUN_LIKE.has(pos(i));
  let run = 0;
  // Commas and "and" or "or" join the nouns of one subject.
  while (true) {
    if (nounAt(run)) run++;
    else if (run > 0 && pos(run) === "CCONJ" && nounAt(run + 1)) run++;
    else if (run > 0 && tokens[run]?.text === "," && (nounAt(run + 1) || (pos(run + 1) === "CCONJ" && nounAt(run + 2)))) run++;
    else break;
  }
  if (run < 2) return false;
  let next = run;
  // An aside can part the subject from its verb: "Duplicate names, among the target siblings,
  // are rejected.", "Minor words such as "of" and "the" stay lowercase."
  if (tokens[next]?.text === ",") {
    const close = tokens.findIndex((token, i) => i > next && token.text === ",");
    if (close > 0) next = close + 1;
  } else if (tokens[next]?.text.toLowerCase() === "as" && tokens[next - 1]?.text.toLowerCase() === "such") {
    // wink tags "such" as an adjective, so it closes the noun run.
    const verb = tokens.findIndex((token, i) => i > next && (token.pos === "VERB" || token.pos === "AUX"));
    if (verb > 0) next = verb;
  }
  while (pos(next) === "ADV") next++; // "Theme settings also travel ..."
  // A participle after the nouns describes them: "readiness and registered workspaces".
  if (pos(next) === "AUX" || (pos(next) === "VERB" && !/(?:ed|ing)$/i.test(tokens[next]!.text))) return true;
  // wink often tags the verb after a plural subject as a noun: "Search results show the page."
  return tokens.slice(1, run - 1).some((token, i) => isPlural(token) && pos(i + 2) === "NOUN");
}

function isPlural(token: Token): boolean {
  const word = token.text.toLowerCase();
  return token.pos === "NOUN" && /s$/.test(word) && word !== token.lemma && !PLURAL_MODIFIERS.has(word);
}
