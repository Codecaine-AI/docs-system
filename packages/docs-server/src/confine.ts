import { extname, join, normalize, resolve, sep, dirname } from "node:path";

import { isExcludedOnDiskUnderDocsRoot, isSafeRelativePath } from "@codecaine-ai/docs-index/paths";
import { checkDocsPath } from "@codecaine-ai/docs-index/safe-path";

/**
 * Path-confinement helpers for the docs server. Path-shape predicates are
 * lexical; every resolver that knows its docs root then asks the docs-root
 * chokepoint (@codecaine-ai/docs-index/safe-path): the target, resolved on
 * disk, must stay inside the served root and outside every governing
 * project's `exclude` paths. A refused document, sidecar or asset resolves to
 * null, exactly like a path outside the docs root. The chokepoint's guarded
 * operations check again at every system call.
 */

export const MAX_DOC_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_CANVAS_FILE_BYTES = 1024 * 1024;
export const MAX_SEQUENCE_FILE_BYTES = 1024 * 1024;
export const MAX_ASSET_BYTES = 20 * 1024 * 1024;
/** Video uploads get a higher cap than generic assets — screen recordings routinely exceed 20MB. */
export const MAX_VIDEO_ASSET_BYTES = 64 * 1024 * 1024;

/** Extensions the dedicated video-upload route accepts (mirrors the `video/*` rows of ASSET_CONTENT_TYPE_BY_EXT below). */
export const ALLOWED_VIDEO_ASSET_EXT = new Set([".mp4", ".webm", ".mov", ".m4v"]);

export const ALLOWED_DOC_EXT = new Set([".md", ".markdown", ".mdx"]);

export type DocsFormat = "md" | "mdx" | "json";

/** True when `path` names a markdown/MDX source or normalized doc.json bundle file. */
export function isAllowedDocsFilePath(path: string): boolean {
  return ALLOWED_DOC_EXT.has(extname(path).toLowerCase()) || /(?:^|\/)doc\.json$/.test(path);
}

/** Infers the docs source format from a file extension. */
export function inferDocsFormat(path: string): DocsFormat {
  return /(?:^|\/)doc\.json$/.test(path) ? "json" : extname(path).toLowerCase() === ".mdx" ? "mdx" : "md";
}

/** Canvas sidecar path predicate: `.canvas.json` under an `assets/canvases/` segment. */
export function isAllowedCanvasSidecarPath(src: string): boolean {
  const normalized = src.replace(/^\.\/+/, "").replaceAll("\\", "/");
  if (!isSafeRelativePath(normalized)) return false;
  if (!normalized.toLowerCase().endsWith(".canvas.json")) return false;
  return normalized.includes("assets/canvases/");
}

/**
 * Resolves a canvas sidecar `src` RELATIVE TO a referencing doc's own
 * directory (the legacy `.mdx` `<Canvas src="...">` embed form). Returns the
 * docs-root-relative sidecar path or null when the src is malformed or
 * escapes the docs root. With `docsRoot`, null too when the doc or the
 * sidecar is excluded from that docs project (every server caller passes it).
 */
export function resolveCanvasSidecarRelativePath(docPath: string, src: string, docsRoot?: string): string | null {
  if (!isSafeRelativePath(docPath) || !isAllowedDocsFilePath(docPath)) return null;
  if (!isAllowedCanvasSidecarPath(src)) return null;
  const docDir = dirname(docPath) === "." ? "" : dirname(docPath);
  const normalizedSrc = src.replace(/^\.\/+/, "").replaceAll("\\", "/");
  const canvasRelPath = normalize(join(docDir, normalizedSrc)).replaceAll("\\", "/");
  if (!isSafeRelativePath(canvasRelPath)) return null;
  if (!canvasRelPath.toLowerCase().endsWith(".canvas.json")) return null;
  if (!canvasRelPath.includes("assets/canvases/")) return null;
  if (docsRoot !== undefined && (isExcludedOnDiskUnderDocsRoot(docsRoot, docPath) || isExcludedOnDiskUnderDocsRoot(docsRoot, canvasRelPath))) {
    return null;
  }
  return canvasRelPath;
}

/**
 * Resolves a docs-ROOT-relative canvas sidecar `src` (the doc.json "canvas"
 * block type's cross-doc form) to its docs-root-relative path, or null when the
 * src is malformed or escapes `docsRoot`.
 */
