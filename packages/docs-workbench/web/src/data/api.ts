import type { DocsTreeNode, DraftLockKind, AcquireDraftLockResult } from "@codecaine-ai/docs-viewer/client";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";
import type {
  AnnotationIntent,
  AnnotationTarget,
  AnnotationsDocument,
  DocAnnotation,
} from "@codecaine-ai/docs-model/annotations-schema";

import { getSessionId } from "./session";

/**
 * Data layer for the standalone docs workbench, with two build-time variants:
 *
 *  - serve mode (IS_STATIC === false): the full read+write `/api/*` surface
 *    of @codecaine-ai/docs-server (ops with hash preconditions, annotations,
 *    draft locks, undo, SSE change events).
 *  - static/export mode (IS_STATIC === true): fetches the pregenerated JSON
 *    the exporter emitted under `data/` (tree.json, per-bundle snapshots,
 *    copied asset/canvas files, backlinks.json). No write routes exist in an
 *    export — every mutation helper throws, and the UI hides all
 *    edit/annotate affordances (see App/DocPage).
 *
 * ALL paths are RELATIVE (no leading slash) so the built site works from any
 * static host and from a subpath — combined with `base: "./"` in the vite
 * config and hash-based navigation.
 */

/**
 * Build-time static flag. `__DOCS_STATIC__` is a vite `define`; the `typeof`
 * guard keeps this module loadable under plain bun (tests, smoke scripts)
 * where no define ran — those environments are always "serve" mode.
 */
export const IS_STATIC: boolean =
  typeof __DOCS_STATIC__ !== "undefined" ? __DOCS_STATIC__ : false;

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

/** Error carrying the HTTP status + parsed body, so callers can branch on 409/423/404. */
export class ApiError extends Error {
  readonly status: number;
  readonly payload: Record<string, unknown> | null;

