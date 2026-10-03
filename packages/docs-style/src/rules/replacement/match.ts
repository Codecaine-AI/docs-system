/**
 * Deny-list matching shared by the replacement, filler, modal-verbs, and one-name rules. It finds
 * listed words in authored prose, decides whether a swap is safe, and applies the safe swaps.
 *
 * A match must be a use, not a mention. These never match:
 * - code and reference spans, which are one "\u0000" each in proseText
 * - words in quotes, such as "utilize" or 'don't utilize' (the shared parser in text/quotes.ts)
 * - structured tables that list words, found by their column names ("Do Not Write", "Write")
 * - a capitalized word inside a sentence, which is a name or a title-case heading word
 *
 * A swap is autofixable only when it cannot change meaning or grammar. Each guard below names
 * the kind of sentence it protects, such as "at the beginning" or "an informed choice". A few
 * guards read the whole page (PageFacts): a word the page uses in a heading is a term there.
 */
import type { DeltaSpan, DocBlock, DocDocument } from "@codecaine-ai/docs-model";
import type { LintContext } from "@codecaine-ai/docs-model/lint";
import { orderedBlocks } from "@codecaine-ai/docs-model/lint/engine";
import type { PartOfSpeech, Replacement } from "../../profile";
import { authoredProse, proseText, sentences, tag, type Token } from "../../text";
import {
  formOf,
  inflect,
  inflectLike,
  lemmaOf,
  pluralOf,
  verbInflections,
  wordClass,
  type WordForm,
} from "../../text/inflect";
import { hasFiniteVerb, PREPOSITIONS } from "../../text/clause";
import { quotedRanges } from "../../text/quotes";
import { editPlainSpans, plainRanges, spanProse } from "../../text/span-edit";
import type { StyleMatch, StyleRule } from "../../types";

// ---------------------------------------------------------------------------------------------
// Word index: find listed words and phrases at word boundaries
// ---------------------------------------------------------------------------------------------

/** One listed word or phrase, lowercase and single-spaced, with the value it stands for. */
export interface WordEntry<T> {
  text: string;
  value: T;
}

/** Entries keyed by their first word, longest first, so each prose word costs one map lookup. */
export type WordIndex<T> = Map<string, (WordEntry<T> & { pattern: RegExp })[]>;

export interface WordHit<T> {
  start: number;
  end: number;
  matched: string;
  value: T;
}

const WORD = /[\p{L}\p{N}]+/gu;

