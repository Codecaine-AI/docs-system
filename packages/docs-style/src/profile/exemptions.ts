/**
 * What no tier may change. exemptionsFor (corpus.ts) picks the entries for one corpus.
 * - exemptSections: pages and sections. Each one is a deliberate example of bad writing, where a
 *   fix would destroy the example, or a page where pilot rewrites did not help. An entry with a
 *   corpus applies only there. Page paths repeat across corpora, so tag every new entry.
 * - exemptCorpora: whole corpora that some or all tiers skip.
 */
import type { CorpusExemption, ExemptSection } from "./types";

const RULES_PAGE = "A style-guide rules page: its examples of bad writing are deliberate, and 0 of 14 pilot rewrites there improved it.";

export const exemptSections: readonly ExemptSection[] = [
  {
    corpus: "docs-system",
    page: "00-foundation/00-manifesto",
    heading: "*",
    reason: "Personal voice. Its real problems are typos, which need a person.",
  },
  {
    corpus: "docs-system",
    page: "10-system-design/10-doc-standards/85-style-enforcement",
    heading: "*",
    reason: "The design of this sweep: it names and quotes the patterns the rules flag.",
  },
  { corpus: "docs-system", page: "99-appendix/10-style-guide/10-writing-style", heading: "*", reason: RULES_PAGE },
  { corpus: "docs-system", page: "99-appendix/10-style-guide/20-structure", heading: "*", reason: RULES_PAGE },
  { corpus: "docs-system", page: "99-appendix/10-style-guide/30-ste-profile", heading: "*", reason: RULES_PAGE },
  { corpus: "docs-system", page: "99-appendix/10-style-guide/40-vocabulary", heading: "*", reason: RULES_PAGE },
  // The whole page is exempt today. This entry keeps the example exempt if that ever changes.
  {
    corpus: "docs-system",
    page: "99-appendix/10-style-guide/10-writing-style",
    heading: "Worked Example",
    reason: "The section quotes a bad original paragraph before its revision.",
  },
];

export const exemptCorpora: readonly CorpusExemption[] = [
  { corpus: "Personal Site Writing", tiers: "all", reason: "Personal voice." },
];
