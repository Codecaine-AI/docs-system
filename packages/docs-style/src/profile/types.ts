/**
 * The shape of the STE profile data. The data itself lives in the sibling files; rules read it
 * through src/profile/index.ts. This data is the single source of truth for the Vocabulary page
 * (docs/99-appendix/10-style-guide/40-vocabulary) and the STE Profile page (30-ste-profile).
 */

/** The numeric limits of the profile. */
export interface Thresholds {
  /** STE 5.1: words in one instruction. */
  proceduralSentenceWords: number;
  /** STE 6.3: words in one descriptive sentence. */
  descriptiveSentenceWords: number;
  /** STE 6.6, tightened: sentences in one paragraph block. */
  paragraphSentences: number;
  /** STE 2.1: nouns in one cluster. A registered multi-word technical noun counts as one. */
  nounClusterNouns: number;
  /** Guardrail: the most of its words a rewrite may remove, as a fraction (0.2 = 20%). */
  shrinkLimit: number;
  /** Pilot metric: the human rejection rate above which the guardrails must tighten. */
  rewriteRejectLimit: number;
}

/**
 * - autofix: a 1:1 swap that cannot change meaning. A lint applies it with no review.
 * - pos: a swap that is safe only for one part of speech. A lint applies it only when the tagger agrees.
 * - flag: a suggestion. A person or the rewrite model picks the fix.
 */
export type ReplacementTier = "autofix" | "pos" | "flag";

export type PartOfSpeech = "verb" | "noun" | "adjective" | "adverb";

/**
 * Which corpora a deny-list row or a naming group applies to. Without a scope, it applies to
 * every corpus, as the rows from public style guides do.
 * - house: the owner's own spelling and phrasing habits, such as "subagent" to "sub-agent". They
 *   hold in every corpus the owner writes, so they apply everywhere too.
 * - docs-system: docs-system product vocabulary and naming decisions, such as "page" over "doc".
 *   They apply only to the docs-system corpus, because other corpora use these words in other
 *   senses, such as Discord threads and single-thread CPU work.
 */
export type ProfileScope = "house" | "docs-system";

/** One row of the deny list. Words that are not on the deny list are always allowed. */
export interface Replacement {
  /** The word or phrase to find, lowercase, as written in prose. */
  find: string;
  /**
   * What to write instead. "" means delete it (filler). Several options are joined with " | ",
   * and a row with options is never autofixed.
   */
  replace: string;
  tier: ReplacementTier;
  /** For tier "pos": the part of speech the swap applies to. */
  pos?: PartOfSpeech;
  /** For example "wordy phrase", "simple word", "filler", "naming", "Latin abbreviation". */
  category: string;
  note?: string;
  /** Where the row comes from: public style guides, the owner's own habits, or the filler list. */
  origin: "style-guides" | "habit" | "filler";
  /** Which corpora the row applies to. Omitted: every corpus. */
  scope?: ProfileScope;
  /**
   * Corpora that keep the word as their own term, as project names. The row never applies there,
   * so it neither flags nor swaps the word: network-setup uses "purchased" as an equipment status.
   */
  skipCorpora?: readonly string[];
}

/** One concept with one name. The one-name rule flags a page that uses two names from a group. */
export interface NamingGroup {
  concept: string;
  /** The name to use in prose. */
  use: string;
  /** Other names for the same concept, lowercase. */
  avoid: readonly string[];
  note?: string;
  /** Which corpora the group applies to. Omitted: every corpus. */
  scope?: ProfileScope;
}

/** The deny-list rows and naming groups that apply to one corpus (see profileFor). */
export interface CorpusProfile {
  replacements: readonly Replacement[];
  namingCanon: readonly NamingGroup[];
}

/**
 * A page section that no tier may change: its heading plus everything after it, up to the next
 * heading of the same or a higher level. The heading "*" stands for the whole page.
 */
export interface ExemptSection {
  /** The bundle path relative to the docs root, such as "00-foundation/00-manifesto". */
  page: string;
  heading: string;
  reason: string;
  /** The corpus the page is in, as a project name. Omitted: the page at this path in every corpus. */
  corpus?: string;
}

/** A whole corpus that some or all tiers skip. */
export interface CorpusExemption {
  /** The project name, such as "Personal Site Writing". */
  corpus: string;
  /**
   * - all: no tier reads or changes the corpus.
   * - rewrite: Tier 3 skips the corpus. Tier 1 and Tier 2 still run, and autofix still applies.
   */
  tiers: "all" | "rewrite";
  reason: string;
}

/** The exemptions that apply to one corpus (see exemptionsFor). */
export interface CorpusExemptions {
  /** Set when the whole corpus skips some or all tiers. */
  corpus?: CorpusExemption;
  sections: readonly ExemptSection[];
}

/** A technical noun or verb: allowed vocabulary on top of the STE approved words. */
export interface Term {
  /** Lowercase. A multi-word technical noun counts as one noun in the noun-cluster rule. */
  term: string;
  meaning: string;
}

/** A modal verb the profile replaces with "must" or "can". */
export interface ModalRule {
  word: string;
  use: string;
  note?: string;
}
