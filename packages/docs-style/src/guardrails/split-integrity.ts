/**
 * Split integrity: the defects reviewers kept finding where a rewrite split one sentence into two
 * or more. Each check reads one BEFORE sentence that the rewrite split, and the AFTER sentences it
 * became. A sentence the rewrite kept whole passes, whatever else changed.
 * - a. Colon lead-in moved. "X is excluded for now, each with a reason:" became "X is excluded for
 *   now. Each has a reason:", so the colon that introduced the next block hangs on the second
 *   piece. A colon after the first one to three words opens a label ("Why:") and does not count.
 * - b. Trailing citation cut off. "A; B (D81–D84, State Model)." became "A. B (D81–D84, State
 *   Model).", so the citation backs only B.
 * - c. Leading scope phrase cut off. "Among sections, A, then B, then C." became "Among sections,
 *   A. B. C.", so B and C no longer sit inside "Among sections".
 * - d. Repeated subject. "A detail line sets in X, in Y." became "A detail line sets in X. A detail
 *   line sets in Y.": the rewrite repeats three or more words to prop up a piece it cut off.
 * - e. Identifier case changed. "…floor; covered-content and unreadable-labels catch …" became
 *   "…floor. Covered-content and unreadable-labels catch …", and the lint rule lost its name.
 * Each rule was tuned on the reviewer-labelled calibration rows: a shape that reviewers approved
 * as often as they rejected it does not fail, so each check names the narrow form that only fails.
 */
import type { DeltaSpan } from "@codecaine-ai/docs-model";
import { referenceTarget } from "../text";
import type { GuardrailResult } from "../types";
import { excerpt, literalSentences, STOP_WORDS, type LiteralSentence, type RewriteText } from "./prose";

/** The five ways a split goes wrong, in the order the checks run. */
export type SplitCheck = "colon-lead-in" | "trailing-citation" | "leading-scope" | "repeated-subject" | "identifier-case";

export interface SplitDefect {
  check: SplitCheck;
  /** One report line: the BEFORE sentence, and what the split did to it. */
  detail: string;
}

/** One word of a sentence: a run of letters and digits, or one code span or reference. */
interface Word {
  /** Lowercase text, or "\u0000" and the literal's identity, such as "\u0000ref:<target>". */
  key: string;
  /** Offsets in the sentence's bare text. */
  start: number;
  end: number;
}

interface Sentence {
  /** proseText form: each code span or reference is one "\u0000". */
  bare: string;
  /** As a reader sees it, for report lines. */
  display: string;
  words: Word[];
}

