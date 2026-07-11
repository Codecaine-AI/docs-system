/**
 * Typed action tools — the ONLY mutation authority for docs/canvas/comments.
 * Host UI routes AND agent runtimes converge on these exact functions, so
 * every caller gets the same preconditions (content-hash check + draft-lock
 * check), the same per-path serialization (`withPathLock`), the same atomic
 * writes (`atomicWriteFile`), and the same inverse-op bookkeeping (the
 * shared patch ledger) — there is no separate, duplicated "agent mutation
 * path".
 *
 * These are thin, named wrappers around the hardened `docsRoot`-scoped
 * functions in `doc-ops.ts`/`bundle.ts`, plus the canvas-patch tool that
 * gives canvas mutations the same lock/atomic-write/draft-lock/inverse
 * treatment the doc-ops path has.
 */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readFile, stat } from "node:fs/promises";

import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";
import { projectToMarkdown } from "@codecaine-ai/docs-model/project-markdown";
import type { CommentsDocument, DocComment } from "@codecaine-ai/docs-model/comments-schema";
import { fitContainerToChildren } from "@codecaine-ai/canvas/geometry";
import {
  validateInteractiveCanvasDocument,
  type InteractiveCanvasDocument,
} from "@codecaine-ai/canvas/schema";
import type { CanvasAgentPatchOperation } from "@codecaine-ai/canvas/actions";

import { withPathLock } from "./path-mutex";
import { atomicWriteFile } from "./atomic-write";
import { createContentHash } from "./content-hash";
import { draftLockStore, type DraftLockInfo } from "./draft-locks";
import { loadDocBundle } from "./bundle";
import { resolveCanvasSidecarRootRelativePath } from "./confine";
import {
  addBundleComment,
  applyDocOpsToBundle,
  getBundleComments,
  resolveBundleComment,
  type ApplyDocOpsResult,
} from "./doc-ops";
import {
  deleteStoredPatch,
  getStoredPatch,
  recordCanvasPatch,
} from "./patch-ledger";

// Re-export the ledger surface so tool consumers only need this module.
export {
  deleteStoredPatch,
  getStoredPatch,
  recordCanvasPatch,
  recordDocPatch,
  type StoredPatch,
} from "./patch-ledger";

// ---------------------------------------------------------------------------
// doc_get
// ---------------------------------------------------------------------------

export type DocGetResult =
  | { ok: true; doc: DocDocument; hash: string; markdown: string; bundlePath: string }
  | { ok: false; status: number; detail: string };

/**
 * `doc_get(docPath)` — loads a doc bundle and its markdown projection. Pure
 * read, no lock needed.
 */
export async function doc_get(docsRoot: string, docPath: string): Promise<DocGetResult> {
  const loaded = await loadDocBundle(docsRoot, docPath);
  if ("error" in loaded) {
    return { ok: false, status: loaded.error.status, detail: loaded.error.detail };
  }
  return {
    ok: true,
    doc: loaded.document,
    hash: loaded.docHash,
    markdown: projectToMarkdown(loaded.document),
    bundlePath: loaded.bundlePath,
  };
}

// ---------------------------------------------------------------------------
// doc_update_blocks
// ---------------------------------------------------------------------------

export type DocUpdateBlocksResult = ApplyDocOpsResult;

/**
 * `doc_update_blocks(docPath, ops[], expectedHash, actor)` — the ONLY way
 * any caller (UI editor save OR agent tool call) mutates a doc bundle. A
 * direct pass-through to `applyDocOpsToBundle`, which carries the full
 * mutation contract: validate -> hash precondition -> draft-lock
 * precondition -> apply -> atomic persist -> record inverse -> reindex.
 * `actor` is threaded as the draft-lock `sessionId` so an agent run is
 * blocked by a live foreign (human editor) lock exactly like any other
 * foreign session would be, and an editor's own in-progress session is
 * never blocked by its own lock.
 */
export async function doc_update_blocks(
  docsRoot: string,
  docPath: string,
  ops: DocOp[],
  expectedHash: string | undefined,
  actor?: string,
): Promise<DocUpdateBlocksResult> {
  return applyDocOpsToBundle(docsRoot, docPath, ops, expectedHash, actor);
}

// ---------------------------------------------------------------------------
// canvas_get
// ---------------------------------------------------------------------------

