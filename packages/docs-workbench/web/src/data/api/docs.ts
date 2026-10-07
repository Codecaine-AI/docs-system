import type { DocsTreeNode } from "@codecaine-ai/docs-viewer/client";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";
import type { AnnotationsDocument } from "@codecaine-ai/docs-model/annotations-schema";
import { ApiError, IS_STATIC, fetchJson, postJson, assertWritable, encodePathSegments, bundlePathOf } from "./http";
import { getSessionId } from "../session";

export type BundlePayload = {
  path: string;
  document_path: string;
  doc: unknown;
  doc_hash: string;
  annotations: AnnotationsDocument | null;
  annotations_hash: string | null;
};

export type CanvasPayload = {
  canvas_path: string;
  canvas_document_path: string;
  content_hash: string | null;
  canvas: unknown;
};

export type SequencePayload = {
  sequence_path: string;
  sequence_document_path: string;
  content_hash: string | null;
  sequence: unknown;
};

export type BacklinkRow = {
  sourcePath: string;
  sourceBlockId: string;
  targetKind: "doc" | "source";
  targetPath: string;
  targetSymbol: string | null;
  targetLine: number | null;
  targetSection: string | null;
  updatedAt: string;
};

export async function getTree(): Promise<{ tree: DocsTreeNode[] }> {
  if (IS_STATIC) return fetchJson(`data/tree.json`);
  return fetchJson(`api/tree`);
}

export async function getBundle(path: string): Promise<BundlePayload> {
  if (IS_STATIC) return fetchJson(`data/bundles/${encodePathSegments(path)}.json`);
  return fetchJson(`api/bundle?path=${encodeURIComponent(path)}`);
}

export async function getCanvasBySrc(src: string): Promise<CanvasPayload> {
  if (IS_STATIC) {
    const canvas = await fetchJson<unknown>(`data/files/${encodePathSegments(src)}`);
    return {
      canvas_path: src,
      canvas_document_path: `docs/${src}`,
      content_hash: null,
      canvas,
    };
  }
  return fetchJson(`api/canvas?src=${encodeURIComponent(src)}`);
}

export async function getSequenceBySrc(src: string): Promise<SequencePayload> {
  if (IS_STATIC) {
    const sequence = await fetchJson<unknown>(`data/files/${encodePathSegments(src)}`);
    return {
      sequence_path: src,
      sequence_document_path: `docs/${src}`,
      content_hash: null,
      sequence,
    };
  }
  return fetchJson(`api/sequence?src=${encodeURIComponent(src)}`);
}

/** URL an `image` block's docs-root-relative src is served at. */
export function assetUrl(path: string): string {
  if (IS_STATIC) return `data/files/${encodePathSegments(path)}`;
  return `api/asset?path=${encodeURIComponent(path)}`;
}

export type UploadVideoAssetResponse = {
  src: string;
  path: string;
  document_path: string;
  content_type: string;
  size: number;
  filename: string;
};

/**
 * Uploads a video file into the doc bundle's `assets/videos/` via the strict
 * `/api/assets/video` route (video-extension/MIME allowlist, 64MB cap,
 * collision-suffixed naming). `src` in the response is the bundle-relative
 * `./assets/videos/<name>` a `video` block's props carry — the same shape
 * `assetUrl` + `resolveBundleAssetSrc` already resolve at render time.
 */
export async function uploadVideoAsset(
  path: string,
  file: File,
): Promise<UploadVideoAssetResponse> {
  assertWritable("Uploading videos");
  const form = new FormData();
  form.append("file", file);
  form.append("bundlePath", bundlePathOf(path));
  return fetchJson(`api/assets/video`, { method: "POST", body: form });
}

let staticBacklinksPromise: Promise<Record<string, BacklinkRow[]>> | null = null;

export async function getBacklinks(target: string): Promise<BacklinkRow[]> {
  if (IS_STATIC) {
    staticBacklinksPromise ??= fetchJson<Record<string, BacklinkRow[]>>(`data/backlinks.json`);
    const map = await staticBacklinksPromise;
    return map[target] ?? [];
  }
  const payload = await fetchJson<{ target: string; backlinks: BacklinkRow[] }>(
    `api/backlinks?target=${encodeURIComponent(target)}`,
  );
  return payload.backlinks;
}
// ---------------------------------------------------------------------------
// Doc ops (serve only)
// ---------------------------------------------------------------------------

export type ApplyDocOpsResponse = {
  normalization?: { ops: DocOp[]; message: string };
  doc: DocDocument;
  hash: string;
  patch_id: string;
};

/**
 * Applies a block-op batch with the current doc hash as precondition.
 * Throws `ApiError` with status 409 (stale hash — payload carries
 * `current_hash`) or 423 (draft lock held by another session — payload
 * carries `held_by`).
 */
export async function applyDocOps(
  path: string,
  ops: DocOp[],
  expectedHash?: string,
): Promise<ApplyDocOpsResponse> {
  assertWritable("Saving");
  return postJson(`api/ops`, {
    path: bundlePathOf(path),
    ops,
    expected_hash: expectedHash,
    session_id: getSessionId(),
  });
}

// ---------------------------------------------------------------------------
// Undo (serve only)
// ---------------------------------------------------------------------------

export type UndoResult =
  | { ok: true }
  | { ok: false; alreadyUndone: boolean; detail: string };

/**
 * Replays the stored inverse of a patch. Single-use: a second undo of the
 * same patch id 404s, surfaced as `alreadyUndone`.
 */
/** Moves/renames a bundle folder; the server rewrites inbound references. */
export async function moveDoc(
  fromPath: string,
  toPath: string,
): Promise<{ moved: string[]; rewrittenSources: string[]; failures: string[] }> {
  assertWritable("Move");
  return postJson(`api/move`, { fromPath, toPath });
}

export async function undoPatch(patchId: string): Promise<UndoResult> {
  assertWritable("Undo");
  try {
    await postJson(`api/undo`, { patch_id: patchId });
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        ok: false,
        alreadyUndone: error.status === 404,
        detail: error.status === 404 ? "Already undone." : error.message,
      };
    }
    throw error;
  }
}

