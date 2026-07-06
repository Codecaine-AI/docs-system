import { extname, join, normalize, resolve, sep } from "node:path";

import { isSafeRelativePath } from "@codecaine-ai/docs-index/paths";

/**
 * Path-confinement helpers for the standalone docs server, ported verbatim
 * from Spectre's apps/data-backend/src/index.ts (the canonical
 * implementation these route contracts mirror). Everything here is pure —
 * no I/O — and every file-serving route in server.ts funnels its path input
 * through one of these resolvers so nothing outside the served docs root is
 * ever reachable.
 */

export const MAX_CANVAS_FILE_BYTES = 1024 * 1024;
export const MAX_ASSET_BYTES = 20 * 1024 * 1024;

/** Canvas sidecar path predicate (mirrors Spectre isAllowedCanvasSidecarPath). */
export function isAllowedCanvasSidecarPath(src: string): boolean {
  const normalized = src.replace(/^\.\/+/, "").replaceAll("\\", "/");
  if (!isSafeRelativePath(normalized)) return false;
  if (!normalized.toLowerCase().endsWith(".canvas.json")) return false;
  return normalized.includes("assets/canvases/");
}

/**
 * Resolves a docs-ROOT-relative canvas sidecar `src` (the doc.json "canvas"
 * flavour's cross-doc form) to its docs-root-relative path, or null when the
 * src is malformed or escapes `docsRoot`. Mirrors Spectre's
 * resolveCanvasSidecarRootRelativePath.
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

/** Docs-asset path predicate (mirrors Spectre isAllowedAssetRelativePath). */
export function isAllowedAssetRelativePath(path: string): boolean {
  const normalized = path.replace(/^\.\/+/, "").replaceAll("\\", "/");
  if (!isSafeRelativePath(normalized)) return false;
  const lower = normalized.toLowerCase();
  return lower.includes("assets/images/") || lower.includes("assets/attachments/");
}

/**
 * Resolves a docs-ROOT-relative asset path (e.g.
 * `00-foundation/00-overview/assets/images/foo.png`) to an absolute path
 * confined under `docsRoot`. Mirrors Spectre's resolveAssetRootRelativePath.
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
};

/** Infers a response Content-Type from a file extension (asset serve route). */
export function inferAssetContentType(path: string): string {
  return ASSET_CONTENT_TYPE_BY_EXT[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Confines an arbitrary URL pathname to a file under `baseDir` (the built
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