export type CanvasGetResult =
  | { ok: true; canvas: InteractiveCanvasDocument; hash: string; canvasRelPath: string }
  | { ok: false; status: number; detail: string };

type CanvasSidecarLoad =
  | { ok: true; canvas: InteractiveCanvasDocument; raw: string; hash: string }
  | { ok: false; status: number; detail: string };

/**
 * Shared stat -> read -> parse -> validate loader for a canvas sidecar's
 * ALREADY-RESOLVED absolute path. Both `canvas_get` and `canvas_apply_patch`
 * converge on this (apply calls it INSIDE its `withPathLock` section), so
 * both read paths share the stat/isFile guard, the identical error taxonomy
 * (404 missing / 422 bad JSON / 422 schema), and one content-hash
 * derivation. `canvasPath` is only used for error messages.
 */
async function loadCanvasSidecar(canvasAbs: string, canvasPath: string): Promise<CanvasSidecarLoad> {
  let raw: string;
  try {
    const st = await stat(canvasAbs);
    if (!st.isFile()) {
      return { ok: false, status: 404, detail: `Canvas sidecar is not a file: ${canvasPath}` };
    }
    raw = await readFile(canvasAbs, "utf8");
  } catch {
    return { ok: false, status: 404, detail: `Canvas sidecar not found: ${canvasPath}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, status: 422, detail: `Canvas sidecar is not valid JSON: ${canvasPath}` };
  }
  const validated = validateInteractiveCanvasDocument(parsed);
  if (!validated.ok) {
    return {
      ok: false,
      status: 422,
      detail: `Canvas sidecar failed schema validation: ${validated.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    };
  }
  return { ok: true, canvas: validated.document, raw, hash: createContentHash(raw) };
}

/**
 * `canvas_get(canvasPath, view?)`. `canvasPath` is resolved root-relative
 * (via `resolveCanvasSidecarRootRelativePath`) rather than relative to a
 * specific referencing doc — a standalone tool call has no "current doc"
 * context to resolve against. `view` is accepted for forward-compatibility
 * with a future viewport-scoped subset projection but the full document is
 * returned; narrowing is left to the caller.
 */
export async function canvas_get(
  docsRoot: string,
  canvasPath: string,
  _view?: string,
): Promise<CanvasGetResult> {
  const canvasRelPath = resolveCanvasSidecarRootRelativePath(docsRoot, canvasPath);
  if (!canvasRelPath) {
    return { ok: false, status: 400, detail: `Invalid canvas sidecar path: ${canvasPath}` };
  }
  const canvasAbs = join(docsRoot, canvasRelPath);
  const loaded = await loadCanvasSidecar(canvasAbs, canvasPath);
  if (!loaded.ok) {
    return loaded;
  }
  return {
    ok: true,
    canvas: loaded.canvas,
    hash: loaded.hash,
    canvasRelPath,
  };
}

// ---------------------------------------------------------------------------
// canvas_apply_patch
// ---------------------------------------------------------------------------

// Wire-format patch operation vocabulary for `canvas_apply_patch` — reuses
// the canvas package's `CanvasAgentPatchOperation` union so the client-side
// canvas engine and the server-side tool speak the exact same operation
// shape — re-exported here so tool consumers only need to import from
// `agent-tools.ts`.
export type { CanvasAgentPatchOperation };

function applyCanvasPatchOperation(
  document: InteractiveCanvasDocument,
  operation: CanvasAgentPatchOperation,
): { document: InteractiveCanvasDocument; changedIds: string[] } {
  switch (operation.type) {
    case "addObject":
      return {
        document: { ...document, objects: [...document.objects, operation.object] },
        changedIds: [operation.object.id],
      };
    case "updateObject": {
      let changed = false;
      const objects = document.objects.map((object) => {
        if (object.id !== operation.objectId) return object;
        changed = true;
        return {
          ...object,
          ...operation.patch,
          id: object.id,
          // Mirror the client reducer's `canvas.updateObject` semantics:
          // `style` is DEEP-merged so a partial style patch (e.g.
          // `{style: {fill}}`) augments the object's existing style instead
          // of replacing it wholesale and dropping stroke/shape/etc.
          style: operation.patch.style
            ? { ...object.style, ...operation.patch.style }
            : object.style,
        };
      });
      return { document: { ...document, objects }, changedIds: changed ? [operation.objectId] : [] };
    }
    case "addConnection":
      return {
        document: { ...document, connections: [...document.connections, operation.connection] },
        changedIds: [operation.connection.id],
      };
    case "addAnnotation":
      return {
        document: {
          ...document,
          annotations: [...(document.annotations ?? []), operation.annotation],
        },
        changedIds: [operation.annotation.id],
      };
    case "fitContainerToChildren":
      return {
        document: fitContainerToChildren(document, operation.containerId, operation.padding),
        changedIds: [operation.containerId],
      };
    default: {
      const _exhaustive: never = operation;
      return { document, changedIds: [] };
    }
  }
}

export type CanvasApplyPatchResult =
  | { ok: true; canvas: InteractiveCanvasDocument; hash: string; patchId: string; changedIds: string[] }
  | {
      ok: false;
      status: number;
      detail: string;
      current_hash?: string;
      expected_hash?: string;
      held_by?: DraftLockInfo;
      issues?: unknown;
    };

/**
 * `canvas_apply_patch(canvasPath, actions[], expectedHash, actor)` — the
 * canvas-side counterpart to `doc_update_blocks`, carrying the SAME mutation
 * contract: validate -> hash precondition -> draft-lock precondition ->
 * apply -> atomic persist -> store inverse (full prior snapshot, see
 * `StoredPatch`) -> return. Entire read-check-write sequence runs inside
 * `withPathLock` keyed on the resolved absolute sidecar path, exactly
 * mirroring `applyDocOpsToBundle`'s lost-update fix.
 */
export async function canvas_apply_patch(
  docsRoot: string,
  canvasPath: string,
  operations: CanvasAgentPatchOperation[],
  expectedHash: string | undefined,
  actor?: string,
): Promise<CanvasApplyPatchResult> {
  const canvasRelPath = resolveCanvasSidecarRootRelativePath(docsRoot, canvasPath);
  if (!canvasRelPath) {
    return { ok: false, status: 400, detail: `Invalid canvas sidecar path: ${canvasPath}` };
  }
  const canvasAbs = join(docsRoot, canvasRelPath);

  return withPathLock(canvasAbs, async (): Promise<CanvasApplyPatchResult> => {
    const loaded = await loadCanvasSidecar(canvasAbs, canvasPath);
    if (!loaded.ok) {
      return loaded;
    }
    const currentHash = loaded.hash;
    if (expectedHash && expectedHash !== currentHash) {
      return {
        ok: false,
        status: 409,
        detail: "Canvas sidecar is stale; reload before applying a patch.",
        current_hash: currentHash,
        expected_hash: expectedHash,
      };
    }

    const lockCheck = draftLockStore.checkForMutation({ kind: "canvas", path: canvasRelPath }, actor);
    if (lockCheck.blocked) {
      return {
        ok: false,
        status: 423,
        detail: "Draft in progress — another session is editing this file.",
        held_by: lockCheck.heldBy,
      };
    }

    let nextDocument = loaded.canvas;
    const priorSnapshot = loaded.canvas;
    const changedIds: string[] = [];
    for (const operation of operations) {
      const applied = applyCanvasPatchOperation(nextDocument, operation);
      nextDocument = applied.document;
      changedIds.push(...applied.changedIds);
    }

    const revalidated = validateInteractiveCanvasDocument(nextDocument);
    if (!revalidated.ok) {
      return {
        ok: false,
        status: 400,
        detail: "Canvas patch produced an invalid document",
        issues: revalidated.issues,
      };
    }

    const content = `${JSON.stringify(revalidated.document, null, 2)}\n`;
    await atomicWriteFile(canvasAbs, content);
    const hash = createContentHash(content);
    const patchId = randomUUID();
    recordCanvasPatch(patchId, canvasRelPath, priorSnapshot, hash);

    return {
      ok: true,
      canvas: revalidated.document,
      hash,
      patchId,
      changedIds: [...new Set(changedIds)],
    };
  });
}

// ---------------------------------------------------------------------------
// undo_patch
// ---------------------------------------------------------------------------

export type UndoPatchResult =
  | { ok: true; kind: "doc"; doc: DocDocument; hash: string }
  | { ok: true; kind: "canvas"; canvas: InteractiveCanvasDocument; hash: string }
  | { ok: false; status: number; detail: string; current_hash?: string };

/**
 * `undo_patch(patchId)` — undo FAILS LOUDLY rather than force-applying.
 * Replays a previously-recorded patch's inverse through the SAME mutation
 * boundary the original apply used:
 *
 * - doc patches: the stored `inverse: DocOp[]` is replayed via
 *   `applyDocOpsToBundle`, passing `hashAfterApply` as `expectedHash` — so if
 *   the doc changed since the patch was applied, the precondition check
 *   inside `applyDocOpsToBundle` itself returns 409 and the write never
 *   happens.
 * - canvas patches: the stored `priorSnapshot` is written back as a whole
 *   -document replace, but ONLY after verifying the current on-disk hash
 *   still equals `hashAfterApply`. Runs inside `withPathLock` for the same
 *   lost-update protection every other canvas write gets.
 *
 * On success, the patch is removed from the ledger (a patch can only be
 * undone once — undoing consumes it).
 */
export async function undo_patch(docsRoot: string, patchId: string): Promise<UndoPatchResult> {
  const stored = getStoredPatch(patchId);
  if (!stored) {
    return { ok: false, status: 404, detail: `No undoable patch found for id: ${patchId}` };
  }

  if (stored.kind === "doc") {
    const result = await applyDocOpsToBundle(
      docsRoot,
      stored.path,
      stored.inverse,
      stored.hashAfterApply,
      undefined,
      { validateProps: false },
    );
    if (!result.ok) {
      return {
        ok: false,
        status: result.status,
        detail:
          result.status === 409
            ? "Cannot undo: the document changed since this patch was applied."
            : result.detail,
        current_hash: result.current_hash,
      };
    }
    deleteStoredPatch(patchId);
    return { ok: true, kind: "doc", doc: result.doc, hash: result.hash };
  }

  const canvasAbs = join(docsRoot, stored.path);
  return withPathLock(canvasAbs, async (): Promise<UndoPatchResult> => {
    let raw: string;
    try {
      raw = await readFile(canvasAbs, "utf8");
    } catch {
      return { ok: false, status: 404, detail: `Canvas sidecar not found: ${stored.path}` };
    }
    const currentHash = createContentHash(raw);
    if (currentHash !== stored.hashAfterApply) {
      return {
        ok: false,
        status: 409,
        detail: "Cannot undo: the canvas changed since this patch was applied.",
        current_hash: currentHash,
      };
    }
    const content = `${JSON.stringify(stored.priorSnapshot, null, 2)}\n`;
    await atomicWriteFile(canvasAbs, content);
    const hash = createContentHash(content);
    deleteStoredPatch(patchId);
    return { ok: true, kind: "canvas", canvas: stored.priorSnapshot, hash };
  });
}

// ---------------------------------------------------------------------------
// comment_list / comment_resolve
// ---------------------------------------------------------------------------

export type CommentListResult =
  | { ok: true; comments: DocComment[]; hash: string | null }
  | { ok: false; status: number; detail: string };

/** `comment_list(docPath)` — pass-through to `getBundleComments`. */
export async function comment_list(docsRoot: string, docPath: string): Promise<CommentListResult> {
  const result = await getBundleComments(docsRoot, docPath);
  if (!result.ok) return result;
  return { ok: true, comments: result.comments.comments, hash: result.hash };
}

export type CommentResolveResult =
  | { ok: true; comments: CommentsDocument; hash: string }
  | { ok: false; status: number; detail: string; current_hash?: string; held_by?: DraftLockInfo };

/**
 * `comment_resolve(commentId, response?)` — pass-through to
 * `resolveBundleComment`. `response` (an optional agent/human note on why
 * the comment resolved) is persisted onto the comment's additive
 * `resolution` field alongside the status flip.
 */
export async function comment_resolve(
  docsRoot: string,
  docPath: string,
  commentId: string,
  expectedHash: string | undefined,
  actor?: string,
  response?: string,
): Promise<CommentResolveResult> {
  return resolveBundleComment(docsRoot, docPath, commentId, expectedHash, actor, response);
}

// Re-export so callers only need to import from this one module for the
// whole typed-tool surface.
export { addBundleComment };
