/**
 * Reference-path identity matching (D27, CP7 TG7.2).
 *
 * Doc reference targets (`SpectreRef.kind === "doc"`) were authored BEFORE the
 * M2 bundle migration (CP4), when every doc was a single markdown file. They
 * were never rewritten during migration, so every `reference.path` currently
 * on disk is still in that pre-migration form: `docs/`-prefixed, `.md`/`.mdx`
 * extension, e.g. `"docs/00-foundation/10-purpose.md"` (verified by grepping
 * every migrated bundle's doc.json — 96 doc-kind references, 100% in this
 * form; see CP7 planning notes). Post-migration, that same doc lives at the
 * BUNDLE folder `docs/00-foundation/10-purpose/doc.json`.
 *
 * CANONICAL STORED FORM (chosen here, applied whenever this module REWRITES a
 * reference — e.g. move-doc): the docs-ROOT-relative bundle path, no `docs/`
 * prefix, no file extension — e.g. `"00-foundation/10-purpose"`. This is
 * exactly `normalizeBundlePath`'s output in index.ts and exactly what every
 * bundle-aware route (`/docs/bundle`, `resolveDocBundleJsonPath`,
 * `queryInbound`'s expected `target_path`) already treats as a bundle's
 * identity. New reference spans authored after this checkpoint should use
 * this form directly; old ones are tolerated by the matcher below and
 * normalized to it whenever move-doc rewrites them.
 *
 * The former section-intro convention stored a section's own document in a
 * trailing `00-overview` child bundle. Sections now carry `doc.json` directly,
 * so that trailing segment is retired: legacy references such as
 * `10-system-design/00-overview` identify `10-system-design`. The matcher keeps
 * those references working while the old directories are removed.
 *
 * The matcher intentionally does NOT touch `kind === "source"` refs — those
 * are plain repo-relative file paths (e.g. `apps/frontend/src/.../types.ts`)
 * with no bundle concept, compared by exact string equality elsewhere.
 */

/** Strips a single leading `docs/` (or `docs\`) segment, if present. */
function stripDocsPrefix(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  return normalized.replace(/^docs\//i, "");
}

/** Strips a trailing `/doc.json`, or a bare `.md`/`.mdx` extension. */
function stripBundleSuffix(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "");
  if (normalized.toLowerCase().endsWith("/doc.json")) {
    return normalized.slice(0, -"/doc.json".length);
  }
  if (/\.mdx?$/i.test(normalized)) {
    return normalized.replace(/\.mdx?$/i, "");
  }
  return normalized;
}

/** Collapses retired trailing `/00-overview` segments without collapsing the docs root. */
function collapseLegacyOverviewSuffix(path: string): string {
  let normalized = path;
  while (normalized.endsWith("/00-overview")) {
    const parent = normalized.slice(0, -"/00-overview".length);
    if (parent.length === 0) break;
    normalized = parent;
  }
  return normalized;
}

/**
 * Normalizes any accepted on-disk form of a doc reference path down to the
 * canonical docs-root-relative bundle path (no `docs/` prefix, no extension,
 * no trailing slash). Idempotent: normalizing an already-canonical path is a
 * no-op. Pure string manipulation — does NOT check the filesystem for
 * existence; callers needing existence should stat the bundle separately
 * (see the `docs links check` CLI command, which does exactly that).
 *
 * Accepted forms for `"00-foundation/10-purpose"`:
 *  - `docs/00-foundation/10-purpose.md` (pre-migration, current on-disk form)
 *  - `docs/00-foundation/10-purpose.mdx`
 *  - `00-foundation/10-purpose.md` (docs-root-relative, no docs/ prefix)
 *  - `docs/00-foundation/10-purpose/doc.json` (post-migration bundle form)
 *  - `docs/00-foundation/10-purpose` (bundle folder, docs/-prefixed)
 *  - `00-foundation/10-purpose` (already canonical)
 *  - `docs/00-foundation/10-purpose/00-overview.md` (retired section-intro
 *    convention; trailing `00-overview` segments collapse to their parent)
 *
 * The collapse is exact, lowercase, and trailing-only; it repeats defensively
 * but never changes a bare `00-overview` into the empty docs-root path.
 */
export function normalizeDocRefPath(path: string): string {
  return collapseLegacyOverviewSuffix(stripBundleSuffix(stripDocsPrefix(path)));
}

/**
 * True when two doc reference paths refer to the same bundle once both are
 * normalized to canonical form — the tolerant identity check move-doc and the
 * stale-link checker share.
 */
export function sameDocRef(a: string, b: string): boolean {
  return normalizeDocRefPath(a) === normalizeDocRefPath(b);
}

/** Builds the eight accepted stored aliases for one docs-root-relative base path. */
function storedForms(basePath: string): string[] {
  return [
    basePath,
    `docs/${basePath}`,
    `${basePath}.md`,
    `docs/${basePath}.md`,
    `${basePath}.mdx`,
    `docs/${basePath}.mdx`,
    `${basePath}/doc.json`,
    `docs/${basePath}/doc.json`,
  ];
}

/**
 * Every on-disk alias a canonical bundle path might appear as in the
 * backlinks index's `target_path` column (which stores whatever raw string
 * was in the reference at index time — no normalization at write time).
 * Callers needing a tolerant index lookup query each form and union the
 * results, since sqlite can't do the tolerant-match itself (see this
 * module's doc). Shared by move-doc's inbound discovery and the backlinks
 * read route (`queryInboundTolerant` in backlinks.ts). The returned aliases
 * also include the retired trailing `/00-overview` forms so backlinks stored
 * before that convention's removal remain discoverable.
 */
export function candidateStoredForms(canonicalPath: string): string[] {
  return [
    ...storedForms(canonicalPath),
    ...storedForms(`${canonicalPath}/00-overview`),
  ];
}

/**
 * Rewrites `path` to `toPath`'s canonical form IF it matches `fromPath`
 * (tolerantly, via `sameDocRef`); returns `path` unchanged otherwise. `toPath`
 * is normalized to the canonical form regardless of what form it was passed
 * in, so every rewritten reference converges on the canonical form going
 * forward — this is the "normalizing to ONE canonical stored form on
 * rewrite" behavior required by move-doc.
 */
export function rewriteDocRefPath(path: string, fromPath: string, toPath: string): string {
  if (!sameDocRef(path, fromPath)) return path;
  return normalizeDocRefPath(toPath);
}