  constructor(message: string, status: number, payload: Record<string, unknown> | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function parseErrorPayload(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    return body;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const payload = await parseErrorPayload(response);
    const detail =
      payload && typeof payload.detail === "string" ? payload.detail : `${response.status}`;
    throw new ApiError(detail, response.status, payload);
  }
  return (await response.json()) as T;
}

function postJson<T>(url: string, body: unknown): Promise<T> {
  return fetchJson<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function assertWritable(operation: string): void {
  if (IS_STATIC) {
    throw new ApiError(`${operation} is unavailable in a static docs export.`, 405);
  }
}

/** Encodes a docs-root-relative path for use as URL path segments. */
function encodePathSegments(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * Draft locks and mutations key on the bare docs-root-relative bundle path;
 * strip a `docs/`-prefixed document_path defensively so both shapes work.
 */
function bundlePathOf(path: string): string {
  return path.replace(/^docs\//i, "");
}

// ---------------------------------------------------------------------------
// Reads (serve + static)
// ---------------------------------------------------------------------------

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
// Annotations (serve only)
// ---------------------------------------------------------------------------

export type AnnotationsPayload = { annotations: AnnotationsDocument; hash: string | null };

export async function getAnnotations(path: string): Promise<AnnotationsPayload> {
  assertWritable("Loading annotations");
  return fetchJson(`api/annotations?path=${encodeURIComponent(bundlePathOf(path))}`);
}

export async function addAnnotation(
  path: string,
  input: {
    target: AnnotationTarget;
    body: string;
    intent: AnnotationIntent;
    author: string;
    expectedHash?: string | null;
  },
): Promise<{ annotation: DocAnnotation; annotations: AnnotationsDocument; hash: string }> {
  assertWritable("Annotating");
  return postJson(`api/annotations`, {
    path: bundlePathOf(path),
    target: input.target,
    body: input.body,
    intent: input.intent,
    author: input.author,
    expected_hash: input.expectedHash ?? undefined,
    session_id: getSessionId(),
  });
}

export async function resolveAnnotation(
  path: string,
  annotationId: string,
  expectedHash?: string | null,
): Promise<{ annotations: AnnotationsDocument; hash: string }> {
  assertWritable("Resolving annotations");
  return postJson(`api/annotations/${encodeURIComponent(annotationId)}/resolve`, {
    path: bundlePathOf(path),
    expected_hash: expectedHash ?? undefined,
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

// ---------------------------------------------------------------------------
// Draft locks (serve only)
// ---------------------------------------------------------------------------

async function draftLockCall(
  endpoint: "acquire" | "heartbeat",
  path: string,
  kind: DraftLockKind,
  sessionId: string,
): Promise<AcquireDraftLockResult> {
  const response = await fetch(`api/draft-lock/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: bundlePathOf(path), kind, sessionId }),
  });
  // 423 (held-by-other) is a NORMAL result for this contract, not an error.
  const payload = (await response.json()) as AcquireDraftLockResult & { detail?: string };
  if (!response.ok && response.status !== 423) {
    throw new ApiError(payload.detail ?? `${response.status}`, response.status);
  }
  return payload;
}

export function acquireDraftLock(
  path: string,
  kind: DraftLockKind,
  sessionId: string,
): Promise<AcquireDraftLockResult> {
  assertWritable("Draft locking");
  return draftLockCall("acquire", path, kind, sessionId);
}

export function heartbeatDraftLock(
  path: string,
  kind: DraftLockKind,
  sessionId: string,
): Promise<AcquireDraftLockResult> {
  assertWritable("Draft locking");
  return draftLockCall("heartbeat", path, kind, sessionId);
}

export async function releaseDraftLock(
  path: string,
  kind: DraftLockKind,
  sessionId: string,
): Promise<void> {
  assertWritable("Draft locking");
  await postJson(`api/draft-lock/release`, { path: bundlePathOf(path), kind, sessionId });
}

// ---------------------------------------------------------------------------
// SSE change events (serve only)
// ---------------------------------------------------------------------------

/** One `/api/events` frame — mirrors docs-server's DocsChangeEvent. */
export type DocsChangeEventFrame = {
  path: string;
  changedIds: string[];
  patchId: string;
  actor: string;
};

function parseEventFrame(data: string): DocsChangeEventFrame | null {
  try {
    const parsed = JSON.parse(data) as Partial<DocsChangeEventFrame>;
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      path: typeof parsed.path === "string" ? parsed.path : "",
      changedIds: Array.isArray(parsed.changedIds)
        ? parsed.changedIds.filter((id): id is string => typeof id === "string")
        : [],
      patchId: typeof parsed.patchId === "string" ? parsed.patchId : "",
      actor: typeof parsed.actor === "string" ? parsed.actor : "",
    };
  } catch {
    return null;
  }
}

/**
 * Fallback SSE consumer over `fetch` streaming, for environments without a
 * native `EventSource` (happy-dom test/smoke runs). Only default (unnamed)
 * events are delivered — the server's named "connected"/"keepalive" frames
 * are dropped exactly like EventSource's `onmessage` would drop them.
 */
function subscribeViaFetchStream(
  url: string,
  onEvent: (event: DocsChangeEventFrame) => void,
): () => void {
  const controller = new AbortController();
  let stopped = false;
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const consume = async () => {
    while (!stopped) {
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: "text/event-stream" },
        });
        if (!response.ok || !response.body) throw new Error(`SSE connect failed: ${response.status}`);
        const reader = response.body.getReader();
        activeReader = reader;
        if (stopped) {
          await reader.cancel().catch(() => {});
          return;
        }
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          // Over a socket chunks are bytes; an in-process handler (tests,
          // smoke harnesses driving `app.handle`) may yield strings.
          buffer +=
            typeof value === "string" ? value : decoder.decode(value, { stream: true });
          let boundary: number;
          // SSE frames are separated by a blank line.
          while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
            const rawFrame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, "");
            let eventName = "message";
            const dataLines: string[] = [];
            for (const line of rawFrame.split(/\r?\n/)) {
              if (line.startsWith("event:")) eventName = line.slice(6).trim();
              else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
            }
            if (eventName !== "message" || dataLines.length === 0) continue;
            const frame = parseEventFrame(dataLines.join("\n"));
            if (frame) onEvent(frame);
          }
        }
      } catch {
        // Connection dropped/aborted — fall through to the reconnect delay.
      }
      if (stopped) return;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
    }
  };
  void consume();

  return () => {
    stopped = true;
    controller.abort();
    // Cancelling the reader resolves any pending read() with done:true even
    // when the server never observes the abort signal (in-process handlers).
    void activeReader?.cancel().catch(() => {});
  };
}

/**
 * Subscribes to the docs change-event stream. Frames published for THIS
 * tab's own mutations (actor === our session id) are filtered out — the
 * mutation response already updated local state.
 *
 * Returns an unsubscribe function. In static mode this is a no-op
 * subscription (no server, no stream).
 */
export function subscribeDocsEvents(
  onEvent: (event: DocsChangeEventFrame) => void,
): () => void {
  if (IS_STATIC) return () => {};
  const sessionId = getSessionId();
  const deliver = (frame: DocsChangeEventFrame) => {
    if (frame.actor === sessionId) return;
    onEvent(frame);
  };

  if (typeof EventSource !== "undefined") {
    const source = new EventSource(`api/events`);
    source.onmessage = (event) => {
      const frame = parseEventFrame(String(event.data));
      if (frame) deliver(frame);
    };
    return () => source.close();
  }
  return subscribeViaFetchStream(`api/events`, deliver);
}

// ---------------------------------------------------------------------------
// Serve config
// ---------------------------------------------------------------------------

/**
 * Workbench-level serve flags (today just `themeLocked` — see App's locked
 * boot path). Fails OPEN to unlocked: static exports have no server, and an
 * older serve without the route must keep today's behavior — only a serve
 * that positively answers locked gets the locked theme path.
 */
export async function getServeConfig(): Promise<{ themeLocked: boolean }> {
  if (IS_STATIC) return { themeLocked: false };
  try {
    const config = await fetchJson<{ themeLocked?: unknown }>(`api/serve-config`);
    return { themeLocked: config.themeLocked === true };
  } catch {
    return { themeLocked: false };
  }
}

// ---------------------------------------------------------------------------
// Theme folders (docs/20-implementation/40-theming)
// ---------------------------------------------------------------------------

export type ThemeListEntry = { id: string; name: string };

export type ThemeWirePayload = {
  id: string;
  manifest: Record<string, unknown>;
  components: Record<string, Record<string, unknown>>;
};

/** Repo themes/ catalogue; a static export ships no server, so no custom themes. */
export async function getThemes(): Promise<{ themes: ThemeListEntry[] }> {
  if (IS_STATIC) return { themes: [] };
  return fetchJson(`api/themes`);
}

export async function getTheme(id: string): Promise<{ theme: ThemeWirePayload }> {
  assertWritable("Loading a repo theme");
  return fetchJson(`api/themes/${encodeURIComponent(id)}`);
}

export async function saveTheme(
  payload: ThemeWirePayload,
): Promise<{ theme: ThemeWirePayload }> {
  assertWritable("Saving a theme");
  return postJson(`api/themes`, payload);
}