const WORD = /\u0000|[\p{L}\p{N}_]+(?:['’][\p{L}\p{N}_]+)*/gu;

function toSentence({ bare, literal, display }: LiteralSentence): Sentence {
  const identities = [...literal.matchAll(/\u0000([^\u0000]*)\u0000/g)].map((match) => match[1]!);
  let next = 0;
  const words = [...bare.matchAll(WORD)].map((match) => ({
    key: match[0] === "\u0000" ? `\u0000${identities[next++] ?? ""}` : match[0].toLowerCase(),
    start: match.index!,
    end: match.index! + match[0].length,
  }));
  return { bare, display, words };
}

/** Where a word sits: its sentence, and its index in that sentence. */
interface Place {
  sentence: number;
  word: number;
}

interface Alignment {
  /** For each BEFORE word, the AFTER word it became, along the longest common word sequence. */
  match: (Place | undefined)[][];
  /** For each AFTER sentence, the BEFORE sentence most of its matched words came from, or -1. */
  source: number[];
}

/** Larger blocks are not aligned: the table would cost too much memory, and no rewrite is that long. */
const MAX_CELLS = 4_000_000;

function align(before: readonly Sentence[], after: readonly Sentence[]): Alignment | undefined {
  const flat = (sentences: readonly Sentence[]) =>
    sentences.flatMap((sentence, index) => sentence.words.map((word, at) => ({ key: word.key, sentence: index, word: at })));
  const b = flat(before);
  const a = flat(after);
  const width = a.length + 1;
  if ((b.length + 1) * width > MAX_CELLS) return undefined;
  // lengths[i][j]: the longest common sequence of b[i..] and a[j..].
  const lengths = new Uint32Array((b.length + 1) * width);
  for (let i = b.length - 1; i >= 0; i--) {
    for (let j = a.length - 1; j >= 0; j--) {
      lengths[i * width + j] =
        b[i]!.key === a[j]!.key ? lengths[(i + 1) * width + j + 1]! + 1 : Math.max(lengths[(i + 1) * width + j]!, lengths[i * width + j + 1]!);
    }
  }
  const match = before.map((sentence) => sentence.words.map((): Place | undefined => undefined));
  const votes = after.map(() => new Map<number, number>());
  for (let i = 0, j = 0; i < b.length && j < a.length; ) {
    const [from, to] = [b[i]!, a[j]!];
    if (from.key === to.key) {
      match[from.sentence]![from.word] = { sentence: to.sentence, word: to.word };
      const tally = votes[to.sentence]!;
      tally.set(from.sentence, (tally.get(from.sentence) ?? 0) + 1);
      i++;
      j++;
    } else if (lengths[(i + 1) * width + j]! >= lengths[i * width + j + 1]!) i++;
    else j++;
  }
  const source = votes.map((tally) => {
    let best = -1;
    let most = 0;
    for (const [sentence, count] of tally) {
      if (count > most) [best, most] = [sentence, count];
    }
    return best;
  });
  return { match, source };
}

/** One BEFORE sentence the rewrite split, and the AFTER sentences it became, in order. */
interface Split {
  sentence: Sentence;
  /** The AFTER sentence each word of `sentence` became part of, if any. */
  match: readonly (Place | undefined)[];
  /** Indexes into the AFTER sentences. Two or more. */
  pieces: number[];
}

interface Context {
  after: readonly Sentence[];
  /** The identities ("ref:<target>") of the references in BEFORE that point at a docs page. */
  docPages: ReadonlySet<string>;
}

/** How many opening words a later piece must repeat to count as the sentence's own start. */
const OPENING_WORDS = 3;

/** True when `piece` opens with the first words of `sentence`, as the first piece of a split does. */
function opensLike(piece: Sentence, sentence: Sentence): boolean {
  const n = Math.min(OPENING_WORDS, sentence.words.length);
  return n > 0 && sentence.words.slice(0, n).every((word, i) => piece.words[i]?.key === word.key);
}

/** A colon that ends the sentence, past any closing mark. */
const FINAL_COLON = /:[)\]"'”’]*\s*$/u;
/** A sentence of this many words or fewer that ends in a colon is a label, such as "For example:". */
const LABEL_WORDS = 3;

/** True when the word at `index` in `piece` is followed by a colon, past any closing mark. */
const colonAfter = (piece: Sentence, index: number) => /^[)\]"'”’]*:(?=\s|$)/u.test(piece.bare.slice(piece.words[index]!.end));

/**
 * a. A colon that ends the sentence introduces the next block: a list, a table, a code block. After
 * the split it must still end the piece that keeps the sentence's start, so the whole sentence
 * still leads in. A colon inside the sentence elaborates its own clause, and moves with it.
 */
function colonLeadIn({ sentence, match, pieces }: Split, { after }: Context): string | undefined {
  if (!FINAL_COLON.test(sentence.bare) || sentence.words.length <= LABEL_WORDS) return undefined;
  const anchor = match.at(-1);
  const last = pieces.at(-1)!;
  // The colon stays after the last word it followed, or at least ends the last piece.
  const holder = anchor && colonAfter(after[anchor.sentence]!, anchor.word) ? anchor.sentence : FINAL_COLON.test(after[last]!.bare) ? last : undefined;
  if (holder === undefined) return "the colon that led into the next block is gone";
  if (holder === pieces[0] || opensLike(after[holder]!, sentence)) return undefined;
  return `its closing colon now leads in from "${excerpt(after[holder]!.display, 40)}" alone`;
}

/**
 * A decision ID: D81, the form the corpora's decision logs use, or ADR-12. Other capitals and digits,
 * such as UTF-8, H2, or P99, name things and cite nothing.
 */