export function resolveCanvasSidecarRootRelativePath(
  docsRoot: string,
  src: string,
): string | null {
  if (!isAllowedCanvasSidecarPath(src)) return null;
  const normalizedSrc = src.replace(/^\.\/+/, "").replaceAll("\\", "/");
  const canvasRelPath = normalize(normalizedSrc).replaceAll("\\", "/");
  if (!isSafeRelativePath(canvasRelPath)) return null;
  if (!canvasRelPath.toLowerCase().endsWith(".canvas.json")) return null;
  if (!canvasRelPath.includes("assets/canvases/")) return null;

  const abs = join(docsRoot, canvasRelPath);
  const resolved = resolve(abs);
  const docsRootResolved = resolve(docsRoot);
  if (resolved !== docsRootResolved && !resolved.startsWith(docsRootResolved + sep)) {
    return null;
  }
  if (isExcludedOnDiskUnderDocsRoot(docsRoot, canvasRelPath)) return null;
  return canvasRelPath;
}

/**
 * True when the docs-root chokepoint refuses to write the docs-root-relative
 * target: excluded lexically or at its canonical location, a canonical escape
 * from the served root, a final symbolic link, or unresolvable.
 */
export async function isCanonicalTargetExcluded(docsRoot: string, relPath: string): Promise<boolean> {
  return !checkDocsPath(docsRoot, relPath, "write").ok;
}

/**
 * Write-safe canvas resolver: the lexical checks, then the chokepoint's write
 * check (canonical target inside the served root, outside every governing
 * excluded path, not a final symbolic link). This rejects an existing or
 * missing sidecar reached through a symlink that leaves `docsRoot` or enters
 * an excluded folder.
 */
export async function resolveCanvasSidecarRootRelativeWritePath(
  docsRoot: string,
  src: string,
): Promise<string | null> {
  const canvasRelPath = resolveCanvasSidecarRootRelativePath(docsRoot, src);
  if (!canvasRelPath) return null;
  return checkDocsPath(docsRoot, canvasRelPath, "write").ok ? canvasRelPath : null;
}

/** Sequence sidecar path predicate: `.sequence.json` under an `assets/sequences/` segment. */
export function isAllowedSequenceSidecarPath(src: string): boolean {
  const normalized = src.replace(/^\.\/+/, "").replaceAll("\\", "/");
  if (!isSafeRelativePath(normalized)) return false;
  if (!normalized.toLowerCase().endsWith(".sequence.json")) return false;
  return normalized.includes("assets/sequences/");
}

/**
 * Resolves a sequence sidecar `src` RELATIVE TO a referencing doc's own
 * directory, exactly mirroring `resolveCanvasSidecarRelativePath`. Returns
 * the docs-root-relative sidecar path or null when the src is malformed or
 * escapes the docs root.
 */
export function resolveSequenceSidecarRelativePath(docPath: string, src: string, docsRoot?: string): string | null {
  if (!isSafeRelativePath(docPath) || !isAllowedDocsFilePath(docPath)) return null;
  if (!isAllowedSequenceSidecarPath(src)) return null;
  const docDir = dirname(docPath) === "." ? "" : dirname(docPath);
  const normalizedSrc = src.replace(/^\.\/+/, "").replaceAll("\\", "/");
  const sequenceRelPath = normalize(join(docDir, normalizedSrc)).replaceAll("\\", "/");
  if (!isSafeRelativePath(sequenceRelPath)) return null;
  if (!sequenceRelPath.toLowerCase().endsWith(".sequence.json")) return null;
  if (!sequenceRelPath.includes("assets/sequences/")) return null;
  if (docsRoot !== undefined && (isExcludedOnDiskUnderDocsRoot(docsRoot, docPath) || isExcludedOnDiskUnderDocsRoot(docsRoot, sequenceRelPath))) {
    return null;
  }
  return sequenceRelPath;
}

/**
 * Resolves a docs-ROOT-relative sequence sidecar `src` (the doc.json
 * "sequence" block type's cross-doc form) to its docs-root-relative path, or
 * null when the src is malformed or escapes `docsRoot`.
 */
