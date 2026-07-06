import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
import { queryInboundTolerant, type BacklinkRow } from "@codecaine-ai/docs-index/backlinks";
import { moveDocBundle, type MoveDocDeps, type MoveDocResult } from "@codecaine-ai/docs-index/move-doc";

import { walkDocsDir, type DocsTreeNode } from "./docs-tree";
import {
  loadDocBundle,
  loadDocProjection,
  type DocBundleLoadError,
  type DocBundleLoadResult,
  type DocProjectionResult,
} from "./bundle";
import {
  addBundleComment,
  applyDocOpsToBundle,
  attachAgentRunToComment,
  getBundleComments,
  resolveBundleComment,
  type AddBundleCommentInput,
  type AddBundleCommentResult,
  type ApplyDocOpsResult,
  type AttachAgentRunInput,
  type AttachAgentRunResult,
  type BundleCommentsReadResult,
  type ResolveBundleCommentResult,
} from "./doc-ops";
import {
  readDocAsset,
  uploadDocAsset,
  type ReadDocAssetResult,
  type UploadDocAssetInput,
  type UploadDocAssetResult,
} from "./assets";
import {
  createCanvasSidecar,
  deleteCanvasSidecar,
  loadCanvasSidecarByDocPath,
  saveCanvasSidecar,
  type CanvasSidecarByDocPathError,
  type CanvasSidecarByDocPathLoadResult,
  type CreateCanvasSidecarInput,
  type CreateCanvasSidecarResult,
  type DeleteCanvasSidecarInput,
  type DeleteCanvasSidecarResult,
  type SaveCanvasSidecarInput,
  type SaveCanvasSidecarResult,
} from "./canvas-sidecar";
import {
  canvas_apply_patch,
  canvas_get,
  comment_list,
  comment_resolve,
  doc_get,
  undo_patch,
  type CanvasApplyPatchResult,
  type CanvasAgentPatchOperation,
  type CanvasGetResult,
  type CommentListResult,
  type CommentResolveResult,
  type DocGetResult,
  type UndoPatchResult,
} from "./agent-tools";
import { draftLockStore, type DraftLockStore } from "./draft-locks";
import {
  publishDocsChangeEvent,
  subscribeToDocsChangeEvents,
  type DocsChangeEvent,
} from "./docs-events";
import { getBacklinksDb } from "./backlinks-cache";

/**
 * `createDocsStore(docsRoot)` — the docs framework's single mutation
 * authority for one docs tree, bound to an explicit `docsRoot` (no host-app
 * concepts: no projects, no databases). Hosts resolve whatever scoping they
 * have (a project row, a CLI `--root` flag) down to a docs root and share
 * ONE store per root, so every caller — UI routes, agent tool calls, the
 * standalone workbench — converges on the same per-path mutex, the same
 * draft-lock store, the same undo ledger, and the same change-event stream.
 *
 * The underlying primitives keep their state at module level (one process =
 * one authority), so two stores created for the same root behave as one;
 * caching stores per root is an ergonomic optimization, not a correctness
 * requirement. Draft locks are process-wide and keyed `kind:path` — hosts
 * serving multiple roots share one lock namespace (identical to the
 * pre-extraction behavior of the reference host).
 */
export interface DocsStore {
  /** Resolved absolute docs root this store is bound to. */
  readonly docsRoot: string;
  /** The shared draft-lock store (acquire/heartbeat/release/checkForMutation). */
  readonly locks: DraftLockStore;

  // -- reads ---------------------------------------------------------------
  tree(): Promise<DocsTreeNode[]>;
  bundle(path: string): Promise<DocBundleLoadResult | DocBundleLoadError>;
  projection(path: string): Promise<DocProjectionResult | DocBundleLoadError>;
  comments(path: string): Promise<BundleCommentsReadResult>;
  docGet(path: string): Promise<DocGetResult>;
  canvasGet(src: string): Promise<CanvasGetResult>;
  canvasByDocPath(
    docPath: string,
    src: string,
  ): Promise<CanvasSidecarByDocPathLoadResult | CanvasSidecarByDocPathError>;
  commentList(path: string): Promise<CommentListResult>;
  readAsset(path: string): Promise<ReadDocAssetResult>;
  backlinks(target: string): Promise<BacklinkRow[]>;

