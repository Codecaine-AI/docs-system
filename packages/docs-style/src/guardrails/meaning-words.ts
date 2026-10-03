/**
 * Meaning words: the small words that carry logic. One of them dropped, added, or swapped changes
 * what a sentence claims while the sentence still reads well: "only" sets a limit, "not" inverts,
 * "should" is advice and "must" a rule, "because" states why, and "including" makes a list partial.
 * Each category has its own rule, because a rewrite may repeat some words when it splits a
 * sentence and must never add others.
 */
import { meaningWords } from "../profile";
import type { GuardrailResult } from "../types";
import { afterProse, beforeProse, type RewriteText } from "./prose";

/**
 * - exact: the count must not change. An added or lost negation inverts a claim.
 * - no-new: no decrease, and no word that was absent before. A split may repeat an "only" or a
 *   "must", but a new kind of limit or obligation is a new claim.
 * - no-decrease: no decrease. A split may repeat a "because" for each bullet it applies to.
 */
export type MeaningRule = "exact" | "no-new" | "no-decrease";

export interface MeaningCategory {
  name: string;
  rule: MeaningRule;
  words: readonly string[];
  /** Words in a no-decrease category that may not increase either. */
  noIncrease?: readonly string[];
}

export const MEANING_CATEGORIES: readonly MeaningCategory[] = [
  // "cannot" and every "n't" count as "not" (see expand).
  { name: "negation", rule: "exact", words: ["not", "never", "no", "none", "nothing", "nobody", "neither", "nor", "without"] },
  {
    name: "limiter",
    rule: "no-new",
    words: [
      "only", "exactly", "at least", "at most", "all", "every", "each", "any", "some", "most", "many", "few", "both", "either",
      "except", "unless", "if", "when", "until", "before", "after", "once",
    ],
  },
  // "can't" counts as "can" plus "not", and "won't" as "will" plus "not".
  { name: "modal", rule: "no-new", words: ["must", "can", "could", "should", "may", "might", "will", "would", "shall"] },
  {
    name: "connector",
    rule: "no-decrease",
    words: [
      "because", "since", "so", "therefore", "thus", "hence", "while", "whereas", "although", "though", "but", "however", "yet",
      "instead", "rather", "otherwise", "including", "such as", "for example",
    ],
    // Each one turns what follows into a partial list or a sample, never the whole.
    noIncrease: ["including", "such as", "for example"],
  },
];

/** Profile meaning words that no category names keep the strictest rule a split allows. */
const CATEGORIES: readonly MeaningCategory[] = (() => {
  const named = new Set([...MEANING_CATEGORIES.flatMap((category) => category.words), "cannot"]);
  const rest = meaningWords.map((word) => word.trim().toLowerCase()).filter((word) => !named.has(word));
  return rest.length ? [...MEANING_CATEGORIES, { name: "limiter", rule: "no-new" as const, words: rest }] : MEANING_CATEGORIES;
})();

const WORD_CHAR = String.raw`[\p{L}\p{N}_]`;
/** The modal inside a contraction whose stem is not the modal itself: "can't", "won't", "shan't". */
const CONTRACTED_STEM: Readonly<Record<string, string>> = { ca: "can", wo: "will", sha: "shall", ai: "am" };

/**
 * Lowercase text with every word family written one way, so a count sees one word:
 * - "cannot" and "can't" become "can not", and any other "n't" becomes " not".
 * - "e.g." and "for instance" become "for example".
 * - "include", "includes", and "included" become "including".
 */
function expand(text: string): string {
  return text
    .toLowerCase()
    .replace(new RegExp(String.raw`(?<!${WORD_CHAR})cannot(?!${WORD_CHAR})`, "gu"), "can not")
    .replace(new RegExp(String.raw`(?<!${WORD_CHAR})(\p{L}+?)n['’]t(?!${WORD_CHAR})`, "gu"), (_, stem: string) => `${CONTRACTED_STEM[stem] ?? stem} not`)
    .replace(new RegExp(String.raw`(?<!${WORD_CHAR})(?:e\.\s?g\.?|for\s+instance)(?!${WORD_CHAR})`, "gu"), "for example")
    .replace(new RegExp(String.raw`(?<!${WORD_CHAR})includ(?:e|es|ed)(?!${WORD_CHAR})`, "gu"), "including");
}

const TERMS = [...new Set(CATEGORIES.flatMap((category) => category.words))];
/** One pattern for every term, longest first, so "at most" is counted once and not again as "most". */
const ANY_TERM = new RegExp(
  String.raw`(?<!${WORD_CHAR})(?:${[...TERMS]
    .sort((a, b) => b.length - a.length)
    .map((term) => term.split(" ").map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(String.raw`\s+`))
    .join("|")})(?!${WORD_CHAR})`,
  "gu",
);

/** The count of each meaning word across texts, case-insensitive, on word boundaries. */
function countTerms(texts: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const text of texts)
    for (const match of expand(text).matchAll(ANY_TERM)) {
      const term = match[0].replace(/\s+/g, " ");
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  return counts;
}

/** True when `after` breaks the category's rule for one word. */
function breaks(category: MeaningCategory, word: string, before: number, after: number): boolean {
  if (category.rule === "exact") return after !== before;
  if (after < before) return true;
  if (category.rule === "no-new") return before === 0 && after > 0;
  return after > before && !!category.noIncrease?.includes(word);
}

/** "meaning-words": every meaning word keeps the count its category allows. The detail names each word that broke its rule. */
export function checkMeaningWords(input: RewriteText): GuardrailResult {
  const before = countTerms([beforeProse(input)]);
  const after = countTerms(afterProse(input));
  const problems = CATEGORIES.flatMap((category) =>
    category.words.flatMap((word) => {
      const [was, now] = [before.get(word) ?? 0, after.get(word) ?? 0];
      return breaks(category, word, was, now) ? [`${category.name} "${word}" ${was} -> ${now}`] : [];
    }),
  );
  if (problems.length) return { id: "meaning-words", ok: false, detail: problems.join(", ") };
  const kept = [...before].filter(([, count]) => count > 0).map(([word, count]) => `${word} ${count}`);
  return { id: "meaning-words", ok: true, detail: kept.length ? `kept ${kept.join(", ")}` : "no meaning words" };
}