export function resolveSequenceSidecarRootRelativePath(
  docsRoot: string,
  src: string,
): string | null {
  if (!isAllowedSequenceSidecarPath(src)) return null;
  const normalizedSrc = src.replace(/^\.\/+/, "").replaceAll("\\", "/");
  const sequenceRelPath = normalize(normalizedSrc).replaceAll("\\", "/");
  if (!isSafeRelativePath(sequenceRelPath)) return null;
  if (!sequenceRelPath.toLowerCase().endsWith(".sequence.json")) return null;
  if (!sequenceRelPath.includes("assets/sequences/")) return null;

  const abs = join(docsRoot, sequenceRelPath);
  const resolved = resolve(abs);
  const docsRootResolved = resolve(docsRoot);
  if (resolved !== docsRootResolved && !resolved.startsWith(docsRootResolved + sep)) {
    return null;
  }
  if (isExcludedOnDiskUnderDocsRoot(docsRoot, sequenceRelPath)) return null;
  return sequenceRelPath;
}

/**
 * Write-safe sequence resolver — the sequence counterpart of
 * `resolveCanvasSidecarRootRelativeWritePath`: canonicalizes the target's
 * deepest existing ancestor and requires it to remain under the canonical
 * docs root, rejecting symlink escapes.
 */
export async function resolveSequenceSidecarRootRelativeWritePath(
  docsRoot: string,
  src: string,
): Promise<string | null> {
  const sequenceRelPath = resolveSequenceSidecarRootRelativePath(docsRoot, src);
  if (!sequenceRelPath) return null;
  return checkDocsPath(docsRoot, sequenceRelPath, "write").ok ? sequenceRelPath : null;
}

/** Docs-asset path predicate: under `assets/images/`, `assets/videos/`, or `assets/attachments/`. */
export function isAllowedAssetRelativePath(path: string): boolean {
  const normalized = path.replace(/^\.\/+/, "").replaceAll("\\", "/");
  if (!isSafeRelativePath(normalized)) return false;
  const lower = normalized.toLowerCase();
  return (
    lower.includes("assets/images/") ||
    lower.includes("assets/videos/") ||
    lower.includes("assets/attachments/")
  );
}

/**
 * Resolves a docs-ROOT-relative asset path (e.g.
 * `00-foundation/00-overview/assets/images/foo.png`) to an absolute path
 * confined under `docsRoot`. Returns the absolute path or null.
 */
export function resolveAssetRootRelativePath(docsRoot: string, path: string): string | null {
  if (!isAllowedAssetRelativePath(path)) return null;
  const normalizedPath = path.replace(/^\.\/+/, "").replaceAll("\\", "/");
  const assetRelPath = normalize(normalizedPath).replaceAll("\\", "/");
  if (!isSafeRelativePath(assetRelPath)) return null;
  if (!isAllowedAssetRelativePath(assetRelPath)) return null;

  const abs = join(docsRoot, assetRelPath);
  const resolved = resolve(abs);
  const docsRootResolved = resolve(docsRoot);
  if (resolved !== docsRootResolved && !resolved.startsWith(docsRootResolved + sep)) {
    return null;
  }
  if (isExcludedOnDiskUnderDocsRoot(docsRoot, assetRelPath)) return null;
  return resolved;
}

const ASSET_CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
};

/** Infers a response Content-Type from a file extension (asset serve route). */
export function inferAssetContentType(path: string): string {
  return ASSET_CONTENT_TYPE_BY_EXT[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/** Safe id for a `<Canvas id="..." />` MDX reference. */
export function isSafeCanvasMdxId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,96}$/.test(value);
}

/**
 * Confines an arbitrary URL pathname to a file under `baseDir` (e.g. a built
 * SPA's dist directory). Same strategy as the docs resolvers: reject unsafe
 * relative shapes up front, then verify the resolved absolute path stays
 * under the base. Returns the absolute path or null.
 */
export function resolveStaticFilePath(baseDir: string, urlPathname: string): string | null {
  const trimmed = urlPathname.replace(/^\/+/, "");
  if (trimmed.length === 0) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return null;
  }
  if (!isSafeRelativePath(decoded)) return null;
  const abs = resolve(join(baseDir, decoded));
  const baseResolved = resolve(baseDir);
  if (abs !== baseResolved && !abs.startsWith(baseResolved + sep)) return null;
  return abs;
}
