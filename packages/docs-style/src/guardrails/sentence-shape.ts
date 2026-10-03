/**
 * Sentence shape: the defects reviewers found in accepted pilot rewrites, where the model split a
 * sentence and left a broken piece.
 * - A sentence that starts with "So" or "And" leans on the sentence before it, and a bullet has none.
 * - A sentence that starts with a lowercase plain word reads as a fragment.
 * - "How the docs system's code divides." is a heading written as a sentence.
 * - "Every future command and flag." has no verb: a noun phrase cut loose from its sentence.
 *   Neither has "The backlinks index, held at zero stale.": "held" describes the index (main-verb.ts).
 * - "It picks Light+ or Dark+." opens a new bullet with a pronoun that points back, and the reader
 *   can no longer tell what it points to.
 * - "Applies to: `src/index.ts`: every future command" stacks two colons, which read as nested labels.
 * - "edits: including the node view" puts a colon before "including", which reads as a definition.
 * Only sentences the rewrite wrote are checked. A sentence the author wrote may stay as it is,
 * because smallest-edit requires it to.
 */
import { tag } from "../text";
import type { GuardrailResult } from "../types";
import { authorNounPairs, hasMainVerb } from "./main-verb";
import { excerpt, literalSentences, type RewriteText } from "./prose";

