/**
 * Fact ledger: the facts code can find in the original block. A rewrite may reword a sentence,
 * but every fact must still appear in some block of the rewrite. This catches the losses a
 * model makes most often: a dropped number or unit, a lost code span or link, a renamed thing.
 * The ledger also runs the other way for literals: a code span, reference, link, number, path,
 * or quote that the rewrite holds and the original does not is a claim the author never made.
 */
import type { DeltaSpan } from "@codecaine-ai/docs-model";
import { technicalNouns } from "../profile";
import { proseText, referenceTarget, sentences } from "../text";
import type { GuardrailResult } from "../types";
import { afterProse, excerpt, wordPattern, type RewriteText } from "./prose";

export type FactKind = "code" | "reference" | "link" | "number" | "path" | "term" | "name" | "quote";

/** One fact the rewrite must keep. */
export interface Fact {
  kind: FactKind;
  /** The fact as written in the original block. */
  text: string;
}

// ---------------------------------------------------------------------------------------------
// Span facts: read from the span marks, because proseText hides code and reference text.
// ---------------------------------------------------------------------------------------------

/** Code text, reference targets, and link targets. Adjacent code spans read as one code span. */
function spanFacts(spans: readonly DeltaSpan[]): Fact[] {
  const facts: Fact[] = [];
  let code = "";
  const endCode = () => {
    if (code) facts.push({ kind: "code", text: code });
    code = "";
  };
  for (const span of spans) {
    const attributes = span.attributes;
    if (attributes?.code) code += span.insert;
    else endCode();
    if (attributes?.reference) facts.push({ kind: "reference", text: referenceTarget(attributes.reference) });
    if (attributes?.link) facts.push({ kind: "link", text: attributes.link });
  }
  endCode();
  return facts;
}

// ---------------------------------------------------------------------------------------------
// Prose facts: read from proseText, so nothing inside a code span counts twice.
// ---------------------------------------------------------------------------------------------

const UNIT = String.raw`(?:%|ms|s|sec|min|h|hr|KB|MB|GB|TB|kB|KiB|MiB|GiB|px|em|rem|pt|ch|fps|Hz|kHz|kg|g|mg|m|cm|mm|km|°C|°F|x)`;
/**
 * A number with any unit right after it, such as "20 ms", "1,200", "v0.0.2", or "10%". A digit
 * glued to a letter, as in "H1" or "STE100", belongs to a name, not a number.
 */
const NUMBER = new RegExp(String.raw`(?<![\p{L}\p{N}_.,])v?\d+(?:[.,]\d+)*(?:\s?${UNIT})?(?![\p{L}\p{N}_])`, "gu");
/** "20 ms" and "20ms" are the same number, and so are "v0.0.2" and "0.0.2". */
const numberKey = (text: string) => text.replace(/\s+/g, "").replace(/^v/, "");

