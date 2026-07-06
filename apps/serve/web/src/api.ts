import type { DocsTreeNode } from "@codecaine-ai/docs-viewer/client";

/**
 * Data layer for the standalone viewer, with two build-time variants:
 *
 *  - serve mode (__DOCS_STATIC__ === false): fetches the live docs-serve API
 *    (`api/tree`, `api/bundle?path=`, ...).
 *  - static/export mode (__DOCS_STATIC__ === true): fetches the pregenerated
 *    JSON the exporter emitted under `data/` (tree.json, per-bundle
 *    snapshots, copied asset/canvas files, backlinks.json).
 *
 * ALL paths are RELATIVE (no leading slash) so the built site works from any
 * static host and from a subpath — combined with `base: "./"` in the vite
 * config and hash-based navigation.
 */

export type BundlePayload = {
  path: string;
  document_path: string;
  doc: unknown;
  doc_hash: string;
  comments: unknown;
  comments_hash: string | null;
};

export type CanvasPayload = {
  canvas_path: string;
  canvas_document_path: string;
  content_hash: string | null;
  canvas: unknown;
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

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    let detail = `${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // non-JSON error body — status alone is the message
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

/** Encodes a docs-root-relative path for use as URL path segments. */
function encodePathSegments(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export async function getTree(): Promise<{ tree: DocsTreeNode[] }> {
  if (__DOCS_STATIC__) return fetchJson(`data/tree.json`);
  return fetchJson(`api/tree`);
}

export async function getBundle(path: string): Promise<BundlePayload> {
  if (__DOCS_STATIC__) return fetchJson(`data/bundles/${encodePathSegments(path)}.json`);
  return fetchJson(`api/bundle?path=${encodeURIComponent(path)}`);
}

export async function getCanvasBySrc(src: string): Promise<CanvasPayload> {
  if (__DOCS_STATIC__) {
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

/** URL an `image`/`attachment` block's docs-root-relative src is served at. */
export function assetUrl(path: string): string {
  if (__DOCS_STATIC__) return `data/files/${encodePathSegments(path)}`;
  return `api/asset?path=${encodeURIComponent(path)}`;
}

let staticBacklinksPromise: Promise<Record<string, BacklinkRow[]>> | null = null;

export async function getBacklinks(target: string): Promise<BacklinkRow[]> {
  if (__DOCS_STATIC__) {
    staticBacklinksPromise ??= fetchJson<Record<string, BacklinkRow[]>>(`data/backlinks.json`);
    const map = await staticBacklinksPromise;
    return map[target] ?? [];
  }
  const payload = await fetchJson<{ target: string; backlinks: BacklinkRow[] }>(
    `api/backlinks?target=${encodeURIComponent(target)}`,
  );
  return payload.backlinks;
}
