import { join, resolve, sep } from "node:path";

/**
 * Shared docs-path predicates/confinement, copied verbatim from Spectre
 * apps/data-backend/src/index.ts (which move-doc.ts previously imported via
 * a benign module cycle). Pure functions — no I/O.
 */

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
  // (comments.json, *.canvas.json, arbitrary JSON) is rejected — those have
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
  return abs;
}