const DECISION_ID = /(?<![\p{L}\p{N}_])(?:D|ADR-?)\d{1,4}(?![\p{L}\p{N}_])/gu;
const SEE = /^\s*see\b/iu;
/** The closing run of spaces and end marks. The lookbehind starts it only at its first character. */
const CLOSING_MARKS = /(?<![\s.!?])[\s.!?]+$/u;

/**
 * Where a citation at the end of the sentence starts, as an offset in its bare text, or undefined.
 * A citation is a closing parenthetical that holds a reference to a docs page, two or more decision
 * IDs ("D81–D84"), or "see"; a closing "see X" clause; or a docs page reference set off by a dash,
 * comma, or colon at the very end. A source file reference backs the one claim beside it, and so
 * does a lone decision ID: reviewers accepted splits that left those on the last piece.
 */
function citationStart(sentence: Sentence, docPages: ReadonlySet<string>): number | undefined {
  const text = sentence.bare.replace(CLOSING_MARKS, "");
  const citesPage = (word: Word) => docPages.has(word.key.slice(1));
  if (text.endsWith(")")) {
    let depth = 0;
    for (let i = text.length - 1; i >= 0; i--) {
      if (text[i] === ")") depth++;
      else if (text[i] === "(" && --depth === 0) {
        const inner = text.slice(i + 1, -1);
        const words = sentence.words.filter((word) => word.start > i && word.end < text.length);
        if (words.some(citesPage) || (inner.match(DECISION_ID)?.length ?? 0) >= 2 || SEE.test(inner)) return i;
        break;
      }
    }
  }
  const see = /[,;—–]\s*(see(?:\s+also)?\s[^,;()—–]+)$/iu.exec(text);
  if (see) return text.length - see[1]!.length;
  const last = sentence.words.at(-1);
  if (last && citesPage(last) && last.end === text.length && /[—–,:]\s*$/u.test(text.slice(0, last.start))) return last.start;
  return undefined;
}

/**
 * b. A citation that closed the sentence must not end up on a later piece alone. A citation that
 * becomes its own sentence ("See X.") still follows the whole statement, so it passes.
 */
function trailingCitation({ sentence, match, pieces }: Split, { after, docPages }: Context): string | undefined {
  const start = citationStart(sentence, docPages);
  if (start === undefined) return undefined;
  const first = sentence.words.findIndex((word) => word.start >= start);
  const place = first < 0 ? undefined : match.slice(first).find(Boolean);
  if (!place || place.word === 0 || place.sentence === pieces[0] || opensLike(after[place.sentence]!, sentence)) return undefined;
  return `its closing citation now backs only "${excerpt(after[place.sentence]!.display, 40)}"`;
}

/** Words that open a phrase scoping the clauses after it: a condition, or a frame of place, time, or set. */
const SCOPE_OPENERS: ReadonlySet<string> = new Set(
  "if when whenever unless once while where wherever until after before given provided in among for within across under on at during inside outside per with without throughout between from by upon over through beyond".split(
    " ",
  ),
);
/** A scope phrase longer than this is a clause of its own, not a frame. */
const SCOPE_MAX_WORDS = 12;
/**
 * The pieces a split must make before a scope phrase counts as cut off. A sentence split in two
 * reads as one statement and its follow-up, and reviewers carried the scope across it; a chain of
 * three or more clauses under one frame ("Among sections, A, then B, then C") loses it.
 */
const SCOPE_MIN_PIECES = 3;

/** The number of words in the opening scope phrase, up to its comma, or undefined. */
function scopePhrase(sentence: Sentence): number | undefined {
  const opener = sentence.words[0];
  if (!opener || opener.start !== 0 || !SCOPE_OPENERS.has(opener.key)) return undefined;
  const comma = /^[^,;:—–()]*,/u.exec(sentence.bare);
  if (!comma) return undefined;
  const count = sentence.words.filter((word) => word.end <= comma[0].length).length;
  return count >= 2 && count <= SCOPE_MAX_WORDS && count < sentence.words.length ? count : undefined;
}

/**
 * c. A phrase that opens the sentence and scopes its chain of clauses must still scope every piece.
 * A first piece that ends in a colon ("Among sections:") leads into the pieces after it, so they
 * stay inside its scope.
 */
