import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { serializeDocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { applyOps, type DocOp } from "@codecaine-ai/docs-model/doc-ops";
import type {
  CommentsDocument,
  CommentTarget,
  DocComment,
} from "@codecaine-ai/docs-model/comments-schema";
import { validateCommentsDocument } from "@codecaine-ai/docs-model/comments-schema";
import { resolveDocBundleJsonPath } from "@codecaine-ai/docs-index/paths";

import { withPathLock } from "./path-mutex";
import { atomicWriteFile } from "./atomic-write";
import { createContentHash } from "./content-hash";
import { draftLockStore, type DraftLockInfo } from "./draft-locks";
import {
  isValidCommentTarget,
  loadDocBundle,
  normalizeBundlePath,
  readCommentsSidecar,
  writeCommentsSidecar,
} from "./bundle";
import { indexDocSourceBestEffort } from "./backlinks-cache";
import { recordDocPatch } from "./patch-ledger";

/**
 * The docs mutation core: apply typed DocOps to a bundle's doc.json, and
 * add/resolve comments on its sidecar. Every mutation carries the full
 * contract: validate -> content-hash precondition (409) -> draft-lock
 * precondition (423) -> apply -> atomic persist -> record inverse in the
 * undo ledger -> (fire-and-forget) backlinks reindex. The entire
 * read-check-apply-write sequence runs inside `withPathLock`, keyed on the
 * target file's resolved absolute path, so two concurrent callers can never
 * both pass the hash check against the same pre-write state and race each
 * other's write.
 */

export type ApplyDocOpsResult =
  | { ok: true; doc: DocDocument; hash: string; patchId: string; inverse: DocOp[] }
  | {
      ok: false;
      status: number;
      detail: string;
      current_hash?: string;
      expected_hash?: string;
      issues?: unknown;
      held_by?: DraftLockInfo;
    };

/**
 * Applies a batch of typed DocOp mutations to a bundle's doc.json. The
 * `inverse` ops returned by applyOps are recorded in the shared undo ledger
 * keyed by a freshly minted `patchId`, so ANY successful apply — a UI save,
 * an agent tool call, a move-doc rewrite — is undoable through `undo_patch`.
 */
export async function applyDocOpsToBundle(
  docsRoot: string,
  path: string,
  ops: DocOp[],
  expectedHash: string | undefined,
  sessionId?: string,
): Promise<ApplyDocOpsResult> {
  const jsonAbs = resolveDocBundleJsonPath(docsRoot, path);
  if (!jsonAbs) {
    return { ok: false, status: 400, detail: `Invalid docs path: ${path}` };
  }

  return withPathLock(jsonAbs, async (): Promise<ApplyDocOpsResult> => {
    const loaded = await loadDocBundle(docsRoot, path);
    if ("error" in loaded) {
      return { ok: false, status: loaded.error.status, detail: loaded.error.detail };
    }
    if (expectedHash && expectedHash !== loaded.docHash) {
      return {
        ok: false,
        status: 409,
        detail: "Doc bundle is stale; reload before applying ops.",
        current_hash: loaded.docHash,
        expected_hash: expectedHash,
      };
    }

    const lockCheck = draftLockStore.checkForMutation(
      { kind: "doc", path: loaded.bundlePath },
      sessionId,
    );
    if (lockCheck.blocked) {
      return {
        ok: false,
        status: 423,
        detail: "Draft in progress — another session is editing this file.",
        held_by: lockCheck.heldBy,
      };
    }

    const result = applyOps(loaded.document, ops, () => randomUUID());
    if (!result.ok) {
      return { ok: false, status: 400, detail: "Doc ops failed to apply", issues: result.issues };
    }

    const serialized = serializeDocDocument(result.doc);
    await atomicWriteFile(loaded.jsonAbs, serialized);
    const hash = createContentHash(serialized);
    const patchId = randomUUID();
    recordDocPatch(patchId, loaded.bundlePath, result.inverse, hash);

    // Best-effort backlinks re-index — fire-and-forget, must never fail or
    // delay the save this just committed to disk.
    void indexDocSourceBestEffort(docsRoot, `${loaded.bundlePath}/doc.json`, result.doc);

    return { ok: true, doc: result.doc, hash, patchId, inverse: result.inverse };
  });
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export type BundleCommentsReadResult =
  | { ok: true; comments: CommentsDocument; hash: string | null }
  | { ok: false; status: number; detail: string };

/** Reads a bundle's comments sidecar ("no comments.json yet" is a valid empty state). */
export async function getBundleComments(
  docsRoot: string,
  path: string,
): Promise<BundleCommentsReadResult> {
  const jsonAbs = resolveDocBundleJsonPath(docsRoot, path);
  if (!jsonAbs) {
    return { ok: false, status: 400, detail: `Invalid docs path: ${path}` };
  }
  const commentsAbs = join(dirname(jsonAbs), "comments.json");
  const result = await readCommentsSidecar(commentsAbs);
  if ("error" in result) {
    return { ok: false, status: result.error.status, detail: result.error.detail };
  }
  return { ok: true, comments: result.comments, hash: result.hash };
}

export type AddBundleCommentInput = {
  target: unknown;
  body: string;
  intent: "note" | "agent-request";
  author: string;
  expectedHash?: string;
};

export type AddBundleCommentResult =
  | { ok: true; comment: DocComment; comments: CommentsDocument; hash: string }
  | {
      ok: false;
      status: number;
      detail: string;
      current_hash?: string;
      expected_hash?: string;
      held_by?: DraftLockInfo;
    };

/** Adds a comment to a bundle's sidecar (hash precondition + draft-lock guard). */
export async function addBundleComment(
  docsRoot: string,
  path: string,
  input: AddBundleCommentInput,
  sessionId?: string,
): Promise<AddBundleCommentResult> {
  const jsonAbs = resolveDocBundleJsonPath(docsRoot, path);
  if (!jsonAbs) {
    return { ok: false, status: 400, detail: `Invalid docs path: ${path}` };
  }
  if (!isValidCommentTarget(input.target)) {
    return { ok: false, status: 400, detail: "Comment target is invalid" };
  }
  const commentsAbs = join(dirname(jsonAbs), "comments.json");
  const bundlePath = normalizeBundlePath(path);

  return withPathLock(commentsAbs, async (): Promise<AddBundleCommentResult> => {
    const existing = await readCommentsSidecar(commentsAbs);
    if ("error" in existing) {
      return { ok: false, status: existing.error.status, detail: existing.error.detail };
    }
    if (input.expectedHash && input.expectedHash !== existing.hash) {
      return {
        ok: false,
        status: 409,
        detail: "Comments sidecar is stale; reload before adding a comment.",
        current_hash: existing.hash ?? undefined,
        expected_hash: input.expectedHash,
      };
    }

    const lockCheck = draftLockStore.checkForMutation({ kind: "doc", path: bundlePath }, sessionId);
    if (lockCheck.blocked) {
      return {
        ok: false,
        status: 423,
        detail: "Draft in progress — another session is editing this file.",
        held_by: lockCheck.heldBy,
      };
    }

    const comment: DocComment = {
      id: randomUUID(),
      target: input.target as CommentTarget,
      body: input.body,
      intent: input.intent,
      author: input.author,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    const nextDocument: CommentsDocument = {
      schemaVersion: 1,
      comments: [...existing.comments.comments, comment],
    };
    const validated = validateCommentsDocument(nextDocument);
    if (!validated.ok) {
      return {
        ok: false,
        status: 422,
        detail: `Comment failed schema validation: ${validated.issues
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("; ")}`,
      };
    }
    const written = await writeCommentsSidecar(commentsAbs, validated.document);
    return { ok: true, comment, comments: validated.document, hash: written.hash };
  });
}

export type ResolveBundleCommentResult =
  | { ok: true; comments: CommentsDocument; hash: string }
  | {
      ok: false;
      status: number;
      detail: string;
      current_hash?: string;
      expected_hash?: string;
      held_by?: DraftLockInfo;
    };

/**
 * Flips a comment to `resolved` (with an optional resolution note persisted
 * on the comment's additive `resolution` field). Hash precondition +
 * draft-lock guard, inside the sidecar's path lock.
 */
export async function resolveBundleComment(
  docsRoot: string,
  path: string,
  commentId: string,
  expectedHash: string | undefined,
  sessionId?: string,
  response?: string,
): Promise<ResolveBundleCommentResult> {
  const jsonAbs = resolveDocBundleJsonPath(docsRoot, path);
  if (!jsonAbs) {
    return { ok: false, status: 400, detail: `Invalid docs path: ${path}` };
  }
  const commentsAbs = join(dirname(jsonAbs), "comments.json");
  const bundlePath = normalizeBundlePath(path);

  return withPathLock(commentsAbs, async (): Promise<ResolveBundleCommentResult> => {
    const existing = await readCommentsSidecar(commentsAbs);
    if ("error" in existing) {
      return { ok: false, status: existing.error.status, detail: existing.error.detail };
    }
    if (expectedHash && expectedHash !== existing.hash) {
      return {
        ok: false,
        status: 409,
        detail: "Comments sidecar is stale; reload before resolving.",
        current_hash: existing.hash ?? undefined,
        expected_hash: expectedHash,
      };
    }
    const commentIndex = existing.comments.comments.findIndex((comment) => comment.id === commentId);
    if (commentIndex < 0) {
      return { ok: false, status: 404, detail: `Comment not found: ${commentId}` };
    }

    const lockCheck = draftLockStore.checkForMutation({ kind: "doc", path: bundlePath }, sessionId);
    if (lockCheck.blocked) {
      return {
        ok: false,
        status: 423,
        detail: "Draft in progress — another session is editing this file.",
        held_by: lockCheck.heldBy,
      };
    }

    const nextComments = existing.comments.comments.map((comment, index) =>
      index === commentIndex
        ? {
            ...comment,
            status: "resolved" as const,
            ...(response !== undefined ? { resolution: response } : {}),
          }
        : comment,
    );
    const nextDocument: CommentsDocument = { schemaVersion: 1, comments: nextComments };
    const validated = validateCommentsDocument(nextDocument);
    if (!validated.ok) {
      return {
        ok: false,
        status: 422,
        detail: `Comment failed schema validation: ${validated.issues
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("; ")}`,
      };
    }
    const written = await writeCommentsSidecar(commentsAbs, validated.document);
    return { ok: true, comments: validated.document, hash: written.hash };
  });
}

export type AttachAgentRunInput = {
  commentId: string;
  sessionId: string;
  patchId: string;
  summary: string;
  changedIds: string[];
};

export type AttachAgentRunResult =
  | { ok: true; comment: DocComment; comments: CommentsDocument; hash: string }
  | { ok: false; status: number; detail: string };

/**
 * Records a completed agent run on its originating comment
 * (`agentRun: {sessionId, patchId, summary, changedIds}`) and flips the
 * comment to `resolved`. No `expectedHash`/draft-lock precondition here: by
 * the time this is called, the host route has ALREADY applied the agent's
 * mutation via `doc_update_blocks`/`canvas_apply_patch` (which enforce the
 * hash + draft-lock preconditions on the DOC/CANVAS being edited) — this
 * step only writes to `comments.json`, a different file. Still runs inside
 * `withPathLock` on the sidecar so it can't race a concurrent comment
 * mutation.
 */
export async function attachAgentRunToComment(
  docsRoot: string,
  path: string,
  input: AttachAgentRunInput,
): Promise<AttachAgentRunResult> {
  const jsonAbs = resolveDocBundleJsonPath(docsRoot, path);
  if (!jsonAbs) {
    return { ok: false, status: 400, detail: `Invalid docs path: ${path}` };
  }
  const commentsAbs = join(dirname(jsonAbs), "comments.json");

  return withPathLock(commentsAbs, async (): Promise<AttachAgentRunResult> => {
    const existing = await readCommentsSidecar(commentsAbs);
    if ("error" in existing) {
      return { ok: false, status: existing.error.status, detail: existing.error.detail };
    }
    const commentIndex = existing.comments.comments.findIndex(
      (comment) => comment.id === input.commentId,
    );
    if (commentIndex < 0) {
      return { ok: false, status: 404, detail: `Comment not found: ${input.commentId}` };
    }

    let updatedComment: DocComment | undefined;
    const nextComments = existing.comments.comments.map((comment, index) => {
      if (index !== commentIndex) return comment;
      updatedComment = {
        ...comment,
        status: "resolved" as const,
        agentRun: {
          sessionId: input.sessionId,
          patchId: input.patchId,
          summary: input.summary,
          changedIds: input.changedIds,
        },
      };
      return updatedComment;
    });
    const nextDocument: CommentsDocument = { schemaVersion: 1, comments: nextComments };
    const validated = validateCommentsDocument(nextDocument);
    if (!validated.ok) {
      return {
        ok: false,
        status: 422,
        detail: `Comment failed schema validation: ${validated.issues
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("; ")}`,
      };
    }
    const written = await writeCommentsSidecar(commentsAbs, validated.document);
    if (!updatedComment) {
      return { ok: false, status: 500, detail: "Failed to attach agent run to comment" };
    }
    return { ok: true, comment: updatedComment, comments: validated.document, hash: written.hash };
  });
}
