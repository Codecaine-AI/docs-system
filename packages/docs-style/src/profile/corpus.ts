/**
 * Per-corpus views of the profile. The profile was built for docs-system, and other corpora share
 * only part of it: entries scoped to docs-system apply there alone (see ProfileScope), and an
 * exemption can name the corpus it protects.
 *
 * A corpus is a registered project name, such as "docs-system" or "Personal Site Writing". The
 * registry ID works too ("personal-site-writing-38daf15d"). Matching ignores case, spacing, and
 * the ID's hash suffix, so passing the other form cannot drop an exemption.
 *
 * Both helpers fail safe when the corpus is missing or blank: no docs-system entry applies, so a
 * sweep changes less, and every exempt section applies, so a sweep skips more.
 */
import { exemptCorpora, exemptSections } from "./exemptions";
import { namingCanon } from "./naming";
import { replacements } from "./replacements";
import type { CorpusExemptions, CorpusProfile, ProfileScope, Replacement } from "./types";

const DOCS_SYSTEM = "docs-system";

/** "Personal Site Writing" and "personal-site-writing-38daf15d" both become "personal-site-writing". */
function corpusKey(corpus: string): string {
  return corpus
    .trim()
    .toLowerCase()
    .replace(/-[0-9a-f]{8}$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inScope(scope: ProfileScope | undefined, key: string): boolean {
  return scope !== "docs-system" || key === DOCS_SYSTEM;
}

/** True when the row applies to the corpus: in scope, and not a corpus that keeps the word as a term. */
function rowApplies(row: Replacement, key: string): boolean {
  return inScope(row.scope, key) && !row.skipCorpora?.some((corpus) => corpusKey(corpus) === key);
}

const profiles = new Map<string, CorpusProfile>();

/**
 * The deny-list rows and naming groups for one corpus. Unscoped and "house" entries apply to every
 * corpus, and "docs-system" entries only to docs-system. A row that names the corpus in
 * `skipCorpora` does not apply. Each corpus gets the same arrays on every call, so a caller can
 * cache the rules it builds from them.
 */
export function profileFor(corpus?: string): CorpusProfile {
  const key = corpus === undefined ? "" : corpusKey(corpus);
  let profile = profiles.get(key);
  if (!profile) {
    profile = {
      replacements: replacements.filter((row) => rowApplies(row, key)),
      namingCanon: namingCanon.filter((group) => inScope(group.scope, key)),
    };
    profiles.set(key, profile);
  }
  return profile;
}

/**
 * The exemptions for one corpus: its whole-corpus exemption, if it has one, and the sections that
 * apply to it. A section applies when it names this corpus or names none.
 */
export function exemptionsFor(corpus?: string): CorpusExemptions {
  const key = corpus === undefined ? "" : corpusKey(corpus);
  if (!key) return { sections: exemptSections };
  const sections = exemptSections.filter((section) => section.corpus === undefined || corpusKey(section.corpus) === key);
  const exemption = exemptCorpora.find((entry) => corpusKey(entry.corpus) === key);
  return exemption ? { corpus: exemption, sections } : { sections };
}