function leadingScope({ sentence, match, pieces }: Split, { after }: Context): string | undefined {
  const count = scopePhrase(sentence);
  if (count === undefined || pieces.length < SCOPE_MIN_PIECES || FINAL_COLON.test(after[pieces[0]!]!.bare)) return undefined;
  // The phrase must still open the first piece.
  const kept = new Set(match.slice(0, count).flatMap((place) => (place ? [place.sentence] : [])));
  if (kept.size !== 1 || !kept.has(pieces[0]!)) return undefined;
  const phrase = sentence.words.slice(0, count).map((word) => word.key);
  for (const piece of pieces.slice(1).map((at) => after[at]!)) {
    const keys = new Set(piece.words.map((word) => word.key));
    if (piece.words[0]?.key === phrase[0] || phrase.every((key) => keys.has(key))) continue;
    return `"${excerpt(piece.display, 40)}" falls outside its opening "${excerpt(sentence.bare.slice(0, sentence.words[count - 1]!.end), 30)}"`;
  }
  return undefined;
}

/** A rewrite that repeats this many words or more props up a cut-off piece. */
const REPEAT_WORDS = 3;
/** Words that point back. Where the author wrote one, naming its noun again is the usual split. */
const POINTERS: ReadonlySet<string> = new Set("it its they them their this these that those which who whom whose he she him her we".split(" "));

/** How often `phrase` occurs in `keys`. */
function occurrences(keys: readonly string[], phrase: readonly string[]): number {
  let count = 0;
  for (let i = 0; i + phrase.length <= keys.length; i++) {
    if (phrase.every((key, j) => keys[i + j] === key)) count++;
  }
  return count;
}

/**
 * d. Two pieces in a row that open with the same three or more words, which the author wrote once
 * and shared: "X groups A, and searches B" became "X groups A. X searches B." Two content words at
 * least, so "This is a" passes. Where the author pointed back with "it" or "which", naming the noun
 * again is how a split should read, and reviewers accepted it.
 */
function repeatedSubject({ sentence, match, pieces }: Split, { after }: Context): string | undefined {
  const own = sentence.words.map((word) => word.key);
  for (let p = 0; p + 1 < pieces.length; p++) {
    const [one, two] = [pieces[p]!, pieces[p + 1]!];
    if (two !== one + 1) continue;
    const first = after[one]!.words.map((word) => word.key);
    const second = after[two]!.words.map((word) => word.key);
    let length = 0;
    while (length < first.length && length < second.length && first[length] === second[length]) length++;
    if (length < REPEAT_WORDS) continue;
    const phrase = second.slice(0, length);
    if (phrase.filter((key) => !STOP_WORDS.has(key)).length < 2) continue;
    const written = occurrences(own, phrase);
    if (written === 0 || written >= occurrences(first, phrase) + occurrences(second, phrase)) continue;
    // The author's words between the two pieces: a pointer there means the noun replaces it.
    const end = match.reduce((last, place, at) => (place?.sentence === one ? at : last), -1);
    const start = match.findIndex((place) => place?.sentence === two);
    if (end < 0 || start <= end || own.slice(end + 1, start).some((key) => POINTERS.has(key))) continue;
    return `the rewrite repeats "${excerpt(after[two]!.bare.slice(0, after[two]!.words[length - 1]!.end), 40)}"`;
  }
  return undefined;
}

