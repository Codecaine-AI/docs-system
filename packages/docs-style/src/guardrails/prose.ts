/**
 * The guardrails' view of one rewrite. Every text check reads prose text (see proseText): each
 * code or reference span is one "\u0000", so a check never matches inside a literal. The rewrite
 * is a list of blocks (a lead, then any bullets), and checks read each block on its own, so a
 * phrase or a sentence never runs across two blocks.
 */
import type { DeltaSpan } from "@codecaine-ai/docs-model";
import { proseText, referenceTarget, sentences, type MeaningBlock } from "../text";
import type { VerifyInput } from "../types";

/** The part of VerifyInput that holds the text: the original block and the blocks it became. */
export type RewriteText = Pick<VerifyInput, "beforeSpans" | "afterBlocks">;

/** The blocks of the rewrite with their depth. Without afterDepths, the lead is 0 and every other block 1. */
export const afterMeaningBlocks = (input: RewriteText & Pick<VerifyInput, "afterDepths">): MeaningBlock[] =>
  input.afterBlocks.map((spans, i) => ({ spans, depth: input.afterDepths?.[i] ?? (i === 0 ? 0 : 1) }));

export const beforeProse = (input: RewriteText): string => proseText(input.beforeSpans);

/** Each block of the rewrite as prose text, lead first. */
export const afterProse = (input: RewriteText): string[] => input.afterBlocks.map((spans) => proseText(spans));

/** A letter, digit, or underscore. Word boundaries in this folder are Unicode-aware. */
const WORD_CHAR = String.raw`[\p{L}\p{N}_]`;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A pattern for a word or phrase on word boundaries, with any run of whitespace between its words.
 * `ending` is extra regex text that may follow the last word, such as an inflection.
 */
export function wordPattern(phrase: string, flags: string, ending = ""): RegExp {
  const body = phrase.trim().split(/\s+/).map(escapeRegExp).join(String.raw`\s+`);
  return new RegExp(String.raw`(?<!${WORD_CHAR})${body}${ending}(?!${WORD_CHAR})`, flags);
}

/**
 * Like wordPattern, but the last word may also be inflected: "robust" matches "robustly" and
 * "robustness", and "leverage" matches "leveraging".
 */
export function inflectedPattern(phrase: string, flags: string): RegExp {
  const words = phrase.trim().split(/\s+/);
  const last = words.pop() ?? "";
  const forms = [`${escapeRegExp(last)}(?:s|es|d|ed|ly|ness|ing)?`];
  // A final "e" drops before "-ing".
  if (last.endsWith("e")) forms.push(`${escapeRegExp(last.slice(0, -1))}ing`);
  const body = [...words.map(escapeRegExp), `(?:${forms.join("|")})`].join(String.raw`\s+`);
  return new RegExp(String.raw`(?<!${WORD_CHAR})${body}(?!${WORD_CHAR})`, flags);
}

/** URLs and HTML entities hold literal semicolons, as in the writing.semicolon lint rule. */
const LITERAL_SEMICOLON = /\bhttps?:\/\/\S+|&(?:[a-z][a-z\d]*|#\d+|#x[\da-f]+);/gi;

/** Semicolons in prose text, not counting those inside a URL or an HTML entity. */
export const semicolonsIn = (text: string): number => text.replace(LITERAL_SEMICOLON, "").split(";").length - 1;

/** How often `pattern` matches across all `texts`. The pattern must carry the "g" flag. */
export function countMatches(texts: readonly string[], pattern: RegExp): number {
  return texts.reduce((sum, text) => sum + (text.match(pattern)?.length ?? 0), 0);
}

/**
 * A short quote for a report line: literal spans show as "…", whitespace collapses, and text
 * past `max` characters is cut with "…".
 */
export function excerpt(text: string, max: number): string {
  const chars = Array.from(text.replaceAll("\u0000", "…").replace(/\s+/g, " ").trim());
  return chars.length <= max ? chars.join("") : `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}

/**
 * Function words that carry no information of their own: articles, forms of "be" and "do", and
 * pronouns that point back. Meaning words such as "not", "only", and "if" are never stop words.
 */
export const STOP_WORDS: ReadonlySet<string> = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being", "am", "by", "of", "that", "which",
  "who", "this", "these", "those", "it", "its", "there", "to", "do", "does", "did",
]);


/** One sentence of a block's text, in the three forms the checks need. */
export interface LiteralSentence {
  /** As sentences(proseText(spans)) gives it, each literal one "\u0000". Findings use this form. */
  bare: string;
  /**
   * Each literal written as "\u0000<kind>:<identity>\u0000": a code span by its text, a reference
   * by its target. Two sentences that differ only in which literal sits where differ here.
   */
  literal: string;
  /** Each literal as a reader sees it, for report lines. */
  display: string;
}

/**
 * The sentences of a block's text with the identity of each literal kept. proseText writes every
 * code span and reference as the same "\u0000", so "Copy `a` over `b`." and "Copy `b` over `a`."
 * read as one sentence there.
 */
export function literalSentences(spans: readonly DeltaSpan[]): LiteralSentence[] {
  type Literal = { identity: string; display: string };
  const queued: Literal[] = [];
  const joined = spans
    .map(({ insert, attributes }) => {
      if (attributes?.reference) queued.push({ identity: `ref:${referenceTarget(attributes.reference)}`, display: insert });
      else if (attributes?.code) queued.push({ identity: `code:${insert}`, display: `\`${insert}\`` });
      else return insert;
      return "\u0001";
    })
    .join("");
  // One left-to-right pass, as proseText makes it: a span, or a backtick run in plain text, which
  // is a literal too and swallows any span inside it.
  const literals: Literal[] = [];
  const bare = joined.replace(/\u0001|(`+)[\s\S]*?\1/g, (match) => {
    if (match === "\u0001") literals.push(queued.shift()!);
    else {
      for (const _ of match.matchAll(/\u0001/g)) queued.shift();
      literals.push({ identity: `text:${match}`, display: match });
    }
    return "\u0000";
  });
  let next = 0;
  return sentences(bare).map((sentence) => {
    let literal = "";
    let display = "";
    for (const char of sentence) {
      const found = char === "\u0000" ? literals[next++] : undefined;
      literal += found ? `\u0000${found.identity}\u0000` : char;
      display += found ? found.display : char;
    }
    return { bare: sentence, literal, display };
  });
}
