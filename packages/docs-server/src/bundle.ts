import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { serializeDocDocument, validateDocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { CommentsDocument, CommentTarget } from "@codecaine-ai/docs-model/comments-schema";
import { validateCommentsDocument } from "@codecaine-ai/docs-model/comments-schema";
import { projectToMarkdown } from "@codecaine-ai/docs-model/project-markdown";
import { resolveDocBundleJsonPath } from "@codecaine-ai/docs-index/paths";

import { atomicWriteFile } from "./atomic-write";
import { createContentHash } from "./content-hash";

/**
 * Doc-bundle loading + comments sidecar read/write. This is the single
 * source of truth for the bundle wire shapes — both the standalone serve
 * app's `GET /api/bundle` and any host app's project-scoped bundle routes
 * delegate here, so responses stay shape-identical everywhere.
 */

export { createContentHash };

/**
 * Normalizes a `docs/`-relative bundle reference (folder, `doc.json` path,
 * or bare path) down to the bundle-relative folder path.
 */
export function normalizeBundlePath(path: string): string {
  const withForwardSlashes = path.replaceAll("\\", "/");
  if (withForwardSlashes.toLowerCase() === "doc.json") return "";
  if (withForwardSlashes.toLowerCase().endsWith("/doc.json")) {
    return withForwardSlashes.slice(0, -"/doc.json".length);
  }
  if (withForwardSlashes.toLowerCase().endsWith(".json")) {
    return withForwardSlashes.slice(0, -".json".length);
  }
  return withForwardSlashes.replace(/\/+$/, "");
}

export type DocBundleLoadResult = {
  docsRoot: string;
  docsRootResolved: string;
  bundlePath: string;
  jsonAbs: string;
  commentsAbs: string;
  raw: string;
  document: DocDocument;
  docHash: string;
  comments: CommentsDocument | null;
  commentsHash: string | null;
};

export type DocBundleLoadError = { error: { status: number; detail: string } };

/**
 * Loads + validates a doc bundle's `doc.json` together with its sibling
 * `comments.json`, if present, from the SAME bundle folder. `comments.json`
 * absence is a valid empty state, not an error; presence with invalid
 * content IS a clear error (never silently dropped).
 */
export async function loadDocBundle(
  docsRoot: string,
  path: string,
): Promise<DocBundleLoadResult | DocBundleLoadError> {
  const jsonAbs = resolveDocBundleJsonPath(docsRoot, path);
  if (!jsonAbs) {
    return { error: { status: 400, detail: `Invalid docs path: ${path}` } };
  }

  let raw: string;
  try {
    raw = await readFile(jsonAbs, "utf8");
  } catch {
    return { error: { status: 404, detail: `Doc bundle not found: ${path}` } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: { status: 422, detail: `Doc bundle is not valid JSON: ${path}` } };
  }

  const validated = validateDocDocument(parsed);
  if (!validated.ok) {
    return {
      error: {
        status: 422,
        detail: `Doc bundle failed schema validation: ${validated.issues
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("; ")}`,
      },
    };
  }

  const docsRootResolved = resolve(docsRoot);
  const bundlePath = normalizeBundlePath(path);
  const commentsAbs = join(dirname(jsonAbs), "comments.json");

  let comments: CommentsDocument | null = null;
  let commentsHash: string | null = null;
  let commentsRaw: string | null = null;
  try {
    commentsRaw = await readFile(commentsAbs, "utf8");
  } catch {
    commentsRaw = null;
  }
  if (commentsRaw !== null) {
    let commentsParsed: unknown;
    try {
      commentsParsed = JSON.parse(commentsRaw);
    } catch {
      return {
        error: { status: 422, detail: `Comments sidecar is not valid JSON: ${path}/comments.json` },
      };
    }
    const commentsValidated = validateCommentsDocument(commentsParsed);
    if (!commentsValidated.ok) {
      return {
        error: {
          status: 422,
          detail: `Comments sidecar failed schema validation: ${commentsValidated.issues
            .map((issue) => `${issue.path}: ${issue.message}`)
            .join("; ")}`,
        },
      };
    }
    comments = commentsValidated.document;
    commentsHash = createContentHash(commentsRaw);
  }

  return {
    docsRoot,
    docsRootResolved,
    bundlePath,
    jsonAbs,
    commentsAbs,
    raw,
    document: validated.document,
    docHash: createContentHash(serializeDocDocument(validated.document)),
    comments,
    commentsHash,
  };
}

/**
 * The wire shape both `GET /api/bundle` and exported per-bundle JSON
 * snapshots use.
 */
export function bundleResponse(loaded: DocBundleLoadResult) {
  return {
    path: loaded.bundlePath,
    document_path: `docs/${loaded.bundlePath}`,
    doc: loaded.document,
    doc_hash: loaded.docHash,
    comments: loaded.comments,
    comments_hash: loaded.commentsHash,
  };
}

export type DocProjectionResult = { markdown: string };

/** Loads a bundle's doc.json and projects it to markdown (read-only). */
export async function loadDocProjection(
  docsRoot: string,
  path: string,
): Promise<DocProjectionResult | DocBundleLoadError> {
  const loaded = await loadDocBundle(docsRoot, path);
  if ("error" in loaded) return loaded;
  return { markdown: projectToMarkdown(loaded.document) };
}

// ---------------------------------------------------------------------------
// Comments sidecar primitives
// ---------------------------------------------------------------------------

export const EMPTY_COMMENTS_DOCUMENT: CommentsDocument = { schemaVersion: 1, comments: [] };

/**
 * Reads + validates a bundle's `comments.json` sidecar directly (the GET
 * comments route uses this rather than `loadDocBundle`, since fetching
 * comments shouldn't require the doc.json to itself be valid). Absence is a
 * valid empty state — never a 404.
 */
export async function readCommentsSidecar(
  commentsAbs: string,
): Promise<
  | { ok: true; comments: CommentsDocument; hash: string | null }
  | { error: { status: number; detail: string } }
> {
  let raw: string;
  try {
    raw = await readFile(commentsAbs, "utf8");
  } catch {
    return { ok: true, comments: EMPTY_COMMENTS_DOCUMENT, hash: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: { status: 422, detail: "Comments sidecar is not valid JSON" } };
  }
  const validated = validateCommentsDocument(parsed);
  if (!validated.ok) {
    return {
      error: {
        status: 422,
        detail: `Comments sidecar failed schema validation: ${validated.issues
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("; ")}`,
      },
    };
  }
  return { ok: true, comments: validated.document, hash: createContentHash(raw) };
}

/** Atomically persists a comments document; returns content + hash. */
export async function writeCommentsSidecar(
  commentsAbs: string,
  document: CommentsDocument,
): Promise<{ content: string; hash: string }> {
  const content = `${JSON.stringify(document, null, 2)}\n`;
  await atomicWriteFile(commentsAbs, content);
  return { content, hash: createContentHash(content) };
}

/** Structural check for a comment target (block or canvas-object). */
export function isValidCommentTarget(value: unknown): value is CommentTarget {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.kind === "block") {
    return typeof record.blockId === "string" && record.blockId.length > 0;
  }
  if (record.kind === "canvas-object") {
    const hasCanvasSrc = typeof record.canvasSrc === "string" && record.canvasSrc.length > 0;
    const selectorCount = [
      record.objectId !== undefined,
      record.connectionId !== undefined,
      record.region !== undefined,
    ].filter(Boolean).length;
    return hasCanvasSrc && selectorCount === 1;
  }
  return false;
}
