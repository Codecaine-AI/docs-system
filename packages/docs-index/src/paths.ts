import { join, relative, resolve, sep } from "node:path";

import { loadDocsProjectPolicy, type DocsProjectExcludeScope } from "./project-policy";
import { checkDocsPath, realDocsRootPath } from "./safe-path";

/**
 * Shared docs-path predicates/confinement, copied verbatim from Spectre
 * apps/data-backend/src/index.ts (which move-doc.ts previously imported via
 * a benign module cycle). Pure functions — no I/O — except the exclusion
 * registry below, which canonicalizes docs roots and reads the project's
 * codecaine.docs.json policy.
 */

/**
 * Corpus exclusion: `codecaine.docs.json` may list `"exclude"` globs. A path
 * that matches a glob, or lies below a match, is not part of the docs
 * project: the tree, the file watcher, the backlinks index, canvas listings,
 * corpus management and every doc-bundle resolver skip it, so it can be
 * neither read nor written as a doc. Globs are matched with `Bun.Glob`
 * against docsRoot-relative `/`-separated paths (for a `"docsRoot": "."`
 * project that is the project root). A glob ending in `/**` also matches its
 * own folder, so `a/**` hides the `a` folder itself.
 *
 * Matching is case-insensitive and Unicode-normalization-insensitive (B7-3-01):
 * on a default APFS volume `outputs/INPUTS`, `Outputs/Inputs` and an NFD
 * spelling of a name all open the same folder as `outputs/inputs`, so a glob
 * must exclude every spelling, including a creation target that does not
 * exist yet. A path is excluded when the glob matches it exactly (the
 * historic rule, never weaker) or when the folded glob matches the folded
 * path in any folding form below. Folding only ever adds matches, so on a
 * case-sensitive volume it refuses more, never less.
 */
type GlobMatcher = { match(path: string): boolean };
const EMPTY_EXCLUDE: readonly string[] = Object.freeze([]);
const excludeByDocsRoot = new Map<string, readonly string[]>();

/**
 * Folding forms: lower case and full case folding (upper then lower, so `ß`
 * and `SS` meet and final sigma meets sigma), each in NFC and NFD (a `?` or a
 * character class counts characters, which differ between the two forms).
 */
const FOLDS: ReadonlyArray<(value: string) => string> = [
  (value) => value.normalize("NFC").toLowerCase().normalize("NFC"),
  (value) => value.normalize("NFD").toLowerCase().normalize("NFD"),
  (value) => value.normalize("NFC").toUpperCase().toLowerCase().normalize("NFC"),
  (value) => value.normalize("NFD").toUpperCase().toLowerCase().normalize("NFD"),
];

/** One glob (its source text) and the folded path form it is matched against (-1: the exact path). */
type CompiledExclude = { fold: number; source: string; glob: GlobMatcher };
const compiledGlobs = new Map<string, CompiledExclude[]>();

function compileExcludeGlob(pattern: string): CompiledExclude[] {
  let compiled = compiledGlobs.get(pattern);
  if (!compiled) {
    compiled = [];
    const seen = new Set<string>();
    const add = (fold: number, source: string) => {
      const key = `${fold}\0${source}`;
      if (seen.has(key)) return;
      seen.add(key);
      // Bun.Glob is read lazily so browser bundles that import this module never touch it.
      compiled!.push({ fold, source, glob: new Bun.Glob(source) });
      if (source.endsWith("/**") && source.length > 3) {
        const folder = source.slice(0, -3);
        compiled!.push({ fold, source: folder, glob: new Bun.Glob(folder) });
      }
    };
    add(-1, pattern);
    FOLDS.forEach((fold, index) => add(index, fold(pattern)));
    compiledGlobs.set(pattern, compiled);
  }
  return compiled;
}

/**
 * The case- and normalization-folded form of a docs-relative path (lower
 * case, NFC). Use it to compare two path spellings the way a default APFS
 * volume does; exclusion matching itself uses every folding form.
 */
export function foldDocsPath(path: string): string {
  return FOLDS[0]!(path);
}

/**
 * True when `a` and `b` are the same name in some folding form the exclusion
 * matcher uses (lower case or full case folding, NFC or NFD): `INPUTS` and
 * `inputs`, final sigma `ς` and `σ`, long s `ſ` and `s`.
 */