/** A run of path characters that holds a "/", such as "src/rules/<name>/" or "yes/no". */
const PATH = /[^\s\u0000"'“”‘’()[\]{},;]*\/[^\s\u0000"'“”‘’()[\]{},;]*/g;
const FILE_EXTENSION = "ts|tsx|js|jsx|mjs|cjs|json|jsonc|md|mdx|yaml|yml|toml|txt|csv|html|css|scss|sh|py|rs|go|baml|sql|svg|png|jpe?g|gif|webp|mp4|pdf|lock|db|xml|wasm|zip|log";
/** A file name with a known extension, such as "doc.json" or "README.md". */
const FILE = new RegExp(String.raw`(?<![\p{L}\p{N}_./-])[\p{L}\p{N}_][\p{L}\p{N}_.-]*\.(?:${FILE_EXTENSION})(?![\p{L}\p{N}_-])`, "giu");

/** Paths and file names. Sentence punctuation after a path is not part of it. */
function pathsIn(prose: string): string[] {
  const paths = [...prose.matchAll(PATH)]
    .map((match) => match[0].replace(/[.:!?]+$/, ""))
    .filter((path) => /[\p{L}\p{N}]/u.test(path));
  return [...paths, ...[...prose.matchAll(FILE)].map((match) => match[0])];
}

/** Each glossary term's pattern. A term also matches its plural: "change set" and "change sets". */
const TERMS = new Map(technicalNouns.map(({ term }) => [term, wordPattern(term, "iu", "(?:s|es)?")]));

/**
 * A word, with any underscore or apostrophe inside it ("CLAUDE_PROJECT_DIR", "Jev's"). The same
 * word characters bound a name when the rewrite is searched for it.
 */
const WORD = /[\p{L}\p{N}_]+(?:['’][\p{L}\p{N}_]+)*/gu;
const isAcronym = (word: string) => (word.match(/\p{Lu}/gu)?.length ?? 0) >= 2 && !/\p{Ll}/u.test(word);
const isCamelCase = (word: string) => /\p{Ll}\p{Lu}/u.test(word);

/**
 * A label-colon opener of up to three words, such as "Why:" or "Applies to:", as the
 * structure.label-colon-opener rule defines it. The sentence after the label starts fresh.
 */
const LABEL = /^((?:[^\s:]+\s+){0,2}[^\s:]+):\s+/u;

/**
 * Names: ALL-CAPS acronyms and CamelCase identifiers anywhere, and capitalized words that do not
 * start a sentence, a line, or the text after a label colon. Those first words are capitalized by
 * grammar, not because they name something, so a rewrite may lowercase them. A unit after a
 * number, such as "MiB", is part of the number fact, not a name.
 */
function namesIn(prose: string): string[] {
  const names: string[] = [];
  for (const line of prose.split(/\n+/))
    for (const sentence of sentences(line)) {
      const label = LABEL.exec(sentence);
      const parts = label ? [label[1]!, sentence.slice(label[0].length)] : [sentence];
      for (const part of parts) {
        let index = 0;
        for (const match of part.replace(NUMBER, "0").matchAll(WORD)) {
          const word = match[0].replace(/['’]s$/u, "");
          const first = index++ === 0;
          if (isAcronym(word) || isCamelCase(word) || (!first && /^\p{Lu}/u.test(word) && word !== "I")) names.push(word);
        }
      }
    }
  return names;
}

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();
/** Text inside straight or curly double quotes. Single quotes are skipped: they double as apostrophes. */
const QUOTE = /"([^"\n]+)"|“([^”\n]+)”/g;
const quotesIn = (prose: string) =>
  [...prose.matchAll(QUOTE)].map((match) => collapse(match[1] ?? match[2] ?? "")).filter((quote) => /[\p{L}\p{N}]/u.test(quote));

// ---------------------------------------------------------------------------------------------
// The ledger and the check
// ---------------------------------------------------------------------------------------------

/** Two facts are the same fact when their kind and text match. "20 ms" and "20ms" are one number. */
const factKey = (fact: Fact) => `${fact.kind}\u0000${fact.kind === "number" ? numberKey(fact.text) : fact.text}`;

/** Each fact once, at its first place. */
function unique(facts: readonly Fact[]): Fact[] {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = factKey(fact);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Every fact code can find in one block's text, each listed once: code spans, reference targets,
 * link targets, numbers with units, paths and file names, glossary terms, names, and quotes.
 */
export function factLedger(spans: readonly DeltaSpan[]): Fact[] {
  const prose = proseText(spans);
  const facts: Fact[] = [
    ...spanFacts(spans),
    ...(prose.match(NUMBER) ?? []).map((text): Fact => ({ kind: "number", text })),
    ...pathsIn(prose).map((text): Fact => ({ kind: "path", text })),
    ...[...TERMS].filter(([, pattern]) => pattern.test(prose)).map(([term]): Fact => ({ kind: "term", text: term })),
    ...namesIn(prose).map((text): Fact => ({ kind: "name", text })),
    ...quotesIn(prose).map((text): Fact => ({ kind: "quote", text })),
  ];
  return unique(facts);
}

/** A test that says whether some block of the rewrite keeps a fact. */
function keptBy(input: RewriteText): (fact: Fact) => boolean {
  const texts = afterProse(input);
  const spans = new Set(input.afterBlocks.flatMap(spanFacts).map((fact) => `${fact.kind}\u0000${fact.text}`));
  const numbers = new Set(texts.flatMap((text) => text.match(NUMBER) ?? []).map(numberKey));
  const paths = new Set(texts.flatMap(pathsIn));
  const flat = texts.map(collapse);
  return (fact) => {
    switch (fact.kind) {
      case "code":
      case "reference":
      case "link":
        return spans.has(`${fact.kind}\u0000${fact.text}`);
      case "number":
        return numbers.has(numberKey(fact.text));
      case "path":
        return paths.has(fact.text);
      case "term":
        return texts.some((text) => TERMS.get(fact.text)?.test(text));
      case "name": {
        // Case matters: "Global" names a theme, "global" does not.
        const pattern = wordPattern(fact.text, "u");
        return texts.some((text) => pattern.test(text));
      }
      case "quote":
        return flat.some((text) => text.includes(fact.text));
    }
  };
}

/**
 * Kinds a rewrite must not add. Names and glossary terms are left out: a rewrite may name the actor
 * of a passive, or use the canonical name the profile asks for.
 */
const NO_ADDITIONS: ReadonlySet<FactKind> = new Set(["code", "reference", "link", "number", "path", "quote"]);

/** The first three facts, and a count of the rest. */
const named = (facts: readonly Fact[]) =>
  facts.slice(0, 3).map((fact) => `${fact.kind} "${excerpt(fact.text, 60)}"`).join(", ") + (facts.length > 3 ? `, and ${facts.length - 3} more` : "");

/**
 * "fact-ledger": every fact in the original block appears somewhere in the rewrite, and the
 * rewrite adds no literal, link, number, or quote. The restored tokens are the original spans, so
 * they are never additions.
 */
export function checkFactLedger(input: RewriteText): GuardrailResult {
  const ledger = factLedger(input.beforeSpans);
  const kept = keptBy(input);
  const missing = ledger.filter((fact) => !kept(fact));
  const known = new Set(ledger.map(factKey));
  const added = unique(input.afterBlocks.flatMap((spans) => factLedger(spans)).filter((fact) => NO_ADDITIONS.has(fact.kind) && !known.has(factKey(fact))));
  if (!missing.length && !added.length)
    return { id: "fact-ledger", ok: true, detail: ledger.length ? `kept all ${ledger.length} fact${ledger.length === 1 ? "" : "s"}` : "no facts to track" };
  const problems = [missing.length ? `missing ${named(missing)}` : "", added.length ? `added: ${named(added)}` : ""];
  return { id: "fact-ledger", ok: false, detail: problems.filter(Boolean).join(" | ") };
}