  // -- writes --------------------------------------------------------------
  applyDocOps(
    path: string,
    ops: DocOp[],
    expectedHash?: string,
    sessionId?: string,
  ): Promise<ApplyDocOpsResult>;
  addComment(
    path: string,
    input: AddBundleCommentInput,
    sessionId?: string,
  ): Promise<AddBundleCommentResult>;
  resolveComment(
    path: string,
    commentId: string,
    expectedHash?: string,
    sessionId?: string,
    response?: string,
  ): Promise<ResolveBundleCommentResult>;
  commentResolve(
    path: string,
    commentId: string,
    expectedHash: string | undefined,
    actor?: string,
    response?: string,
  ): Promise<CommentResolveResult>;
  attachAgentRun(path: string, input: AttachAgentRunInput): Promise<AttachAgentRunResult>;
  uploadAsset(input: UploadDocAssetInput): Promise<UploadDocAssetResult>;
  saveCanvasSidecar(input: SaveCanvasSidecarInput): Promise<SaveCanvasSidecarResult>;
  createCanvasSidecar(input: CreateCanvasSidecarInput): Promise<CreateCanvasSidecarResult>;
  deleteCanvasSidecar(input: DeleteCanvasSidecarInput): Promise<DeleteCanvasSidecarResult>;
  applyCanvasPatch(
    src: string,
    operations: CanvasAgentPatchOperation[],
    expectedHash?: string,
    actor?: string,
  ): Promise<CanvasApplyPatchResult>;
  undoPatch(patchId: string): Promise<UndoPatchResult>;
  moveDoc(fromPath: string, toPath: string): Promise<MoveDocResult>;

  // -- change events ---------------------------------------------------------
  publishChange(event: DocsChangeEvent): void;
  subscribeChanges(listener: (event: DocsChangeEvent) => void): () => void;
}

export function createDocsStore(docsRoot: string): DocsStore {
  const root = resolve(docsRoot);
  // Change events are channeled per resolved docs root, so every store (and
  // every host) bound to the same tree shares one event stream.
  const channel = root;

  return {
    docsRoot: root,
    locks: draftLockStore,

    tree: () => walkDocsDir(root),
    bundle: (path) => loadDocBundle(root, path),
    projection: (path) => loadDocProjection(root, path),
    comments: (path) => getBundleComments(root, path),
    docGet: (path) => doc_get(root, path),
    canvasGet: (src) => canvas_get(root, src),
    canvasByDocPath: (docPath, src) => loadCanvasSidecarByDocPath(root, docPath, src),
    commentList: (path) => comment_list(root, path),
    readAsset: (path) => readDocAsset(root, path),
    backlinks: async (target) => queryInboundTolerant(await getBacklinksDb(root), target),

    applyDocOps: (path, ops, expectedHash, sessionId) =>
      applyDocOpsToBundle(root, path, ops, expectedHash, sessionId),
    addComment: (path, input, sessionId) => addBundleComment(root, path, input, sessionId),
    resolveComment: (path, commentId, expectedHash, sessionId, response) =>
      resolveBundleComment(root, path, commentId, expectedHash, sessionId, response),
    commentResolve: (path, commentId, expectedHash, actor, response) =>
      comment_resolve(root, path, commentId, expectedHash, actor, response),
    attachAgentRun: (path, input) => attachAgentRunToComment(root, path, input),
    uploadAsset: (input) => uploadDocAsset(root, input),
    saveCanvasSidecar: (input) => saveCanvasSidecar(root, input),
    createCanvasSidecar: (input) => createCanvasSidecar(root, input),
    deleteCanvasSidecar: (input) => deleteCanvasSidecar(root, input),
    applyCanvasPatch: (src, operations, expectedHash, actor) =>
      canvas_apply_patch(root, src, operations, expectedHash, actor),
    undoPatch: (patchId) => undo_patch(root, patchId),

    moveDoc: async (fromPath, toPath) => {
      const backlinksDb = await getBacklinksDb(root);
      const deps: MoveDocDeps = {
        // Adapter: move-doc's ApplyDocOpsFn still threads a legacy scope
        // string positionally; the store's doc-ops surface has no such
        // concept, so it is dropped here.
        applyDocOps: (docsRootArg, path, ops, expectedHash, _scope) =>
          applyDocOpsToBundle(docsRootArg, path, ops, expectedHash, undefined),
        loadCanvas: async (docsRootArg, canvasRelPath) => {
          try {
            const raw = await readFile(join(docsRootArg, canvasRelPath), "utf8");
            return { ok: true, canvas: JSON.parse(raw) as InteractiveCanvasDocument };
          } catch (error) {
            return { ok: false, reason: error instanceof Error ? error.message : String(error) };
          }
        },
        saveCanvas: async (docsRootArg, canvasRelPath, canvas) => {
          try {
            const abs = join(docsRootArg, canvasRelPath);
            await mkdir(dirname(abs), { recursive: true });
            await writeFile(abs, `${JSON.stringify(canvas, null, 2)}\n`, "utf8");
            return { ok: true };
          } catch (error) {
            return { ok: false, reason: error instanceof Error ? error.message : String(error) };
          }
        },
        backlinksDb,
        projectId: "",
      };
      return moveDocBundle(root, fromPath, toPath, deps);
    },

    publishChange: (event) => publishDocsChangeEvent(channel, event),
    subscribeChanges: (listener) => subscribeToDocsChangeEvents(channel, listener),
  };
}