export function foldsTogether(a: string, b: string): boolean {
  return a === b || FOLDS.some((fold) => fold(a) === fold(b));
}

/** Normalizes a docsRoot-relative path to `a/b/c` (no leading `./` or slashes). */
function normalizeDocsRelativePath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")
    .join("/");
}

/**
 * True when `relPath` or any of its ancestors matches one of `exclude`, in
 * any spelling a case-insensitive, normalization-insensitive volume treats
 * as the same name.
 */
export function isExcludedDocPath(relPath: string, exclude: readonly string[] | undefined): boolean {
  if (!exclude || exclude.length === 0) return false;
  const normalized = normalizeDocsRelativePath(relPath);
  if (!normalized) return false;
  const segments = normalized.split("/");
  for (let depth = 1; depth <= segments.length; depth += 1) {
    const candidate = segments.slice(0, depth).join("/");
    const forms: string[] = [];
    const form = (fold: number) => {
      if (fold < 0) return candidate;
      return (forms[fold] ??= FOLDS[fold]!(candidate));
    };
    // A folded glob and path that equal an already tested pair (ASCII lower case: every form) are skipped.
    const tested = new Set<string>();
    for (const pattern of exclude) {
      for (const { fold, source, glob } of compileExcludeGlob(pattern)) {
        const value = form(fold);
        const key = `${source}\0${value}`;
        if (tested.has(key)) continue;
        tested.add(key);
        if (glob.match(value)) return true;
      }
    }
  }
  return false;
}

/**
 * Registers the exclude globs of the project served from `docsRoot`
 * (discovery calls this for every project it returns, from the same
 * codecaine.docs.json the disk policy reads). A registration replaces the
 * project's own on-disk globs; an empty or missing list clears it, so the
 * on-disk policy applies again. Keys are the resolved and the canonical root.
 */
export function setDocsRootExclude(docsRoot: string, exclude: readonly string[] | undefined): void {
  // A missing root keeps only its resolved key (realDocsRootPath falls back to it).
  const keys = new Set([resolve(docsRoot), realDocsRootPath(docsRoot)]);
  const list = exclude && exclude.length > 0 ? Object.freeze([...exclude]) : undefined;
  for (const key of keys) {
    if (list) excludeByDocsRoot.set(key, list);
    else excludeByDocsRoot.delete(key);
    policyByDocsRoot.delete(key);
  }
}

/**
 * The on-disk policy (codecaine.docs.json at the docs root and its
 * ancestors), loaded lazily in every process, so hosts that never run
 * discovery (standalone serve, kernel edit-session, CLI export) still honor
 * it. Re-read at most once per second per root; a malformed policy throws.
 */
type CachedPolicy = { checkedAt: number; scopes?: DocsProjectExcludeScope[]; error?: Error };
const policyByDocsRoot = new Map<string, CachedPolicy>();
const POLICY_RECHECK_MS = 1000;

function diskPolicyScopes(docsRoot: string): DocsProjectExcludeScope[] {
  const key = resolve(docsRoot);
  const now = Date.now();
  let cached = policyByDocsRoot.get(key);
  if (!cached || now - cached.checkedAt >= POLICY_RECHECK_MS) {
    try {
      cached = { checkedAt: now, scopes: loadDocsProjectPolicy(key).scopes };
    } catch (error) {
      cached = { checkedAt: now, error: error instanceof Error ? error : new Error(String(error)) };
    }
    policyByDocsRoot.set(key, cached);
  }
  if (cached.error) throw cached.error;
  return cached.scopes ?? [];
}

/** The governing policy scopes for `docsRoot` (own and enclosing projects); throws on a malformed policy. */
export function docsRootPolicyScopes(docsRoot: string): readonly DocsProjectExcludeScope[] {
  return diskPolicyScopes(docsRoot);
}

/**
 * Loads and validates the project policy for `docsRoot` now, throwing on a
 * malformed codecaine.docs.json. Hosts call this at startup to fail fast.
 */
export function loadDocsRootExcludePolicy(docsRoot: string): DocsProjectExcludeScope[] {
  policyByDocsRoot.delete(resolve(docsRoot));
  return diskPolicyScopes(docsRoot);
}

