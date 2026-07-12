import { realpath } from "node:fs/promises";
import { extname, join, normalize, resolve, sep, dirname } from "node:path";

import { isSafeRelativePath } from "@codecaine-ai/docs-index/paths";

/**
 * Path-confinement helpers for the docs server. Most predicates and read
 * resolvers are lexical; write resolvers additionally canonicalize existing
 * filesystem ancestors so symlinks cannot redirect a mutation outside the
 * served docs root. Originally ported from the host data-backend's canonical
 * implementation; this package is now the single source of truth.
 */

export const MAX_DOC_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_CANVAS_FILE_BYTES = 1024 * 1024;
export const MAX_ASSET_BYTES = 20 * 1024 * 1024;
/** Video uploads get a higher cap than generic assets — screen recordings routinely exceed 20MB. */
export const MAX_VIDEO_ASSET_BYTES = 64 * 1024 * 1024;

/** Extensions the dedicated video-upload route accepts (mirrors the `video/*` rows of ASSET_CONTENT_TYPE_BY_EXT below). */
export const ALLOWED_VIDEO_ASSET_EXT = new Set([".mp4", ".webm", ".mov", ".m4v"]);

export const ALLOWED_DOC_EXT = new Set([".md", ".markdown", ".mdx"]);

export type DocsFormat = "md" | "mdx";

/** True when `path` names a markdown/MDX docs source file. */
export function isAllowedDocsFilePath(path: string): boolean {
  return ALLOWED_DOC_EXT.has(extname(path).toLowerCase());
}

/** Infers the docs source format from a file extension. */
export function inferDocsFormat(path: string): DocsFormat {
  return extname(path).toLowerCase() === ".mdx" ? "mdx" : "md";
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
 * escapes the docs root.
 */
export function resolveCanvasSidecarRelativePath(docPath: string, src: string): string | null {
  if (!isSafeRelativePath(docPath) || !isAllowedDocsFilePath(docPath)) return null;
  if (!isAllowedCanvasSidecarPath(src)) return null;
  const docDir = dirname(docPath) === "." ? "" : dirname(docPath);
  const normalizedSrc = src.replace(/^\.\/+/, "").replaceAll("\\", "/");
  const canvasRelPath = normalize(join(docDir, normalizedSrc)).replaceAll("\\", "/");
  if (!isSafeRelativePath(canvasRelPath)) return null;
  if (!canvasRelPath.toLowerCase().endsWith(".canvas.json")) return null;
  if (!canvasRelPath.includes("assets/canvases/")) return null;
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
  return canvasRelPath;
}

async function realpathDeepestExistingAncestor(absPath: string): Promise<string | null> {
  let candidate = absPath;
  while (true) {
    try {
      return await realpath(candidate);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") return null;
      const parent = dirname(candidate);
      if (parent === candidate) return null;
      candidate = parent;
    }
  }
}

/**
 * Write-safe canvas resolver. After the usual lexical checks, canonicalizes
 * the target's deepest existing ancestor and requires that canonical path to
 * remain under the canonical docs root. This rejects an existing or missing
 * sidecar reached through a symlink that leaves `docsRoot`.
 */
export async function resolveCanvasSidecarRootRelativeWritePath(
  docsRoot: string,
  src: string,
): Promise<string | null> {
  const canvasRelPath = resolveCanvasSidecarRootRelativePath(docsRoot, src);
  if (!canvasRelPath) return null;

  let docsRootReal: string;
  try {
    docsRootReal = await realpath(docsRoot);
  } catch {
    return null;
  }

  const ancestorReal = await realpathDeepestExistingAncestor(
    resolve(join(docsRoot, canvasRelPath)),
  );
  if (!ancestorReal) return null;
  if (ancestorReal !== docsRootReal && !ancestorReal.startsWith(docsRootReal + sep)) {
    return null;
  }
  return canvasRelPath;
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