/** A word with any inner hyphen, dot, slash, underscore, or apostrophe, such as "covered-content" or "doc.json". */
const NAME_TOKEN = /[\p{L}\p{N}_](?:[\p{L}\p{N}_'’./-]*[\p{L}\p{N}_])?/gu;
/**
 * A lowercase name rather than a plain word, as sentence-shape reads one: "iOS", or an identifier
 * with a hyphen, dot, slash, underscore, or digit, such as "covered-content" or "doc.json". A dotted
 * abbreviation such as "e.g" is a plain word, and "E.g." is right at the start of a sentence.
 */
const isLowercaseName = (word: string) =>
  /^\p{Ll}/u.test(word) && (/^\p{Ll}+\p{Lu}/u.test(word) || /[-._/\d]/.test(word)) && !/^(?:\p{Ll}\.)+\p{Ll}$/u.test(word);
const capitalized = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
/**
 * What follows a name that stands on its own: punctuation, the end, "and" or "or", or an auxiliary
 * or modal verb. A hyphenated word followed by a noun modifies it ("Per-type renderers"), and a
 * capital letter is right for it at the start of a sentence.
 */
const STANDS_ALONE =
  /^(?:\s*(?:[,;:.!?)\]]|$)|\s+(?:and|or|nor|is|are|was|were|has|have|had|does|do|did|can|cannot|must|will|would|should|may|might|could)(?![\p{L}\p{N}_'’-]))/iu;

/**
 * e. A lowercase identifier keeps its case. "…floor; covered-content and unreadable-labels catch
 * collisions" became "…floor. Covered-content and unreadable-labels catch collisions", and
 * "Covered-content" no longer names the lint rule. Only a name that stands on its own counts.
 */
function identifierCase({ sentence, pieces }: Split, { after }: Context): string | undefined {
  const own = sentence.bare.match(NAME_TOKEN) ?? [];
  // Each name in the pieces, with the text after it.
  const made = pieces.flatMap((at) => {
    const { bare } = after[at]!;
    return [...bare.matchAll(NAME_TOKEN)].map((match) => ({ word: match[0], rest: bare.slice(match.index! + match[0].length) }));
  });
  const count = (words: readonly string[], word: string) => words.filter((token) => token === word).length;
  const words = made.map(({ word }) => word);
  for (const name of new Set(own.filter(isLowercaseName))) {
    const upper = capitalized(name);
    if (count(words, name) >= count(own, name) || count(words, upper) <= count(own, upper)) continue;
    if (made.some(({ word, rest }) => word === upper && STANDS_ALONE.test(rest))) return `"${name}" became "${upper}"`;
  }
  return undefined;
}

const CHECKS: readonly [SplitCheck, (split: Split, context: Context) => string | undefined][] = [
  ["colon-lead-in", colonLeadIn],
  ["trailing-citation", trailingCitation],
  ["leading-scope", leadingScope],
  ["repeated-subject", repeatedSubject],
  ["identifier-case", identifierCase],
];

/** The identities of the references in `spans` that point at a docs page rather than a source file. */
function docPageReferences(spans: readonly DeltaSpan[]): Set<string> {
  return new Set(spans.flatMap(({ attributes }) => (attributes?.reference?.kind === "doc" ? [`ref:${referenceTarget(attributes.reference)}`] : [])));
}

/**
 * Every split defect in a rewrite, in the order of the BEFORE sentences. Undefined when the block is
 * too long to align, so nothing was checked.
 */
export function splitDefects(input: RewriteText): SplitDefect[] | undefined {
  const before = literalSentences(input.beforeSpans).map(toSentence);
  const after = input.afterBlocks.flatMap((spans) => literalSentences(spans)).map(toSentence);
  const alignment = align(before, after);
  if (!alignment) return undefined;
  const context = { after, docPages: docPageReferences(input.beforeSpans) };
  return before.flatMap((sentence, index) => {
    const pieces = after.flatMap((_, at) => (alignment.source[at] === index ? [at] : []));
    if (pieces.length < 2) return [];
    const split = { sentence, match: alignment.match[index]!, pieces };
    return CHECKS.flatMap(([check, find]) => {
      const problem = find(split, context);
      return problem ? [{ check, detail: `"${excerpt(sentence.display, 50)}" was split, and ${problem}` }] : [];
    });
  });
}

/**
 * "split-integrity": a sentence the rewrite split keeps its closing colon on the piece that keeps
 * its start, its closing citation over every piece, its opening scope over a chain of pieces, and
 * the case of its lowercase identifiers, and no piece repeats the opening words the author shared
 * between two clauses.
 */
export function checkSplitIntegrity(input: RewriteText): GuardrailResult {
  const defects = splitDefects(input);
  if (!defects) return { id: "split-integrity", ok: true, skipped: true, detail: "not run: the block is too long to align" };
  if (!defects.length) return { id: "split-integrity", ok: true, detail: "every split keeps its lead-in, citation, scope, subject, and identifiers" };
  const more = defects.length > 1 ? `, and ${defects.length - 1} more` : "";
  return { id: "split-integrity", ok: false, detail: `${defects[0]!.detail}${more}` };
}