/** The project's own exclude globs for `docsRoot`: the registration, else codecaine.docs.json (empty when none). */
export function docsRootExclude(docsRoot: string): readonly string[] {
  const explicit = excludeByDocsRoot.get(resolve(docsRoot));
  if (explicit) return explicit;
  return diskPolicyScopes(docsRoot).find((scope) => scope.prefix === "")?.exclude ?? EMPTY_EXCLUDE;
}

/**
 * True when the docsRoot-relative `relPath` is excluded from the project at
 * `docsRoot`, or from an enclosing project (for example a knowledge base with
 * `"docsRoot": "."`) whose globs reach into the folder `docsRoot` serves.
 */
export function isExcludedUnderDocsRoot(docsRoot: string, relPath: string): boolean {
  const key = resolve(docsRoot);
  const explicit = excludeByDocsRoot.get(key);
  const normalized = normalizeDocsRelativePath(relPath);
  for (const scope of diskPolicyScopes(key)) {
    if (scope.prefix === "") {
      if (!explicit && isExcludedDocPath(normalized, scope.exclude)) return true;
      continue;
    }
    if (isExcludedDocPath(normalized ? `${scope.prefix}/${normalized}` : scope.prefix, scope.exclude)) return true;
  }
  return explicit ? isExcludedDocPath(normalized, explicit) : false;
}

/** True when `docsRoot` has any exclude policy (a registration, its own codecaine.docs.json, or an enclosing project's). */
export function hasDocsRootExcludePolicy(docsRoot: string): boolean {
  return excludeByDocsRoot.has(resolve(docsRoot)) || diskPolicyScopes(docsRoot).length > 0;
}

/**
 * True when the docs-root filesystem chokepoint (safe-path.ts) refuses to
 * read `relPath` under `docsRoot`: the path is excluded lexically, or its
 * canonical location on disk (symbolic links resolved) is excluded by any
 * governing project policy, or leads outside the served root (for example a
 * link from a served subfolder into an excluded sibling of the enclosing
 * project), or cannot be resolved safely. Resolvers use this before any read
 * or write; the guarded operations check again at their system call.
 */
export function isExcludedOnDiskUnderDocsRoot(docsRoot: string, relPath: string): boolean {
  return !checkDocsPath(docsRoot, relPath, "read").ok;
}

export function isSafeRelativePath(path: string): boolean {
  if (!path || path.length === 0) return false;
  if (path.includes("\0")) return false;
  if (path.startsWith("/") || path.startsWith("\\")) return false;
  return path.split(/[\\/]/).every((segment) => segment !== "" && segment !== "..");
}

/**
 * Resolves a `docs/`-relative `path` (a bundle folder, a `doc.json` path, or
 * a bare docs path) to the bundle's `doc.json` under `docsRoot`. Mirrors
 * the data-backend's `loadProjectDocsFile` confinement pattern (D8/D20/D26 —
 * runtime-only projection, read-only, no writes, no traversal outside
 * `docsRoot`).
 */
export function resolveDocBundleJsonPath(docsRoot: string, path: string): string | null {
  if (!isSafeRelativePath(path)) return null;
  const lower = path.toLowerCase();
  // Only doc-bundle shapes are accepted: a bundle folder (doc.json is
  // appended), an explicit `<bundle>/doc.json` path, or a flat `*.doc.json`
  // file (the docs-cli's standalone-doc shape). Any OTHER `.json` path
  // (annotations.json, *.canvas.json, arbitrary JSON) is rejected — those have
  // their own narrowly-scoped resolvers and must never be loadable as a doc
  // bundle through this shared resolver.
  const isDocJsonShape =
    lower === "doc.json" || lower.endsWith("/doc.json") || lower.endsWith(".doc.json");
  if (!isDocJsonShape && lower.endsWith(".json")) return null;
  const relJsonPath = isDocJsonShape ? path : join(path, "doc.json");
  const abs = join(docsRoot, relJsonPath);
  const resolved = resolve(abs);
  const docsRootResolved = resolve(docsRoot);
  if (resolved !== docsRootResolved && !resolved.startsWith(docsRootResolved + sep)) {
    return null;
  }
  // An excluded bundle is not part of the project: it cannot be read or written as a doc,
  // also not through a symbolic link that leads into an excluded folder or out of the root.
  if (isExcludedOnDiskUnderDocsRoot(docsRoot, relative(docsRootResolved, resolved))) return null;
  return abs;
}
