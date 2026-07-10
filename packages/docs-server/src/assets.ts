import { existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";

import { resolveDocBundleJsonPath } from "@codecaine-ai/docs-index/paths";

import {
  ALLOWED_VIDEO_ASSET_EXT,
  MAX_ASSET_BYTES,
  MAX_VIDEO_ASSET_BYTES,
  inferAssetContentType,
  resolveAssetRootRelativePath,
} from "./confine";
import { normalizeBundlePath } from "./bundle";

/**
 * Doc-bundle asset upload/serve core. Uploads route by content-type —
 * image/* under `<bundle>/assets/images/`, everything else (including
 * application/pdf) under `<bundle>/assets/attachments/` — with filename
 * sanitization, collision auto-uniquify, and byte-size caps enforced on the
 * ACTUAL bytes (caller-supplied size metadata is never trusted past the read).
 */

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitizes an uploaded filename for safe on-disk storage: strips any path
 * separators and leading dots (no traversal, no dotfiles), collapses
 * disallowed characters to `-`, and preserves the original extension. Falls
 * back to a generic name if sanitization would otherwise produce an empty
 * stem.
 */
export function sanitizeAssetFilename(name: string): string {
  const base = basename(name.replaceAll("\\", "/")).replace(/^\.+/, "");
  const ext = extname(base).toLowerCase();
  const stemRaw = ext ? base.slice(0, -ext.length) : base;
  const stem = stemRaw
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128);
  const safeStem = stem || "asset";
  const safeExt = /^\.[A-Za-z0-9]{1,10}$/.test(ext) ? ext : "";
  return `${safeStem}${safeExt}`;
}

/**
 * Auto-uniquifies a filename against a set of already-taken names by
 * appending a numeric suffix before the extension (`name-2.png`,
 * `name-3.png`, ...) — chosen over rejecting with 409 because re-uploading
 * the "same-named" asset (e.g. a re-exported screenshot) is a common,
 * benign flow.
 */
export function uniquifyAssetFilename(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  const ext = extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  let counter = 2;
  let candidate = `${stem}-${counter}${ext}`;
  while (taken(candidate)) {
    counter += 1;
    candidate = `${stem}-${counter}${ext}`;
  }
  return candidate;
}

export type UploadDocAssetInput = {
  file: { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };
  bundlePath: string;
  kind?: string;
};

export type UploadDocAssetResult =
  | {
      ok: true;
      response: {
        src: string;
        path: string;
        document_path: string;
        content_type: string;
        size: number;
        filename: string;
      };
    }
  | { ok: false; status: number; detail: string };

/** Uploads an asset into a doc bundle's assets folder (see module doc). */
export async function uploadDocAsset(
  docsRoot: string,
  input: UploadDocAssetInput,
): Promise<UploadDocAssetResult> {
  const bundleJsonAbs = resolveDocBundleJsonPath(docsRoot, input.bundlePath);
  if (!bundleJsonAbs) {
    return { ok: false, status: 400, detail: `Invalid bundle path: ${input.bundlePath}` };
  }
  if (!(await pathExists(bundleJsonAbs))) {
    return { ok: false, status: 404, detail: `Doc bundle not found: ${input.bundlePath}` };
  }
  const { file } = input;
  if (file.size > MAX_ASSET_BYTES) {
    return {
      ok: false,
      status: 413,
      detail: `Asset exceeds size cap of ${MAX_ASSET_BYTES} bytes: ${file.name}`,
    };
  }
  const contentType = (input.kind && input.kind.trim()) || file.type || "application/octet-stream";
  const subfolder = contentType.startsWith("image/") ? "assets/images" : "assets/attachments";
  const bundleDirAbs = dirname(bundleJsonAbs);
  const targetDirAbs = join(bundleDirAbs, subfolder);
  const sanitizedName = sanitizeAssetFilename(file.name || "asset");
  await mkdir(targetDirAbs, { recursive: true });
  const finalName = uniquifyAssetFilename(sanitizedName, (candidate) =>
    existsSync(join(targetDirAbs, candidate)),
  );
  const targetAbs = join(targetDirAbs, finalName);
  const resolvedTarget = resolve(targetAbs);
  const docsRootResolved = resolve(docsRoot);
  if (!resolvedTarget.startsWith(docsRootResolved + sep)) {
    return { ok: false, status: 400, detail: `Asset path escapes docs directory: ${finalName}` };
  }
  const buffer = new Uint8Array(await file.arrayBuffer());
  // Re-check against the ACTUAL bytes: `file.size` is caller-supplied
  // metadata and may under-report; never trust it past the read.
  if (buffer.byteLength > MAX_ASSET_BYTES) {
    return {
      ok: false,
      status: 413,
      detail: `Asset exceeds size cap of ${MAX_ASSET_BYTES} bytes: ${file.name}`,
    };
  }
  await writeFile(targetAbs, buffer);
  const bundlePath = normalizeBundlePath(input.bundlePath);
  const assetRelPath = bundlePath
    ? `${bundlePath}/${subfolder}/${finalName}`
    : `${subfolder}/${finalName}`;
  return {
    ok: true,
    response: {
      src: `./${subfolder}/${finalName}`,
      path: assetRelPath,
      document_path: `docs/${assetRelPath}`,
      content_type: contentType,
      size: buffer.byteLength,
      filename: finalName,
    },
  };
}

export type UploadDocVideoAssetResult = UploadDocAssetResult;

