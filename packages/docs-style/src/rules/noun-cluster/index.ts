/**
 * STE 2.1, relaxed: at most 3 nouns in a row. A registered multi-word technical noun ("change
 * set") counts as one noun, and so does a proper name ("Canvas Studio"), a code span, and a
 * compound written as one word ("sub-agent", "doc.json").
 *
 * A vocabulary rule: it advises and never starts a rewrite. Plain tagging finds about 60% true
 * clusters, because the tagger often reads a verb after a noun run as a noun ("Change sets group
 * proposals"). The guards below trade some recall for precision.
 */
import { technicalNouns, thresholds } from "../../profile";
import { sentences, tag, type Token } from "../../text";
import { isQuoted } from "../../text/quotes";
import { sentenceFields } from "../../text/sentence-fields";
import type { StyleMatch, StyleRule } from "../../types";

export const nounClusterRule: StyleRule = {
  id: "ste.noun-cluster",
  layer: "vocabulary",
  docsPath: "99-appendix/10-style-guide/30-ste-profile",
  summary: `More than ${thresholds.nounClusterNouns} nouns in a row. A registered multi-word technical noun counts as one.`,
  hint: `Break the noun cluster with a preposition such as "of" or "for", using only the words already there: "the import budget check script" becomes "the script for the import budget check". Keep every term.`,
  detect(context) {
    return sentenceFields(context).flatMap((field) => {
      if (/^props\.rows\[/.test(field.field)) return [];
      return sentences(field.text).flatMap((sentence) =>
        clusters(sentence, tag(lowerFirstWord(sentence)))
          .filter((run) => run.length > thresholds.nounClusterNouns && !isQuoted(sentence, run[0]!.start))
          .map(
            (run): StyleMatch => ({
              blockId: field.blockId,
              field: field.field,
              message: `${run.length} nouns in a row.`,
              evidence: sentence.slice(run[0]!.start, run.at(-1)!.end),
              sentence,
            }),
          ),
      );
    });
  },
};

/**
 * wink tags every capitalized first word as a name, so "Raw Markdown image sequences" would open
 * with four nouns. A lowercase first letter gives the word its real tag. The length is unchanged,
 * so token offsets still point into the original sentence.
 */
function lowerFirstWord(sentence: string): string {
  return /^\p{Lu}\p{Ll}+(?![\p{L}\d_.-]*\p{Lu})/u.test(sentence) ? sentence.charAt(0).toLowerCase() + sentence.slice(1) : sentence;
}

/** One noun-cluster unit: a word, a compound, a code span, a proper name, or a technical noun. */
interface Unit {
  start: number;
  end: number;
  /** Lowercase text, with a space between merged words. */
  text: string;
  /** The tag of the first token. */
  pos: string;
  /** Written as one word from several tokens ("sub-agent", "doc.json"), or a merged technical noun. */
  compound: boolean;
  /** Ends in a plural noun, which can also be a verb: "blocks", "stores", "params". */
  plural: boolean;
  /** Starts with a capital letter, as a name does. */
  capitalized: boolean;
  /** The lemma of the last token, so "change sets" matches the term "change set". */
  lemma: string;
}

/**
 * Each noun cluster in a sentence, split where the tagger likely took a verb for a noun. A clause
 * with no verb is a label ("Docs model package source root"), or the tagger read its verb as one
 * of the nouns ("Codex and Claude use stdio MCP bridges"). Either way its run is not a cluster,
 * unless a split already found the verb.
 */
function clusters(sentence: string, tokens: readonly Token[]): Unit[][] {
  const units = mergeNames(mergeTerms(words(sentence, tokens)));
  return clauses(units).flatMap((clause) => {
    const finite = clause.some(isFiniteVerb);
    return nounRuns(clause).flatMap(({ run, next }) => {
      const nouns = dropModifier(run);
      const parts = splitAtVerbs(nouns, next);
      const split = parts.length !== 1 || parts[0]!.length !== nouns.length;
      return finite || split ? parts : [];
    });
  });
}

/** Clause edges: punctuation, conjunctions, and clause words such as "when" and "which". */
const CLAUSE_WORDS = new Set(["when", "where", "while", "which", "who", "whose", "unless", "because", "although", "though", "since", "until", "if"]);

function clauses(units: readonly Unit[]): Unit[][] {
  const out: Unit[][] = [[]];
  for (const unit of units) {
    const edge = ["PUNCT", "SYM", "CCONJ", "SCONJ"].includes(unit.pos) || CLAUSE_WORDS.has(unit.text);
    if (edge) out.push([]);
    else out.at(-1)!.push(unit);
  }
  return out;
}

/** A verb that can carry a clause: an auxiliary, a base form, or an -s form. */
function isFiniteVerb(unit: Unit): boolean {
  return unit.pos === "AUX" || (unit.pos === "VERB" && !unit.compound && !/(?:ed|ing)$/.test(unit.text));
}

function nounRuns(clause: readonly Unit[]): { run: Unit[]; next?: Unit }[] {
  const runs: { run: Unit[]; next?: Unit }[] = [];
  let run: Unit[] = [];
  clause.forEach((unit, i) => {
    if (isNounLike(unit)) run.push(unit);
    if (run.length && (!isNounLike(unit) || i === clause.length - 1)) {
      runs.push({ run, next: isNounLike(unit) ? undefined : unit });
      run = [];
    }
  });
  return runs;
}

function isNounLike(unit: Unit): boolean {
  return unit.compound || unit.pos === "NOUN" || unit.pos === "PROPN";
}

/**
 * A run that opens with a hyphenated compound or an -ing word opens with a modifier, not a noun:
 * "in-place editing node view", "standing agent knowledge".
 */
function dropModifier(run: readonly Unit[]): Unit[] {
  const first = run[0];
  const modifier = first && (/^[\p{L}\d]+(?:-[\p{L}\d.]+)+$/u.test(first.text) || (!first.compound && /ing$/.test(first.text)));
  return modifier ? run.slice(1) : [...run];
}

/** Tokens that start an object after a verb: "blocks the write", "stores 3 marks". */
const OBJECT_START = new Set(["DET", "PRON", "NUM", "ADJ"]);

/**
 * Splits a run where the tagger likely took a verb for a noun:
 * - a plural followed by another noun is a verb ("model stores marks") or a subject before one
 *   ("sets group proposals"), so the run breaks on both sides of it;
 * - a plural at the end of a run, before "the", a number, or an adjective, is a verb: "the style
 *   gate blocks the write";
 * - any last word before "the" or a pronoun is a verb: "the MCP resource `x` return the guide".
 */
function splitAtVerbs(run: readonly Unit[], next: Unit | undefined): Unit[][] {
  const parts: Unit[][] = [[]];
  run.forEach((unit, i) => {
    const last = i === run.length - 1;
    const verb =
      (unit.plural && (!last || OBJECT_START.has(next?.pos ?? ""))) ||
      (last && unit.pos === "NOUN" && !unit.compound && (next?.pos === "DET" || next?.pos === "PRON"));
    if (verb) parts.push([]);
    else parts.at(-1)!.push(unit);
  });
  return parts.filter((part) => part.length);
}

const JOINERS = new Set(["-", "_", ".", "/", "+", "@", "#"]);
const POSSESSIVE = /^(?:'s|’s|'|’|n't|n’t)$/i;
/** Plural nouns that this corpus uses as modifiers, as in "docs root". */
const PLURAL_MODIFIERS = new Set(["docs"]);

const alphanumeric = (token: Token | undefined) =>
  !!token && (token.code === true || /^[\p{L}\p{N}][\p{L}\p{N}-]*$/u.test(token.text));

/**
 * Tokens with no space between them form one word. wink splits "sub-agent" into five tokens and
 * "doc.json" into three; the cluster rule counts each as one compound.
 */
function words(sentence: string, tokens: readonly Token[]): Unit[] {
  const units: Unit[] = [];
  let i = 0;
  while (i < tokens.length) {
    let j = i;
    while (joins(tokens[j]!, tokens[j + 1], tokens[j + 2])) j++;
    const first = tokens[i]!;
    const last = tokens[j]!;
    const text = sentence.slice(first.start, last.end);
    units.push({
      start: first.start,
      end: last.end,
      text: text.toLowerCase(),
      pos: first.pos,
      compound: j > i,
      plural: isPlural(last),
      capitalized: /^\p{Lu}/u.test(text),
      lemma: last.lemma,
    });
    i = j + 1;
  }
  return units;
}

function joins(left: Token, right: Token | undefined, after: Token | undefined): boolean {
  if (!right || left.end !== right.start || POSSESSIVE.test(right.text)) return false;
  if (JOINERS.has(right.text)) return alphanumeric(left) && alphanumeric(after) && right.end === after!.start;
  return alphanumeric(right) && (alphanumeric(left) || JOINERS.has(left.text));
}

/**
 * A plural noun. wink leaves unknown plurals unlemmatized ("params"), so an -s word with no
 * lemma counts too, unless its ending marks a singular ("status", "canvas", "class", "axis").
 */
function isPlural(token: Token): boolean {
  const word = token.text.toLowerCase();
  if (token.pos !== "NOUN" || PLURAL_MODIFIERS.has(word) || !/s$/.test(word)) return false;
  return word !== token.lemma || /[^suia]s$/.test(word);
}

/** Multi-word technical nouns from the profile, as word lists, longest first. */
const TERMS = technicalNouns
  .map((noun) => noun.term.toLowerCase().split(/\s+/))
  .filter((words) => words.length > 1)
  .sort((a, b) => b.length - a.length);

/** Merges each registered multi-word technical noun into one unit: "change sets" is one noun. */
function mergeTerms(units: readonly Unit[]): Unit[] {
  const out: Unit[] = [];
  for (let i = 0; i < units.length; i++) {
    const term = TERMS.find((words) =>
      words.every((word, k) => units[i + k]?.text === word || (k === words.length - 1 && units[i + k]?.lemma === word)),
    );
    if (!term) {
      out.push(units[i]!);
      continue;
    }
    const parts = units.slice(i, i + term.length);
    const last = parts.at(-1)!;
    out.push({ ...last, start: parts[0]!.start, text: parts.map((part) => part.text).join(" "), pos: "NOUN", compound: true });
    i += term.length - 1;
  }
  return out;
}

/** Merges a run of capitalized names into one unit: "Canvas Studio", "TypeSafe System". */
function mergeNames(units: readonly Unit[]): Unit[] {
  const out: Unit[] = [];
  for (const unit of units) {
    const previous = out.at(-1);
    if (previous && isName(previous) && isName(unit))
      out[out.length - 1] = { ...unit, start: previous.start, text: `${previous.text} ${unit.text}` };
    else out.push(unit);
  }
  return out;
}

function isName(unit: Unit): boolean {
  return unit.pos === "PROPN" && unit.capitalized && !unit.compound;
}