export function wordIndex<T>(entries: readonly WordEntry<T>[]): WordIndex<T> {
  const index: WordIndex<T> = new Map();
  for (const entry of entries) {
    const key = entry.text.match(/[\p{L}\p{N}]+/u)?.[0];
    if (!key) continue;
    const source = entry.text
      .split(" ")
      .map((word) => word.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"))
      .join("\\s+");
    const list = index.get(key) ?? [];
    list.push({ ...entry, pattern: new RegExp(source, "iuy") });
    index.set(key, list);
  }
  for (const list of index.values()) list.sort((a, b) => b.text.length - a.text.length);
  return index;
}

export interface FindOptions {
  /**
   * Match an all-caps spelling, such as "AI" for the name "ai". Off by default, because an
   * all-caps word in prose is usually code: "ALTER" in "ALTER TABLE".
   */
  acronyms?: boolean;
}

/**
 * Every use of an indexed word in `text` (proseText form): the longest entry at each word start.
 * Mentions are skipped (see the file comment). A word inside a compound, path, file name, or
 * identifier never matches, so "doc" does not match "doc.json", "doc-renderer", or "src/doc".
 * Detect and autofix both read these hits, so a skipped word is neither flagged nor rewritten.
 */
export function findWords<T>(text: string, index: WordIndex<T>, options: FindOptions = {}): WordHit<T>[] {
  const hits: WordHit<T>[] = [];
  let quotes: [number, number][] | undefined;
  for (const word of text.matchAll(WORD)) {
    const start = word.index;
    const candidates = index.get(word[0].toLowerCase());
    if (!candidates || /[\p{L}\p{N}_\-/.@#\\]/u.test(text.charAt(start - 1))) continue;
    for (const entry of candidates) {
      entry.pattern.lastIndex = start;
      const match = entry.pattern.exec(text);
      if (!match) continue;
      const end = start + match[0].length;
      if (!rightBoundary(text, end)) continue;
      quotes ??= quotedRanges(text);
      const mention = quotes.some(([a, b]) => start < b && end > a) || looksLikeName(text, start, match[0]);
      if (!mention && !looksLikeCode(text, start, end, match[0], options.acronyms))
        hits.push({ start, end, matched: match[0], value: entry.value });
      break;
    }
  }
  return hits;
}

/**
 * True for a word that is code written as plain text, which no rule flags or rewrites:
 * - a call or a member: "retain()", "cache.retain"
 * - an identifier with "_" or an inner capital: "retain_count", "subAgent", "authN"
 * - an all-caps word of 2 or more letters, unless `acronyms`: "ALTER", "N/A"
 * - a word inside a path or URL: "src/retain/index.ts", "?mode=retain"
 */
function looksLikeCode(text: string, start: number, end: number, matched: string, acronyms = false): boolean {
  if (text.charAt(end) === "(" || text.charAt(start - 1) === ".") return true;
  if (/_|[\p{Ll}\p{N}]\p{Lu}/u.test(matched)) return true;
  if (!acronyms && allCaps(matched)) return true;
  // The rest of the whitespace-separated token, without the brackets and punctuation around it.
  const lead = /\S*$/.exec(text.slice(0, start))![0].replace(/^["'“‘(\[{<*]+/, "");
  const tail = /^\S*/.exec(text.slice(end))![0].replace(/[)"'”’\]}>.,;:!?*]+$/, "");
  const pathLike = (part: string) => /[/\\=?&#@~]|\p{L}\.\p{L}/u.test(part);
  return pathLike(lead) || pathLike(tail);
}

/** True for a word of 2 or more letters, all capitals: "ALTER", "N/A". */
function allCaps(word: string): boolean {
  const letters = word.replace(/\P{L}/gu, "");
  return letters.length >= 2 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

/** A word ends at a space or punctuation, not inside a compound ("doc-renderer") or file name ("doc.json"). */
function rightBoundary(text: string, end: number): boolean {
  const next = text.charAt(end);
  if (/[\p{L}\p{N}_]/u.test(next)) return false;
  return !(/[-./:@]/.test(next) && /[\p{L}\p{N}]/u.test(text.charAt(end + 1)));
}

/** A capitalized (not all-caps) word inside a sentence is a name or a title-case heading word. */
function looksLikeName(text: string, start: number, matched: string): boolean {
  return /^\p{Lu}\S*\p{Ll}/u.test(matched) && !isSentenceStart(text, start);
}

/** True when `at` starts a sentence: the text start, or after . ! ? or : and whitespace. */
function isSentenceStart(text: string, at: number): boolean {
  const before = text.slice(Math.max(0, at - 24), at);
  if (at <= 24 && /^[\s"'“‘(\[*]*$/.test(before)) return true;
  return /[.!?:]["'”’)\]*]*\s+["'“‘(\[*]*$/.test(before);
}

// ---------------------------------------------------------------------------------------------
// Mentions and sentences
// ---------------------------------------------------------------------------------------------

/**
 * Column names of tables that list words instead of using them: the replacement and filler
 * tables, the naming canon, and the technical noun and verb tables on the Vocabulary page.
 */
const MENTION_COLUMNS = new Set(["do not write", "do not use in prose", "write", "filler", "term", "verb"]);

/** Structured tables whose columns mark them as word lists. Rules skip every field in them. */
export function mentionTables(context: LintContext): Set<string> {
  const ids = new Set<string>();
  for (const block of context.blocks) {
    const columns = block.type === "structured-table" ? block.props.columns : undefined;
    if (Array.isArray(columns) && columns.some((c) => MENTION_COLUMNS.has(proseText(c).trim().toLowerCase())))
      ids.add(block.id);
  }
  return ids;
}

export interface Located {
  start: number;
  end: number;
  text: string;
}

/** The sentences of `text` with their offsets, so a match can name its sentence. */
export function sentenceSpans(text: string): Located[] {
  const out: Located[] = [];
  let cursor = 0;
  for (const sentence of sentences(text)) {
    const at = text.indexOf(sentence, cursor);
    if (at === -1) continue;
    out.push({ start: at, end: at + sentence.length, text: sentence });
    cursor = at + sentence.length;
  }
  return out;
}

export function sentenceAt(spans: readonly Located[], index: number): string | undefined {
  return spans.find((s) => index >= s.start && index < s.end)?.text;
}

/** The token that covers offset `at`. */
export function tokenAt(tokens: readonly Token[], at: number): Token | undefined {
  return tokens.find((t) => t.start <= at && at < t.end);
}

/** The word right before `at`, lowercase, when only whitespace separates them. */
function wordBefore(text: string, at: number): string | undefined {
  return /([\p{L}\p{N}'’]+)\s+$/u.exec(text.slice(Math.max(0, at - 40), at))?.[1]?.toLowerCase();
}

// ---------------------------------------------------------------------------------------------
// Deny-list rows
// ---------------------------------------------------------------------------------------------

/** Words that never take a verb inflection: auxiliaries and modals. */
const AUXILIARIES = new Set(
  "is are was were be been being am has have had do does did can could will would shall should may might must".split(" "),
);
/** Words before a noun. A verb form after one is a noun or an adjective: "the beginning", "an informed choice". */
const DETERMINERS = new Set("a an the each every any no some its their our your my his her".split(" "));
/** "this" is a determiner in "this endeavor" but a subject in "this allows", so the tagger decides. */
const DEMONSTRATIVES = new Set(["this", "these", "those"]);
/**
 * "in order" after "be", or after "keep" or "put" and an object, means sorted: "the keys are in
 * order to allow binary search". There "in order to" is not the purpose phrase a row replaces.
 */
const IN_ORDER_PREDICATE =
  /(?:\b(?:is|are|was|were|be|been|being|am)|\p{L}['’](?:s|re))(?:\s+(?:not|also|already|still|always|now|\w+ly))?\s+$|\b(?:keeps?|kept|keeping|puts?|putting|stays?|stayed|remains?|remained)(?:\s+[^\s.,;:!?]+){0,3}\s+$/iu;
/** Words before a passive participle: "is executed" becomes "is run", not "is ran". */
const PASSIVE =
  /\b(?:is|are|was|were|be|been|being|am|has|have|had|having|gets?|got|gotten)(?:\s+(?:not|also|already|just|then|never|still|first|now|\w+ly))?\s+$/i;

type Replace =
  | { kind: "delete" }
  | { kind: "swap"; text: string }
  | { kind: "options"; options: string[] }
  | { kind: "instruction"; text: string };

/** How a row's `replace` reads. Only a plain word or phrase can be swapped in. */
function readReplace(replace: string): Replace {
  const text = replace.trim();
  if (!text || /^\(delete\)$/i.test(text)) return { kind: "delete" };
  if (text.includes(" | ")) return { kind: "options", options: text.split(" | ").map((o) => o.trim()).filter(Boolean) };
  if (text.startsWith("(")) return { kind: "instruction", text: text.replace(/^\(|\)$/g, "") };
  // "complete or finish" and "a version, a date, or later" name a choice, so no swap is safe.
  if (/\bor\b|[,(/]/.test(text)) return { kind: "options", options: [text] };
  return { kind: "swap", text };
}

/** True for a row that a fix can apply: a plain swap or a deletion. */
function canFix(row: Replacement): boolean {
  const kind = readReplace(row.replace).kind;
  return row.tier !== "flag" && (kind === "swap" || kind === "delete");
}

/**
 * The finds in a find string, lowercase. Commas separate finds ("please note, note that"), and a
 * part in parentheses names a sense ("doc (as a noun)").
 */
export function readFind(find: string): { words: string[]; sense?: string }[] {
  return find
    .toLowerCase()
    .split(/,\s+/)
    .map((part) => ({
      words: part.replace(/\([^)]*\)/, " ").trim().split(/\s+/).filter(Boolean),
      sense: /\(([^)]*)\)/.exec(part)?.[1],
    }))
    .filter((part) => part.words.length > 0);
}

/** One spelling of a row in prose: its own words or an inflected form. */
interface Variant {
  row: Replacement;
  /** The forms this spelling can be. "utilized" is past and participle, "begins" is present. */
  forms: WordForm[];
  /** True for the row's own words, false for an inflected form. */
  exact: boolean;
  /** True when the row's verb forms are listed, so a verb form must be used as a verb. */
  verb: boolean;
  /** True when the find can also be a noun, so a noun use still counts. */
  noun: boolean;
  /** The swap in dictionary form, for a row with one replacement. */
  lemma?: string;
  /** The part of speech the find's sense needs, from "(as a noun)". */
  sense?: PartOfSpeech;
}

const PLAIN_WORDS = /^[a-z]+(?:-[a-z]+)*(?: [a-z]+(?:-[a-z]+)*)*$/;

/**
 * Every spelling of a row: its own words, plus the verb forms of its first word and the plural of
 * its last word when compromise says the words take them. A deletion, an abbreviation, or a find
 * with digits or punctuation matches only as written.
 */
function variantsOf(row: Replacement): { text: string; variant: Variant }[] {
  const replace = readReplace(row.replace);
  const swap = replace.kind === "swap" ? replace.text : undefined;
  const out: { text: string; variant: Variant }[] = [];
  for (const { words, sense } of readFind(row.find)) {
    const needs: PartOfSpeech | undefined = /\bnoun\b/.test(sense ?? "") ? "noun" : /\bverb\b/.test(sense ?? "") ? "verb" : undefined;
    // A sense the tagger cannot check, such as "issue (meaning a problem)", would flag every use.
    if (sense !== undefined && !needs) continue;
    const find = words.join(" ");
    const base: Variant = { row, forms: ["infinitive"], exact: true, verb: false, noun: true, sense: needs, lemma: swap };
    if (replace.kind === "delete" || !PLAIN_WORDS.test(find) || AUXILIARIES.has(words[0]!)) {
      out.push({ text: find, variant: base });
      continue;
    }
    const own = wordClass(find);
    const into = swap ? wordClass(swap) : undefined;
    const canVerb = row.pos ? row.pos === "verb" : own.verb || (own.noun && words.length === 1 && Boolean(into?.verb && !into.noun));
    const verb = canVerb && (!into || (into.verb && !AUXILIARIES.has(swap!.split(" ")[0]!)));
    const nounFind = row.pos ? row.pos === "noun" : own.noun;
    const noun = nounFind && (!into || into.noun) && formOf(find) !== "plural";
    const spellings = new Map<string, WordForm[]>([[find, ["infinitive"]]]);
    let lemma = swap;
    if (verb) {
      const form = formOf(words[0]!);
      const rest = words.slice(1);
      for (const [spelling, forms] of verbInflections(lemmaOf(words[0]!, form)))
        spellings.set([spelling, ...rest].join(" "), forms);
      // "allows you to" is a present form, so its swap "lets you" is "let you" in dictionary form.
      if (swap && form !== "infinitive" && form !== "plural") {
        const [first, ...tail] = swap.split(" ");
        lemma = [lemmaOf(first!, form), ...tail].join(" ");
      }
    }
    if (noun) {
      const plural = pluralOf(find);
      if (plural !== find) spellings.set(plural, [...(spellings.get(plural) ?? []), "plural"]);
    }
    for (const [text, forms] of spellings)
      out.push({ text, variant: { ...base, forms, exact: text === find, verb, noun: nounFind, lemma } });
  }
  return out;
}

/** Index every spelling of every row. A row's own words win over another row's inflected form. */
function compileRows(rows: readonly Replacement[]): WordIndex<Variant> {
  const spellings = new Map<string, Variant>();
  for (const row of rows)
    for (const { text, variant } of variantsOf(row)) {
      const seen = spellings.get(text);
      if (!seen || (variant.exact && !seen.exact)) spellings.set(text, variant);
    }
  return wordIndex([...spellings].map(([text, value]) => ({ text, value })));
}

// ---------------------------------------------------------------------------------------------
// Page facts: what the rest of a page says about a swap
// ---------------------------------------------------------------------------------------------

/** What the rest of a page says about a swap. Read once per page, and only when a swap needs it. */
interface PageFacts {
  /**
   * Rows whose words the page uses, in any form, in its title, a heading, or a capitalized name
   * of 2 or more words. There the word is a term, so it is never swapped: "retain" on a page with
   * a "Retained History" heading, or "purchased" beside "Purchased NAS Equipment".
   */
  terms: ReadonlySet<Replacement>;
  /** True when the page names something "run" (see namesRun). */
  namesRun: boolean;
}

/** One prose field, and whether it is title case: the page title or a heading. */
interface PageField {
  text: string;
  titleCase: boolean;
}

/** The prose fields of a page, as detect reads them. */
function pageFields(page: DocDocument): PageField[] {
  return authoredProse({ document: page, blocks: orderedBlocks(page) }).map((field) => ({
    text: field.text,
    titleCase: field.field === "title" || (field.field === "text" && page.blocks[field.blockId ?? ""]?.type === "heading"),
  }));
}

function factsOf(fields: readonly PageField[], index: WordIndex<Variant>): PageFacts {
  const terms = new Set<Replacement>();
  for (const field of fields)
    for (const name of field.titleCase ? [field.text] : capitalizedNames(field.text))
      for (const row of rowsIn(name, index)) terms.add(row);
  return { terms, namesRun: fields.some(namesRun) };
}

/**
 * The rows whose words occur in `text`, a heading or a name, in any case and with no mention test.
 * An all-caps word is code, as in findWords: "ALTER TABLE" holds no "alter".
 */
function rowsIn(text: string, index: WordIndex<Variant>): Replacement[] {
  const rows: Replacement[] = [];
  for (const word of text.matchAll(WORD)) {
    const start = word.index;
    if (/[\p{L}\p{N}_\-/.@#\\]/u.test(text.charAt(start - 1))) continue;
    for (const entry of index.get(word[0].toLowerCase()) ?? []) {
      entry.pattern.lastIndex = start;
      const match = entry.pattern.exec(text);
      if (!match || !rightBoundary(text, start + match[0].length)) continue;
      if (!allCaps(match[0])) rows.push(entry.value.row);
      break;
    }
  }
  return rows;
}

/**
 * The capitalized names of 2 or more words in a sentence field: "Retained History" in "see Retained
 * History". The first word of a sentence is capitalized anyway, so it does not count: "Retain Sync
 * records" holds the verb "Retain" and the one-word name "Sync".
 */
function capitalizedNames(text: string): string[] {
  const names: string[] = [];
  for (const run of text.matchAll(/\p{Lu}[\p{L}\p{N}'’-]*(?:[ \t]+\p{Lu}[\p{L}\p{N}'’-]*)+/gu)) {
    const name = isSentenceStart(text, run.index) ? run[0].replace(/^\S+[ \t]+/, "") : run[0];
    if (/\s/.test(name)) names.push(name);
  }
  return names;
}

/** "Run" after a determiner is the noun: "the run", "each run", "one run across processes". */
const RUN_NOUN = /\b(?:the|a|each|every|this|one|per|its|their|our|your)\s+run(?![\p{L}\p{N}_-])/iu;

/**
 * True when a field names something "run": the noun after a determiner ("the run owns the
 * composition"), a capitalized "Run" inside a sentence ("Sync and backfill, Run, an epoch
 * boundary"), or a runner ("the DrawCore runner"). On such a page "executes" stays, because "runs"
 * would read as that thing: "Only an EBB board executes them" sits beside "the DrawCore runner".
 * A title or a heading is title case, so its capital "Run" can be the verb ("Run the Build").
 */
function namesRun(field: PageField): boolean {
  const { text, titleCase } = field;
  if (/\brunners?\b/i.test(text) || RUN_NOUN.test(text)) return true;
  return !titleCase && [...text.matchAll(/\bRun(?![\p{L}\p{N}_-])/gu)].some((run) => !isSentenceStart(text, run.index));
}

// ---------------------------------------------------------------------------------------------
// Hits and safe fixes
// ---------------------------------------------------------------------------------------------

interface Fix {
  from: number;
  to: number;
  insert: string;
}

interface DenyHit {
  row: Replacement;
  start: number;
  end: number;
  matched: string;
  /** The swap in the matched form. Undefined when the row has no single replacement or the form is unclear. */
  swap?: string;
  /** The edit that applies the swap or deletion with no review. Undefined when it is not safe. */
  fix?: Fix;
}

const TAGS: Record<PartOfSpeech, string> = { verb: "VERB", noun: "NOUN", adjective: "ADJ", adverb: "ADV" };

/**
 * Every deny-list use in `text` (proseText form), with a fix where the change is safe. `page`
 * reads the rest of the page, and a swap asks for it only when no cheaper check has refused it.
 */
function denyHits(text: string, index: WordIndex<Variant>, page: () => PageFacts): DenyHit[] {
  let tagged: Token[] | undefined;
  const tokens = () => (tagged ??= tag(text));
  const hits: WordHit<Variant>[] = [];
  for (const hit of findWords(text, index)) {
    if (!isUse(text, hit, tokens)) continue;
    const last = hits[hits.length - 1];
    if (!last || hit.start >= last.end) hits.push(hit);
    else if (isDeletion(last.value.row) && isDeletion(hit.value.row) && hit.end > last.end) {
      // "please note" and "note that" overlap in "Please note that": delete them as one.
      last.end = hit.end;
      last.matched = text.slice(last.start, hit.end);
      if (hit.value.row.tier !== "autofix") last.value = hit.value;
    }
  }
  const found: DenyHit[] = hits.map((hit) => {
    const { row } = hit.value;
    if (isDeletion(row)) return { row, start: hit.start, end: hit.end, matched: hit.matched, fix: deletionFix(text, hit) };
    const swap = swapFor(text, hit, tokens, page);
    return { row, start: hit.start, end: hit.end, matched: hit.matched, swap: swap.insert, fix: swap.fix };
  });
  return withoutOverlaps(found);
}

/**
 * Make the fixes disjoint, so autofix can apply them in one pass. A deletion takes the comma or
 * space next to it, so neighbors can overlap: in "It works, basically, actually." the two
 * deletions share a comma. Overlapping deletions merge into one. Any other overlap keeps the
 * first fix and leaves the second match for review.
 */
function withoutOverlaps(hits: DenyHit[]): DenyHit[] {
  let last: Fix | undefined;
  for (const hit of hits) {
    const fix = hit.fix;
    if (!fix) continue;
    if (!last || fix.from >= last.to) last = fix;
    else if (fix.insert === "" && last.insert === "") {
      last.to = Math.max(last.to, fix.to);
      hit.fix = last;
    } else hit.fix = undefined;
  }
  return hits;
}

function isDeletion(row: Replacement): boolean {
  return readReplace(row.replace).kind === "delete";
}

/**
 * False for a match that is not a use of the listed word:
 * - a verb used as a noun: "an agent request", "noun-cluster hits", "at the beginning"
 * - a verb form used as an adjective: "the remaining items", "an informed choice"
 * - a find whose sense needs another part of speech
 * - a word that is filler in every use but means something here: a noun ("add a note that
 *   explains it"), or a word after a negation ("not simply a wrapper")
 * - "in order" that means sorted (IN_ORDER_PREDICATE)
 * A "pos" row keeps its noun uses: the Vocabulary page flags them for a person to rewrite.
 */
function isUse(text: string, hit: WordHit<Variant>, tokens: () => Token[]): boolean {
  const { forms, verb, noun, exact, sense, row } = hit.value;
  if (/^in\s+order\b/i.test(hit.matched) && IN_ORDER_PREDICATE.test(before(text, hit.start))) return false;
  if (sense) return tokenAt(tokens(), hit.start)?.pos === TAGS[sense];
  if (row.tier === "autofix" && isDeletion(row)) {
    const previous = wordBefore(text, hit.start) ?? "";
    if (previous === "not" || previous === "never" || /n['’]t$/.test(previous)) return false;
    const pos = tokenAt(tokens(), hit.start)?.pos;
    return !(pos === "NOUN" || pos === "PRON" || (pos === "PROPN" && !isSentenceStart(text, hit.start)));
  }
  if (!verb || row.tier === "pos") return true;
  const pos = tokenAt(tokens(), hit.start)?.pos;
  if (pos === "NOUN" && !forms.includes("plural") && (!exact || !noun)) return false;
  if (!forms.some((f) => f === "past" || f === "participle" || f === "gerund")) return true;
  return pos !== "ADJ" || PASSIVE.test(before(text, hit.start));
}

/** The swap in the matched form, and the fix when it is safe to apply with no review. */
function swapFor(text: string, hit: WordHit<Variant>, tokens: () => Token[], page: () => PageFacts): { insert?: string; fix?: Fix } {
  const { row, lemma, verb, noun } = hit.value;
  if (lemma === undefined) return {};
  const token = tokenAt(tokens(), hit.start);
  const form = resolveForm(hit.value, before(text, hit.start), token);
  if (form === undefined) return {};
  const insert = inflectLike(hit.matched, lemma, form);
  const previous = wordBefore(text, hit.start) ?? "";
  const verbal = token?.pos === "VERB" || token?.pos === "AUX";
  const nounSlot = DETERMINERS.has(previous) || (DEMONSTRATIVES.has(previous) && !verbal);
  const verbForm = verb && form !== "plural";
  const participle = form === "gerund" || form === "past" || form === "participle";
  // The tagger misreads a "to"-only verb both ways, so its context decides instead (verbBeforeTo).
  const toOnly = BEFORE_TO_ONLY.has(row.find);
  const keep = KEEP_NEAR[row.find];
  const safe =
    (row.tier === "autofix" || (row.tier === "pos" && row.pos !== undefined && (toOnly || token?.pos === TAGS[row.pos]))) &&
    // "attempts to parse" is the verb, but "prior attempts are recorded" is the noun.
    !(toOnly && !verbBeforeTo(text, tokens(), hit, form)) &&
    // A verb after a determiner is a noun ("an endeavor") or an adjective ("the modified file").
    // An -s form needs no check: the tagger already chose between verb and plural.
    !(verbForm && form !== "present" && nounSlot) &&
    // A gerund before "of" is a noun: "the beginning of the page".
    !(form === "gerund" && /^\s+of\b/i.test(text.slice(hit.end))) &&
    // A noun or a participle right before a noun can be part of a fixed term ("info string") or
    // a modifier ("refuses remaining references"). A verb before its object is fine.
    !(((noun && !verbForm) || participle) && modifiesNext(text, tokens(), hit.end)) &&
    // The base form of a part-of-speech row is also a noun, and right before a noun it can modify
    // it: "add it to purchase costs", "grant execute permission". It is a verb only in a verb's
    // slot (baseVerbSlot): "users purchase licenses".
    !(row.tier === "pos" && verbForm && form === "infinitive" && nounNext(text, tokens(), hit.end) && !baseVerbSlot(tokens(), hit.start)) &&
    // A past form needs a passive auxiliary or a subject before it. Otherwise it can be a label
    // in a list ("added, modified, or removed").
    !((form === "past" || form === "participle") && !PASSIVE.test(before(text, hit.start)) && !subjectBefore(tokens(), hit.start)) &&
    // Verbs differ in whether they take "to" and a verb: "cease to exist" cannot become "stop to
    // exist". A "to"-only verb's swap takes "to" the same way: "attempts to" becomes "tries to".
    !(verbForm && !toOnly && infinitiveFollows(tokens(), hit.end)) &&
    // "a sufficient number of" cannot become "a enough".
    !((previous === "a" || previous === "an") && startsWithVowel(hit.matched) !== startsWithVowel(insert)) &&
    // One verb that becomes a verb phrase needs a clause after it: "ensure coverage" cannot
    // become "make sure coverage", but "ensure the tests pass" can become "make sure the tests pass".
    !(verbForm && !hit.matched.includes(" ") && insert.includes(" ") && !clauseFollows(text, hit.end)) &&
    // Some verbs change meaning before any "to": "happened to be" means "by chance", and "what
    // happens to the cache" is not "what occurs to the cache".
    !(TO_IDIOMS.has(row.find) && /^\s+to(?![\p{L}\p{N}])/iu.test(text.slice(hit.end))) &&
    // Some words keep a sense the swap loses next to certain words: "initiate the connection".
    !(keep && keptNear(text, hit, keep)) &&
    // A swap must not repeat a word in its sentence: "every run executes" cannot become "every run runs".
    !repeatsNeighbor(tokens(), hit, lemma) &&
    // A word the page uses in a heading or a capitalized name is a term there.
    !page().terms.has(row) &&
    // On a page that names a run or a runner, "runs" would read as that thing.
    !(lemma === "run" && page().namesRun);
  return { insert, fix: safe ? { from: hit.start, to: hit.end, insert } : undefined };
}

/** Verbs that are never swapped before "to": "happen to", "remains to be", "begin to". */
const TO_IDIOMS = new Set(["happen", "remain", "begin"]);

/**
 * Verbs swapped only before "to" and a verb, whose swap takes "to" the same way: "attempts to
 * parse" becomes "tries to parse". The noun is as common, and the tagger reads "prior attempts"
 * as a verb, so every other use stays: "prior attempts are recorded", "the same epoch and attempt".
 */
const BEFORE_TO_ONLY = new Set(["attempt"]);

/**
 * True when a "to"-only verb (BEFORE_TO_ONLY) is surely the verb: "to" and a verb come next, no
 * determiner comes before it, and the word before fits its form.
 * - A gerund or a past form needs nothing more: "before attempting to reconnect". A past form
 *   still needs a subject or a passive auxiliary, as every past swap does.
 * - The base form needs a verb's slot (baseVerbSlot), "to", or the start of an instruction:
 *   "do not attempt to", "Attempt to reconnect twice."
 * - The -s form needs a subject, and no verb of its own later in the clause: in "retry attempts
 *   to reach the host are capped", "attempts" is the subject of "are".
 * After an adjective, the word is the noun: "prior attempts to connect".
 */
function verbBeforeTo(text: string, tokens: readonly Token[], hit: WordHit<Variant>, form: WordForm): boolean {
  const next = tokens.findIndex((t) => t.start >= hit.end);
  const to = tokens[next];
  const verb = tokens[next + 1];
  // wink can tag this "to" ADP and its verb NOUN ("to reconnect"), so any plain word counts.
  if (to?.text.toLowerCase() !== "to" || !verb || verb.code || !/^\p{Ll}+$/u.test(verb.text)) return false;
  const previous = wordBefore(text, hit.start) ?? "";
  if ([verb.text, previous].some((word) => DETERMINERS.has(word) || DEMONSTRATIVES.has(word))) return false;
  if (form === "gerund" || form === "past" || form === "participle") return true;
  if (form === "infinitive") return isSentenceStart(text, hit.start) || previous === "to" || baseVerbSlot(tokens, hit.start);
  const subject = slotToken(tokens, hit.start);
  if (!subject || !["NOUN", "PRON", "PROPN"].includes(subject.pos)) return false;
  return !hasFiniteVerb(text.slice(verb.end).split(/[.,;:!?]/)[0] ?? "", { allowLast: true });
}

/** The token before `at`, past any -ly adverb: the subject or the auxiliary of a verb at `at`. */
function slotToken(tokens: readonly Token[], at: number): Token | undefined {
  return tokens.filter((t) => t.end <= at && !(t.pos === "ADV" && /ly$/i.test(t.text))).at(-1);
}

/** Subjects a base-form verb can follow: plural pronouns, and relatives ("jobs that execute"). */
const BASE_SUBJECTS = new Set(["i", "you", "we", "they", "who", "that", "which"]);

/**
 * True when a base form at `at` sits where a verb goes: after an auxiliary or a modal ("can
 * purchase"), "not" ("do not attempt"), a plural subject ("users purchase", "they purchase"), or a
 * relative pronoun ("jobs that execute"). After anything else, such as "to" or a singular noun,
 * the word can be a noun: "add it to purchase costs", "the team purchase order".
 */
function baseVerbSlot(tokens: readonly Token[], at: number): boolean {
  const before = slotToken(tokens, at);
  if (!before || before.code) return false;
  const word = before.text.toLowerCase();
  if (before.pos === "AUX" || AUXILIARIES.has(word) || before.lemma === "not") return true;
  if (before.pos === "PRON") return BASE_SUBJECTS.has(word);
  // wink gives a plural noun its singular lemma, but tags a capitalized plural ("Workers") as a
  // name with no lemma, so an -s ending decides there ("status" and "analysis" are singular).
  if (before.pos === "NOUN") return before.lemma !== word;
  return before.pos === "PROPN" && /[^siu]s$/.test(word);
}

/** True when a noun follows with only a space between: the word before it can modify it. */
function nounNext(text: string, tokens: readonly Token[], end: number): boolean {
  const next = tokens.find((t) => t.start >= end);
  return !!next && !next.code && /^\s+$/.test(text.slice(end, next.start)) && (next.pos === "NOUN" || next.pos === "PROPN");
}

/**
 * Words that keep a row's word next to them, because the swap loses a sense there. "Initiate"
 * names which side opens a link, so "cannot initiate access" and "who initiates the connection"
 * keep it, and "initiate the build" becomes "start the build".
 */
const KEEP_NEAR: Readonly<Record<string, RegExp>> = {
  initiate: /^(?:connections?|sessions?|handshakes?|access|requests?|transfers?|contacts?)$/i,
};

/** Words that end the phrase around a verb: "initiate setup and show connection health". */
const PHRASE_ENDS: ReadonlySet<string> = new Set([...PREPOSITIONS, "and", "or", "but", "nor", "then", "so"]);

/**
 * True when a keeping word sits in the verb's own phrase: up to 4 words after the match ("initiate
 * a new TLS session") or 3 words before it ("connections are initiated by the client"). The phrase
 * ends at punctuation, a conjunction, or a preposition.
 */
function keptNear(text: string, hit: WordHit<Variant>, keep: RegExp): boolean {
  const wordsOf = (clause = "") => clause.match(/[\p{L}\p{N}'’-]+/gu) ?? [];
  // The words nearest the verb first, up to the first word that ends its phrase.
  const phrase = (words: string[]) => {
    const end = words.findIndex((word) => PHRASE_ENDS.has(word.toLowerCase()));
    return end === -1 ? words : words.slice(0, end);
  };
  const after = phrase(wordsOf(text.slice(hit.end).split(/[.,;:!?]/)[0])).slice(0, 4);
  const before = phrase(wordsOf(text.slice(0, hit.start).split(/[.,;:!?]/).at(-1)).reverse()).slice(0, 3);
  return [...before, ...after].some((word) => keep.test(word));
}

/** Words that can repeat in one sentence without a stutter. */
const FUNCTION_WORDS = new Set("a an the to of in on at by for from with as that this is are be you it its and or not so".split(" "));

/**
 * True when the swap would put a word in a sentence that already holds another form of it. Each
 * content word of the swap, in every form ("run", "runs", "ran", "running"), is compared with every
 * word of the sentence on both sides: "retains ... while keeping" cannot become "keeps ... while
 * keeping", however far apart the two words are.
 */
function repeatsNeighbor(tokens: readonly Token[], hit: WordHit<Variant>, lemma: string): boolean {
  const forms = new Set<string>();
  for (const word of lemma.toLowerCase().split(" ")) {
    if (FUNCTION_WORDS.has(word) || word.length < 3) continue;
    forms.add(word).add(pluralOf(word));
    for (const form of verbInflections(word).keys()) forms.add(form);
  }
  if (!forms.size) return false;
  const near = (side: readonly Token[]) => {
    const words: string[] = [];
    for (const token of side) {
      if (/^[.!?]$/.test(token.text)) break;
      if (token.code || !/\p{L}/u.test(token.text)) continue;
      words.push(token.text.toLowerCase(), token.lemma);
    }
    return words;
  };
  const left = near(tokens.filter((t) => t.end <= hit.start).reverse());
  const right = near(tokens.filter((t) => t.start >= hit.end));
  return [...left, ...right].some((word) => forms.has(word));
}

/** The 40 characters before `at`: enough for an auxiliary and an adverb. */
function before(text: string, at: number): string {
  return text.slice(Math.max(0, at - 40), at);
}

/**
 * True when "to" and a verb come next: "chooses to explore", "happened to be". wink tags that "to"
 * PART, and it tags "be" and "have" AUX, not VERB.
 */
function infinitiveFollows(tokens: readonly Token[], end: number): boolean {
  const next = tokens.findIndex((t) => t.start >= end);
  const to = tokens[next];
  if (!to || to.text.toLowerCase() !== "to") return false;
  const verb = tokens[next + 1];
  return to.pos === "PART" || verb?.pos === "VERB" || verb?.pos === "AUX";
}

/** True when a noun or pronoun, not a code span, comes right before `at`: a subject. */
function subjectBefore(tokens: readonly Token[], at: number): boolean {
  const previous = tokens.filter((t) => t.end <= at).at(-1);
  return !!previous && !previous.code && ["NOUN", "PRON", "PROPN"].includes(previous.pos);
}

/** True when a noun or an adjective follows with only a space between, so the word can modify it. */
function modifiesNext(text: string, tokens: readonly Token[], end: number): boolean {
  const next = tokens.find((t) => t.start >= end);
  return (
    !!next && !next.code && /^\s+$/.test(text.slice(end, next.start)) && ["NOUN", "ADJ", "PROPN"].includes(next.pos)
  );
}

/**
 * True when a clause follows `end`: "that ...", or a subject and its finite verb before the next
 * punctuation mark. A verb later in the sentence does not count: in "ensures stable block ids
 * and keeps undo exact", "keeps" has no subject of its own.
 */
function clauseFollows(text: string, end: number): boolean {
  const rest = text.slice(end);
  if (/^\s+that\b/i.test(rest)) return true;
  return hasFiniteVerb(rest.split(/[.,;:!?]/)[0] ?? "", { allowLast: true });
}

/**
 * The form of the match, or undefined when the context cannot decide. "begins" can be a verb or a
 * plural noun, so the tagger decides when the two swaps differ. "executed" can be a past tense
 * ("ran") or a participle ("run"), so only a passive auxiliary before it decides.
 */
function resolveForm(variant: Variant, preceding: string, token: Token | undefined): WordForm | undefined {
  const { forms, lemma = "" } = variant;
  const choose = (a: WordForm, b: WordForm, pickB: boolean | undefined) =>
    inflect(lemma, a) === inflect(lemma, b) ? a : pickB === undefined ? undefined : pickB ? b : a;
  if (forms.includes("present") && forms.includes("plural")) {
    const pos = token?.pos;
    return choose("present", "plural", pos === "VERB" || pos === "AUX" ? false : pos === "NOUN" || pos === "PROPN" ? true : undefined);
  }
  if (forms.includes("past") && forms.includes("participle")) return choose("past", "participle", PASSIVE.test(preceding) || undefined);
  return forms[0];
}

function startsWithVowel(word: string): boolean {
  return /^[aeiou]/i.test(word);
}

/**
 * The edit that deletes a filler word with the space and punctuation around it. isUse already
 * dropped the uses where the word carries meaning.
 */
function deletionFix(text: string, hit: WordHit<Variant>): Fix | undefined {
  const { start, end } = hit;
  if (hit.value.row.tier !== "autofix") return undefined;
  const prefix = text.slice(0, start);
  const after = text.slice(end);
  if (isSentenceStart(text, start)) {
    // Keep a filler that is the whole sentence, such as "Please.": deleting it leaves no sentence.
    if (!/[\p{L}\p{N}\u0000]/u.test(after.split(/[.!?]/)[0] ?? "")) return undefined;
    return { from: start, to: end + /^[,:]?\s*/.exec(after)![0].length, insert: "" };
  }
  const comma = /,\s*$/.exec(prefix)?.[0];
  if (comma && after.startsWith(",")) return { from: start - comma.length, to: end + 1, insert: "" };
  if (comma && /^\s*[.!?]/.test(after)) return { from: start - comma.length, to: end, insert: "" };
  if (after.startsWith(" ")) return { from: start, to: end + 1, insert: "" };
  if (prefix.endsWith(" ")) return { from: start - 1, to: end, insert: "" };
  return { from: start, to: end, insert: "" };
}

// ---------------------------------------------------------------------------------------------
// Messages and the rule
// ---------------------------------------------------------------------------------------------

function orList(items: readonly string[]): string {
  return items.length < 3 ? items.join(" or ") : `${items.slice(0, -1).join(", ")}, or ${items.at(-1)}`;
}

/** An instruction option, such as "(delete)", as a phrase: "delete it". */
function instruction(text: string): string {
  const inner = text.replace(/^\(|\)$/g, "").trim();
  return inner === "delete" ? "delete it" : inner === "rewrite" ? "rewrite the sentence" : inner;
}

/** The finding message: what to write instead, plus the row's note for a suggestion. */
function denyMessage(hit: DenyHit): string {
  const { row, matched } = hit;
  const replace = readReplace(row.replace);
  const note = row.tier === "flag" && row.note ? ` ${row.note}` : "";
  const when = row.pos ? ` when it is ${row.pos === "adjective" || row.pos === "adverb" ? "an" : "a"} ${row.pos}` : "";
  switch (replace.kind) {
    case "delete":
      return row.tier === "flag" ? `Avoid "${matched}".${note}` : `Delete "${matched}".`;
    case "instruction": {
      const text = instruction(replace.text);
      return `Avoid "${matched}". ${text.charAt(0).toUpperCase()}${text.slice(1)}.${note}`;
    }
    case "options": {
      // "(delete) | only" mixes words to write with instructions: 'Write "only" ..., or delete it.'
      const words = replace.options.filter((o) => !o.startsWith("(")).map((o) => `"${o}"`);
      const steps = replace.options.filter((o) => o.startsWith("(")).map(instruction);
      if (!words.length) return `Avoid "${matched}". ${orList(steps).replace(/^./, (c) => c.toUpperCase())}.${note}`;
      return `Write ${orList(words)} instead of "${matched}"${when}${steps.length ? `, or ${orList(steps)}` : ""}.${note}`;
    }
    case "swap":
      return hit.swap
        ? `Write "${hit.swap}" instead of "${matched}"${when}.${note}`
        : `Write a form of "${replace.text}" instead of "${matched}"${when}.${note}`;
  }
}

/** Block types whose `text` StyleRule.autofix receives. */
const FIXABLE = new Set(["paragraph", "list-item", "callout", "heading"]);

/** The plain-span ranges a fix in this field may use. Empty when autofix never sees the field. */
function fixableRanges(block: DocBlock | undefined, field: string, text: string): [number, number][] {
  if (field !== "text" || !block?.text || !FIXABLE.has(block.type) || spanProse(block.text) !== text) return [];
  return plainRanges(block.text);
}

export interface DenyListRuleSpec {
  id: string;
  docsPath: string;
  summary: string;
  hint: string;
  rows: readonly Replacement[];
}

/**
 * A vocabulary rule over deny-list rows: detect reports every use, and autofix applies the safe
 * swaps and deletions. A rule whose rows are all suggestions has no autofix. Detect and autofix
 * read the same page facts, so a match is autofixable exactly when autofix applies it. Autofix
 * called without its page reads only the block.
 */
export function denyListRule(spec: DenyListRuleSpec): StyleRule {
  let compiled: WordIndex<Variant> | undefined;
  const index = () => (compiled ??= compileRows(spec.rows));
  // Each page's facts, read on first use. Pages are never edited in place: a fix makes a new page.
  const cache = new WeakMap<DocDocument, PageFacts>();
  const factsFor = (page: DocDocument) => () => {
    let facts = cache.get(page);
    if (!facts) cache.set(page, (facts = factsOf(pageFields(page), index())));
    return facts;
  };
  const rule: StyleRule = {
    id: spec.id,
    layer: "vocabulary",
    docsPath: spec.docsPath,
    summary: spec.summary,
    hint: spec.hint,
    detect(context) {
      const mentions = mentionTables(context);
      const page = factsFor(context.document);
      const matches: StyleMatch[] = [];
      for (const field of authoredProse(context)) {
        if (field.blockId && mentions.has(field.blockId)) continue;
        const hits = denyHits(field.text, index(), page);
        if (!hits.length) continue;
        const located = sentenceSpans(field.text);
        const block = field.blockId ? context.document.blocks[field.blockId] : undefined;
        const ranges = fixableRanges(block, field.field, field.text);
        for (const hit of hits)
          matches.push({
            blockId: field.blockId,
            field: field.field,
            message: denyMessage(hit),
            evidence: hit.matched,
            sentence: sentenceAt(located, hit.start),
            autofixable: hit.fix !== undefined && ranges.some(([a, b]) => hit.fix!.from >= a && hit.fix!.to <= b),
          });
      }
      return matches;
    },
  };
  if (spec.rows.some(canFix))
    rule.autofix = (text, block, page) => {
      // Without its page, the block is read alone, as a page of one block.
      let alone: PageFacts | undefined;
      const field = () => [{ text: proseText(text), titleCase: block.type === "heading" }];
      return autofixSpans(text, index(), page ? factsFor(page) : () => (alone ??= factsOf(field(), index())));
    };
  return rule;
}

/** Apply every safe fix inside one plain span. Detect reports exactly these fixes as autofixable. */
function autofixSpans(text: DeltaSpan[], index: WordIndex<Variant>, page: () => PageFacts): DeltaSpan[] | undefined {
  const prose = spanProse(text);
  // A literal backtick pair in plain text shifts proseText offsets, so detect calls no fix safe there.
  if (prose !== proseText(text)) return undefined;
  // Merged deletions share one Fix object, so the set holds each edit once.
  const fixes = [...new Set(denyHits(prose, index, page).flatMap((hit) => (hit.fix ? [hit.fix] : [])))];
  if (!fixes.length) return undefined;
  return editPlainSpans(text, (span, at) => {
    let out = span;
    const inside = fixes.filter((f) => f.from >= at.start && f.to <= at.start + span.length);
    for (const fix of inside.reverse()) out = out.slice(0, fix.from - at.start) + fix.insert + out.slice(fix.to - at.start);
    return out;
  });
}