const CONJUNCTION = /^(and|so|but|or|nor)(?![\p{L}\p{N}_'’-])/iu;
/** A question word, but not a label such as "Why:", which opens a sentence of its own. */
const QUESTION_WORD = /^(how|why|what|where|which|whether)(?![\p{L}\p{N}_'’-]|\s*:)/iu;
/** The first word of a sentence, with any inner hyphen, dot, slash, or apostrophe ("docs-cli"). */
const firstWord = (sentence: string) => /^[\p{L}\p{N}_'’./-]*[\p{L}\p{N}_]/u.exec(sentence)?.[0] ?? "";
/**
 * A lowercase start that is a name rather than a plain word: "iOS", or an identifier such as
 * "docs-cli" or "doc.json".
 */
const isLowercaseName = (word: string) => /^\p{Ll}+\p{Lu}/u.test(word) || /[-._/\d]/.test(word);

/**
 * A statement that opens with a question word is a fragment when nothing follows the question
 * word's clause: no comma, so no main clause after a leading condition ("Where a test exists, run
 * it."), and no form of "be", the usual main verb after such a clause ("What crosses a boundary is
 * referenced at the boundary."). A rare full sentence with another main verb is rejected too; the
 * block then keeps its original text.
 */
const isFragment = (sentence: string) => !sentence.includes(",") && !/(?<![\p{L}\p{N}_])(?:is|are|was|were|be|been|being)(?![\p{L}\p{N}_])/iu.test(sentence);

/** A pronoun that points back to an earlier sentence. "It's" counts as "It". */
const BACK_POINTER = /^(It|They|This|These|That|Which|Its|Their|Them)(?![\p{L}\p{N}_-])/u;
const DEMONSTRATIVE = new Set(["This", "These", "That"]);
/** A label colon: followed by a space or the end, so a URL or a time such as 10:30 never counts. */
const LABEL_COLON = /:(?=\s|$)/g;
const COLON_BEFORE_SAMPLE = /:\s+(including|such as|for example)(?![\p{L}\p{N}_])/iu;

/**
 * True when the sentence has no main verb (hasMainVerb). On the pilot calibration set, this flagged
 * no rewrite that reviewers called improved. A bullet of code spans or references, such as
 * "`./backlinks` and `./paths`", lists names: it is not a cut-off clause.
 */
function isVerbless(sentence: string, authorNouns: ReadonlySet<string>): boolean {
  const words = sentence.replace(/\u0000/g, " ").match(/\p{L}+/gu) ?? [];
  return !words.every((word) => /^(?:and|or)$/i.test(word)) && !hasMainVerb(sentence, authorNouns);
}

/**
 * True when two label colons stack with no verb between them, so the second reads as a label
 * inside the first: "Applies to: `src/index.ts`: every future command". "Why: The package is
 * versioned content: a delivery unit" has a clause between them and reads fine.
 */
function stacksColons(sentence: string): boolean {
  const colons = [...sentence.matchAll(LABEL_COLON)].map((match) => match.index!);
  return colons.slice(1).some((at, i) => !hasMainVerb(sentence.slice(colons[i]! + 1, at)));
}

/**
 * A pronoun that opens a new bullet and points back across blocks, in words the author never
 * wrote. A split that keeps the author's own "it" clause ("X does A; it does B") reads as before,
 * and "This package" names what it points to.
 */
function pointsBackAcrossBlocks(sentence: string, place: SentencePlace): string | undefined {
  const pointer = BACK_POINTER.exec(sentence)?.[1];
  if (!pointer || !place.opensBullet || place.authorsClause) return undefined;
  if (DEMONSTRATIVE.has(pointer)) {
    const next = tag(sentence)[1];
    if (next && (next.code || ["NOUN", "PROPN", "ADJ", "NUM"].includes(next.pos))) return undefined;
  }
  return pointer;
}

/** Where a sentence sits in the rewrite, and whether the author already wrote its words. */
interface SentencePlace {
  /** True for the first sentence of a bullet: its pronouns point into another block. */
  opensBullet: boolean;
  /** True when the sentence's words, apart from the case of the first letter, are a clause of BEFORE. */
  authorsClause: boolean;
  /** The noun pairs of BEFORE (authorNounPairs): words the author wrote as a noun phrase are no verb. */
  authorNouns: ReadonlySet<string>;
}

/**
 * What is wrong with one sentence, or undefined. A sentence that starts with a code or reference
 * span is fine, and so is a lowercase first word the author also started a sentence with, such as
 * the package name "framework".
 */
function shapeProblem(sentence: string, authorStarts: ReadonlySet<string>, place: SentencePlace): string | undefined {
  const conjunction = CONJUNCTION.exec(sentence);
  if (conjunction) return `starts with "${conjunction[1]}"`;
  const first = firstWord(sentence);
  if (/^\p{Ll}/u.test(sentence) && !isLowercaseName(first) && !authorStarts.has(first)) return "starts with a lowercase word";
  const question = QUESTION_WORD.exec(sentence);
  if (question && sentence.endsWith(".") && isFragment(sentence)) return `is a "${question[1]}" fragment, not a sentence`;
  const pointer = pointsBackAcrossBlocks(sentence, place);
  if (pointer) return `opens a bullet with "${pointer}", which points back`;
  if (stacksColons(sentence)) return "stacks two colons";
  const sample = COLON_BEFORE_SAMPLE.exec(sentence);
  if (sample) return `has a colon before "${sample[1]}"`;
  if (isVerbless(sentence, place.authorNouns)) return "has no verb";
  return undefined;
}

const normalize = (sentence: string) => sentence.replace(/\s+/g, " ").trim();

/**
 * "sentence-shape": no sentence the rewrite wrote starts with a conjunction or a lowercase word, opens
 * a bullet with a pronoun that points back, is a question-word fragment, stacks two colons, puts a
 * colon before "including", or has no verb.
 */
export function checkSentenceShape(input: RewriteText): GuardrailResult {
  const authored = literalSentences(input.beforeSpans);
  // A sentence is the author's only when its code spans and references are the author's too.
  const authoredLiterals = new Set(authored.map(({ literal }) => normalize(literal)));
  const authorStarts = new Set(authored.map(({ bare }) => firstWord(normalize(bare))));
  const authoredText = normalize(authored.map(({ literal }) => literal).join(" "));
  const isAuthorsClause = (literal: string) =>
    authoredText.includes(normalize(literal).replace(/[.!?]+$/, "").replace(/^\p{Lu}/u, (letter) => letter.toLowerCase()));
  const authorNouns = authorNounPairs(authored.map(({ bare }) => normalize(bare)));
  const problems = input.afterBlocks.flatMap((spans, block) =>
    literalSentences(spans).flatMap(({ bare, literal, display }, index) => {
      if (authoredLiterals.has(normalize(literal))) return [];
      const place = { opensBullet: block > 0 && index === 0, authorsClause: isAuthorsClause(literal), authorNouns };
      const problem = shapeProblem(normalize(bare), authorStarts, place);
      return problem ? [`"${excerpt(display, 60)}" ${problem}`] : [];
    }),
  );
  if (!problems.length) return { id: "sentence-shape", ok: true, detail: "every new sentence stands alone" };
  const more = problems.length > 1 ? `, and ${problems.length - 1} more` : "";
  return { id: "sentence-shape", ok: false, detail: `${problems[0]}${more}` };
}
