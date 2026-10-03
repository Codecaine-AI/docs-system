/**
 * The STE profile as data. Rules, guardrails, the rewrite prompt, and reports read the profile
 * only through this file. The data lives in the sibling files:
 * - replacements.ts: the deny list, and the conflicts resolved against its sources
 * - naming.ts: one name per concept
 * - terms.ts: technical nouns and verbs
 * - words.ts: modal verbs, slop words, meaning words, and role markers
 * - exemptions.ts: the sections and corpora that no tier may change
 * - corpus.ts: profileFor and exemptionsFor, the entries that apply to one corpus
 * - ste-dictionary.ts: the local STE dictionary, for information only
 *
 * `replacements`, `namingCanon`, and `exemptSections` hold every entry, for every corpus. A sweep
 * of one corpus reads profileFor(corpus) and exemptionsFor(corpus) instead.
 */
import type { Thresholds } from "./types";
export type * from "./types";

export { replacements } from "./replacements";
export { namingCanon } from "./naming";
export { technicalNouns, technicalVerbs } from "./terms";
export { modals, slopWords, meaningWords, roleMarkers } from "./words";
export { exemptSections, exemptCorpora } from "./exemptions";
export { profileFor, exemptionsFor } from "./corpus";
export {
  loadSteDictionary,
  steStatus,
  STE_DICTIONARY_ENV,
  type SteEntry,
  type StePartOfSpeech,
} from "./ste-dictionary";

/** The numeric limits of the STE Profile page ("Rules We Adopt") and Style Enforcement. */
export const thresholds: Thresholds = {
  proceduralSentenceWords: 20,
  descriptiveSentenceWords: 25,
  paragraphSentences: 4,
  nounClusterNouns: 3,
  shrinkLimit: 0.2,
  rewriteRejectLimit: 0.1,
};