/**
 * Uploads a VIDEO asset into a doc bundle's `assets/videos/` folder — the
 * strict sibling of `uploadDocAsset` backing the editor's drop-a-video-file
 * flow. Differences from the generic route, all deliberate:
 *
 * - allowlist enforcement instead of routing-by-type: the extension must be
 *   one of ALLOWED_VIDEO_ASSET_EXT and any declared content type must be
 *   `video/*` (or the browsers' opaque `application/octet-stream` fallback),
 *   else 415 — a video slot must never accept arbitrary bytes-as-.txt;
 * - the RAW filename is rejected (400) on null bytes / path separators /
 *   leading-dot-dot shapes rather than silently sanitized — browser `File`
 *   names never contain them, so their presence is an attack, not a typo;
 * - MAX_VIDEO_ASSET_BYTES (64MB) cap, enforced on declared size AND the
 *   actual bytes (413 over), since screen recordings routinely exceed the
 *   generic 20MB asset cap.
 *
 * Returns the same wire shape as the generic upload; `src` is the
 * bundle-relative `./assets/videos/<name>` a `video` block's props carry.
 */
export async function uploadDocVideoAsset(
  docsRoot: string,
  input: UploadDocAssetInput,
): Promise<UploadDocVideoAssetResult> {
  const bundleJsonAbs = resolveDocBundleJsonPath(docsRoot, input.bundlePath);
  if (!bundleJsonAbs) {
    return { ok: false, status: 400, detail: `Invalid bundle path: ${input.bundlePath}` };
  }
  if (!(await pathExists(bundleJsonAbs))) {
    return { ok: false, status: 404, detail: `Doc bundle not found: ${input.bundlePath}` };
  }
  const { file } = input;
  const rawName = file.name || "";
  if (rawName.includes("\0") || /[\\/]/.test(rawName) || rawName.startsWith("..")) {
    return { ok: false, status: 400, detail: `Invalid video filename: ${JSON.stringify(rawName)}` };
  }
  const ext = extname(rawName).toLowerCase();
  if (!ALLOWED_VIDEO_ASSET_EXT.has(ext)) {
    return {
      ok: false,
      status: 415,
      detail: `Unsupported video extension (allowed: ${[...ALLOWED_VIDEO_ASSET_EXT].join(", ")}): ${rawName}`,
    };
  }
  const declaredType = (input.kind && input.kind.trim()) || file.type || "";
  if (declaredType && declaredType !== "application/octet-stream" && !declaredType.startsWith("video/")) {
    return { ok: false, status: 415, detail: `Unsupported video content type: ${declaredType}` };
  }
  if (file.size > MAX_VIDEO_ASSET_BYTES) {
    return {
      ok: false,
      status: 413,
      detail: `Video exceeds size cap of ${MAX_VIDEO_ASSET_BYTES} bytes: ${rawName}`,
    };
  }
  const subfolder = "assets/videos";
  const bundleDirAbs = dirname(bundleJsonAbs);
  const targetDirAbs = join(bundleDirAbs, subfolder);
  const sanitizedName = sanitizeAssetFilename(rawName);
  await mkdir(targetDirAbs, { recursive: true });
  const finalName = uniquifyAssetFilename(sanitizedName, (candidate) =>
    existsSync(join(targetDirAbs, candidate)),
  );
  const targetAbs = join(targetDirAbs, finalName);
  const resolvedTarget = resolve(targetAbs);
  const docsRootResolved = resolve(docsRoot);
  if (!resolvedTarget.startsWith(docsRootResolved + sep)) {
    return { ok: false, status: 400, detail: `Asset path escapes docs directory: ${finalName}` };
  }
  const buffer = new Uint8Array(await file.arrayBuffer());
  // Re-check against the ACTUAL bytes — `file.size` is caller metadata.
  if (buffer.byteLength > MAX_VIDEO_ASSET_BYTES) {
    return {
      ok: false,
      status: 413,
      detail: `Video exceeds size cap of ${MAX_VIDEO_ASSET_BYTES} bytes: ${rawName}`,
    };
  }
  await writeFile(targetAbs, buffer);
  const bundlePath = normalizeBundlePath(input.bundlePath);
  const assetRelPath = bundlePath
    ? `${bundlePath}/${subfolder}/${finalName}`
    : `${subfolder}/${finalName}`;
  return {
    ok: true,
    response: {
      src: `./${subfolder}/${finalName}`,
      path: assetRelPath,
      document_path: `docs/${assetRelPath}`,
      content_type: declaredType || inferAssetContentType(finalName),
      size: buffer.byteLength,
      filename: finalName,
    },
  };
}

export type ReadDocAssetResult =
  | { ok: true; assetAbs: string; contentType: string }
  | { ok: false; status: number; detail: string };

/**
 * Resolves + validates a docs-ROOT-relative asset path for serving.
 * Defense in depth: re-checks MAX_ASSET_BYTES on read even though upload
 * already enforced it, in case the file was replaced out-of-band.
 */
export async function readDocAsset(docsRoot: string, path: string): Promise<ReadDocAssetResult> {
  const assetAbs = resolveAssetRootRelativePath(docsRoot, path);
  if (!assetAbs) {
    return { ok: false, status: 400, detail: `Invalid asset path: ${path}` };
  }
  let st;
  try {
    st = await stat(assetAbs);
  } catch {
    return { ok: false, status: 404, detail: `Asset not found: ${path}` };
  }
  if (!st.isFile()) {
    return { ok: false, status: 404, detail: `Asset path is not a file: ${path}` };
  }
  if (st.size > MAX_ASSET_BYTES) {
    return { ok: false, status: 413, detail: `Asset exceeds size cap: ${path}` };
  }
  return { ok: true, assetAbs, contentType: inferAssetContentType(assetAbs) };
}
