import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";
import { ACTION_REGISTRY, checkParams } from "@codecaine-ai/docs-model";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
import type { SequenceDocument } from "@codecaine-ai/sequence/schema";
import { queryInboundTolerant, type BacklinkRow } from "@codecaine-ai/docs-index/backlinks";
import { moveDocBundle, type MoveDocDeps, type MoveDocResult } from "@codecaine-ai/docs-index/move-doc";
import { resolveDocBundleJsonPath } from "@codecaine-ai/docs-index/paths";

import { walkDocsDir, type DocsTreeNode } from "./docs-tree";
import {
  loadDocBundle,
  loadDocProjection,
  type DocBundleLoadError,
  type DocBundleLoadResult,
  type DocProjectionResult,
} from "./bundle";
import {
  addBundleAnnotation,
  applyDocOpsToBundle,
  attachAgentRunToAnnotation,
  getBundleAnnotations,
  resolveBundleAnnotation,
  type AddBundleAnnotationInput,
  type AddBundleAnnotationResult,
  type ApplyDocOpsResult,
  type AttachAgentRunInput,
  type AttachAgentRunResult,
  type BundleAnnotationsReadResult,
  type ResolveBundleAnnotationResult,
} from "./doc-ops";
import {
  readDocAsset,
  uploadDocAsset,
  uploadDocVideoAsset,
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
  createSequenceSidecar,
  deleteSequenceSidecar,
  loadSequenceSidecarByDocPath,
  saveSequenceSidecar,
  type CreateSequenceSidecarInput,
  type CreateSequenceSidecarResult,
  type DeleteSequenceSidecarInput,
  type DeleteSequenceSidecarResult,
  type SaveSequenceSidecarInput,
  type SaveSequenceSidecarResult,
  type SequenceSidecarByDocPathError,
  type SequenceSidecarByDocPathLoadResult,
} from "./sequence-sidecar";
import {
  annotation_list,
  annotation_resolve,
  canvas_apply_patch,
  canvas_get,
  doc_get,
  sequence_apply_patch,
  sequence_get,
  undo_patch,
  type AnnotationListResult,
  type AnnotationResolveResult,
  type CanvasApplyPatchResult,
  type CanvasAgentPatchOperation,
  type CanvasGetResult,
  type DocGetResult,
  type SequenceAgentPatchOperation,
  type SequenceApplyPatchResult,
  type SequenceGetResult,
  type UndoPatchResult,
} from "./agent-tools";
import { draftLockStore, type DraftLockInfo, type DraftLockStore } from "./draft-locks";
import {
  resolveCanvasSidecarRelativePath,
  resolveSequenceSidecarRelativePath,
} from "./confine";
import { withPathLock } from "./path-mutex";
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
  annotations(path: string): Promise<BundleAnnotationsReadResult>;
  docGet(path: string): Promise<DocGetResult>;
  canvasGet(src: string): Promise<CanvasGetResult>;
  canvasByDocPath(
    docPath: string,
    src: string,
  ): Promise<CanvasSidecarByDocPathLoadResult | CanvasSidecarByDocPathError>;
  sequenceGet(src: string): Promise<SequenceGetResult>;
  sequenceByDocPath(
    docPath: string,
    src: string,
  ): Promise<SequenceSidecarByDocPathLoadResult | SequenceSidecarByDocPathError>;
  annotationList(path: string): Promise<AnnotationListResult>;
  readAsset(path: string): Promise<ReadDocAssetResult>;
  backlinks(target: string): Promise<BacklinkRow[]>;

  // -- writes --------------------------------------------------------------
  applyDocOps(
    path: string,
    ops: DocOp[],
    expectedHash?: string,
    sessionId?: string,
  ): Promise<ApplyDocOpsResult>;
  forwardCanvasAction(
    path: string,
    op: Extract<DocOp, { type: "componentAction" }>,
    expectedDocHash?: string,
    expectedCanvasHash?: string,
    sessionId?: string,
  ): Promise<ForwardCanvasActionResult>;
  forwardSequenceAction(
    path: string,
    op: Extract<DocOp, { type: "componentAction" }>,
    expectedDocHash?: string,
    expectedSequenceHash?: string,
    sessionId?: string,
  ): Promise<ForwardSequenceActionResult>;
  addAnnotation(
    path: string,
    input: AddBundleAnnotationInput,
    sessionId?: string,
  ): Promise<AddBundleAnnotationResult>;
  resolveAnnotation(
    path: string,
    annotationId: string,
    expectedHash?: string,
    sessionId?: string,
    response?: string,
  ): Promise<ResolveBundleAnnotationResult>;
  annotationResolve(
    path: string,
    annotationId: string,
    expectedHash: string | undefined,
    actor?: string,
    response?: string,
  ): Promise<AnnotationResolveResult>;
  attachAgentRun(path: string, input: AttachAgentRunInput): Promise<AttachAgentRunResult>;
  uploadAsset(input: UploadDocAssetInput): Promise<UploadDocAssetResult>;
  uploadVideoAsset(input: UploadDocAssetInput): Promise<UploadDocAssetResult>;
  saveCanvasSidecar(input: SaveCanvasSidecarInput): Promise<SaveCanvasSidecarResult>;
  createCanvasSidecar(input: CreateCanvasSidecarInput): Promise<CreateCanvasSidecarResult>;
  deleteCanvasSidecar(input: DeleteCanvasSidecarInput): Promise<DeleteCanvasSidecarResult>;
  saveSequenceSidecar(input: SaveSequenceSidecarInput): Promise<SaveSequenceSidecarResult>;
  createSequenceSidecar(input: CreateSequenceSidecarInput): Promise<CreateSequenceSidecarResult>;
  deleteSequenceSidecar(input: DeleteSequenceSidecarInput): Promise<DeleteSequenceSidecarResult>;
  applyCanvasPatch(
    src: string,
    operations: CanvasAgentPatchOperation[],
    expectedHash?: string,
    actor?: string,
  ): Promise<CanvasApplyPatchResult>;
  applySequencePatch(
    src: string,
    operations: SequenceAgentPatchOperation[],
    expectedHash?: string,
    actor?: string,
  ): Promise<SequenceApplyPatchResult>;
  undoPatch(patchId: string): Promise<UndoPatchResult>;
  moveDoc(fromPath: string, toPath: string): Promise<MoveDocResult>;

  // -- change events ---------------------------------------------------------
  publishChange(event: DocsChangeEvent): void;
  subscribeChanges(listener: (event: DocsChangeEvent) => void): () => void;
}

export type ForwardCanvasActionResult =
  | {
      ok: true;
      canvas: InteractiveCanvasDocument;
      canvasHash: string;
      patchId: string;
      changedIds: string[];
      canvasRelPath: string;
    }
  | {
      ok: false;
      status: number;
      detail: string;
      current_hash?: string;
      expected_hash?: string;
      held_by?: DraftLockInfo;
      issues?: unknown;
    };

async function forwardCanvasAction(
  docsRoot: string,
  path: string,
  op: Extract<DocOp, { type: "componentAction" }>,
  expectedDocHash?: string,
  expectedCanvasHash?: string,
  sessionId?: string,
): Promise<ForwardCanvasActionResult> {
  const docAbs = resolveDocBundleJsonPath(docsRoot, path);
  if (!docAbs) {
    return { ok: false, status: 400, detail: `Invalid docs path: ${path}` };
  }

  return withPathLock(docAbs, async (): Promise<ForwardCanvasActionResult> => {
    const loaded = await loadDocBundle(docsRoot, path);
    if ("error" in loaded) {
      return { ok: false, status: loaded.error.status, detail: loaded.error.detail };
    }
    if (expectedDocHash && expectedDocHash !== loaded.docHash) {
      return {
        ok: false,
        status: 409,
        detail: "Doc bundle is stale; reload before applying ops.",
        current_hash: loaded.docHash,
        expected_hash: expectedDocHash,
      };
    }

    const action = ACTION_REGISTRY.get(op.action);
    if (!action || !("forward" in action) || action.forward.authority !== "canvas") {
      return {
        ok: false,
        status: 400,
        detail: `Action "${op.action}" is not forwarded to the canvas authority.`,
      };
    }

    const block = loaded.document.blocks[op.blockId];
    if (!block) {
      const message = `componentAction target "${op.blockId}" does not exist.`;
      return {
        ok: false,
        status: 400,
        detail: message,
        issues: [{ path: "$.op.blockId", message }],
      };
    }
    if (block.type !== "canvas") {
      const message = `componentAction "${op.action}" targets "canvas" blocks, but "${op.blockId}" is a "${block.type}".`;
      return {
        ok: false,
        status: 400,
        detail: message,
        issues: [{ path: "$.op.blockId", message }],
      };
    }

    const params = op.params ?? {};
    const issues = checkParams(action, params);
    if (issues.length > 0) {
      return {
        ok: false,
        status: 400,
        detail: "Canvas action params failed validation.",
        issues,
      };
    }

    const source = block.props.src ?? block.props.canvasId;
    if (!block.props.src && typeof block.props.canvasId === "string") {
      return {
        ok: false,
        status: 400,
        detail: "Central canvas references are not routable by this server yet; only sidecar canvases are supported.",
      };
    }
    if (typeof source !== "string" || source.length === 0) {
      return {
        ok: false,
        status: 400,
        detail: `Canvas block "${op.blockId}" is missing a resolvable canvasId or src.`,
      };
    }

    // Bundle docs have no markdown filename, but canvas sidecars use the same
    // doc-directory-relative confinement rules as GET /api/canvas-by-doc. A
    // synthetic filename supplies only that directory context to the shared
    // resolver; it is never read from disk.
    const docPath = loaded.bundlePath ? `${loaded.bundlePath}/doc.mdx` : "doc.mdx";
    const canvasRelPath = resolveCanvasSidecarRelativePath(docPath, source);
    if (!canvasRelPath) {
      return {
        ok: false,
        status: 400,
        detail: `Invalid canvas sidecar path for ${path}: ${source}`,
      };
    }

    const operation = {
      ...params,
      type: op.action.slice("canvas.".length),
    } as CanvasAgentPatchOperation;
    const applied = await canvas_apply_patch(
      docsRoot,
      canvasRelPath,
      [operation],
      expectedCanvasHash,
      sessionId,
    );
    if (!applied.ok) return applied;

    return {
      ok: true,
      canvas: applied.canvas,
      canvasHash: applied.hash,
      patchId: applied.patchId,
      changedIds: applied.changedIds,
      canvasRelPath,
    };
  });
}

export type ForwardSequenceActionResult =
  | {
      ok: true;
      sequence: SequenceDocument;
      sequenceHash: string;
      patchId: string;
      changedIds: string[];
      sequenceRelPath: string;
    }
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
 * Sequence counterpart of `forwardCanvasAction`: routes a doc-level
 * `componentAction` whose action forwards to the "sequence" authority onto the
 * referenced sidecar via `sequence_apply_patch`, under the doc bundle's path
 * lock with the doc-hash precondition checked first.
 */
async function forwardSequenceAction(
  docsRoot: string,
  path: string,
  op: Extract<DocOp, { type: "componentAction" }>,
  expectedDocHash?: string,
  expectedSequenceHash?: string,
  sessionId?: string,
): Promise<ForwardSequenceActionResult> {
  const docAbs = resolveDocBundleJsonPath(docsRoot, path);
  if (!docAbs) {
    return { ok: false, status: 400, detail: `Invalid docs path: ${path}` };
  }

  return withPathLock(docAbs, async (): Promise<ForwardSequenceActionResult> => {
    const loaded = await loadDocBundle(docsRoot, path);
    if ("error" in loaded) {
      return { ok: false, status: loaded.error.status, detail: loaded.error.detail };
    }
    if (expectedDocHash && expectedDocHash !== loaded.docHash) {
      return {
        ok: false,
        status: 409,
        detail: "Doc bundle is stale; reload before applying ops.",
        current_hash: loaded.docHash,
        expected_hash: expectedDocHash,
      };
    }

    const action = ACTION_REGISTRY.get(op.action);
    if (!action || !("forward" in action) || action.forward.authority !== "sequence") {
      return {
        ok: false,
        status: 400,
        detail: `Action "${op.action}" is not forwarded to the sequence authority.`,
      };
    }

    const block = loaded.document.blocks[op.blockId];
    if (!block) {
      const message = `componentAction target "${op.blockId}" does not exist.`;
      return {
        ok: false,
        status: 400,
        detail: message,
        issues: [{ path: "$.op.blockId", message }],
      };
    }
    if (block.type !== "sequence") {
      const message = `componentAction "${op.action}" targets "sequence" blocks, but "${op.blockId}" is a "${block.type}".`;
      return {
        ok: false,
        status: 400,
        detail: message,
        issues: [{ path: "$.op.blockId", message }],
      };
    }

    const params = op.params ?? {};
    const issues = checkParams(action, params);
    if (issues.length > 0) {
      return {
        ok: false,
        status: 400,
        detail: "Sequence action params failed validation.",
        issues,
      };
    }

    const source = block.props.src ?? block.props.sequenceId;
    if (!block.props.src && typeof block.props.sequenceId === "string") {
      return {
        ok: false,
        status: 400,
        detail:
          "Central sequence references are not routable by this server yet; only sidecar sequences are supported.",
      };
    }
    if (typeof source !== "string" || source.length === 0) {
      return {
        ok: false,
        status: 400,
        detail: `Sequence block "${op.blockId}" is missing a resolvable sequenceId or src.`,
      };
    }

    // Same synthetic-filename trick as the canvas forward: bundle docs have
    // no markdown filename, so a synthetic `doc.mdx` supplies only the
    // directory context to the shared doc-relative resolver.
    const docPath = loaded.bundlePath ? `${loaded.bundlePath}/doc.mdx` : "doc.mdx";
    const sequenceRelPath = resolveSequenceSidecarRelativePath(docPath, source);
    if (!sequenceRelPath) {
      return {
        ok: false,
        status: 400,
        detail: `Invalid sequence sidecar path for ${path}: ${source}`,
      };
    }

    const operation = {
      ...params,
      type: op.action.slice("sequence.".length),
    } as SequenceAgentPatchOperation;
    const applied = await sequence_apply_patch(
      docsRoot,
      sequenceRelPath,
      [operation],
      expectedSequenceHash,
      sessionId,
    );
    if (!applied.ok) return applied;

    return {
      ok: true,
      sequence: applied.sequence,
      sequenceHash: applied.hash,
      patchId: applied.patchId,
      changedIds: applied.changedIds,
      sequenceRelPath,
    };
  });
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
    annotations: (path) => getBundleAnnotations(root, path),
    docGet: (path) => doc_get(root, path),
    canvasGet: (src) => canvas_get(root, src),
    canvasByDocPath: (docPath, src) => loadCanvasSidecarByDocPath(root, docPath, src),
    sequenceGet: (src) => sequence_get(root, src),
    sequenceByDocPath: (docPath, src) => loadSequenceSidecarByDocPath(root, docPath, src),
    annotationList: (path) => annotation_list(root, path),
    readAsset: (path) => readDocAsset(root, path),
    backlinks: async (target) => queryInboundTolerant(await getBacklinksDb(root), target),

    applyDocOps: (path, ops, expectedHash, sessionId) =>
      applyDocOpsToBundle(root, path, ops, expectedHash, sessionId),
    forwardCanvasAction: (path, op, expectedDocHash, expectedCanvasHash, sessionId) =>
      forwardCanvasAction(root, path, op, expectedDocHash, expectedCanvasHash, sessionId),
    forwardSequenceAction: (path, op, expectedDocHash, expectedSequenceHash, sessionId) =>
      forwardSequenceAction(root, path, op, expectedDocHash, expectedSequenceHash, sessionId),
    addAnnotation: (path, input, sessionId) => addBundleAnnotation(root, path, input, sessionId),
    resolveAnnotation: (path, annotationId, expectedHash, sessionId, response) =>
      resolveBundleAnnotation(root, path, annotationId, expectedHash, sessionId, response),
    annotationResolve: (path, annotationId, expectedHash, actor, response) =>
      annotation_resolve(root, path, annotationId, expectedHash, actor, response),
    attachAgentRun: (path, input) => attachAgentRunToAnnotation(root, path, input),
    uploadAsset: (input) => uploadDocAsset(root, input),
    uploadVideoAsset: (input) => uploadDocVideoAsset(root, input),
    saveCanvasSidecar: (input) => saveCanvasSidecar(root, input),
    createCanvasSidecar: (input) => createCanvasSidecar(root, input),
    deleteCanvasSidecar: (input) => deleteCanvasSidecar(root, input),
    saveSequenceSidecar: (input) => saveSequenceSidecar(root, input),
    createSequenceSidecar: (input) => createSequenceSidecar(root, input),
    deleteSequenceSidecar: (input) => deleteSequenceSidecar(root, input),
    applyCanvasPatch: (src, operations, expectedHash, actor) =>
      canvas_apply_patch(root, src, operations, expectedHash, actor),
    applySequencePatch: (src, operations, expectedHash, actor) =>
      sequence_apply_patch(root, src, operations, expectedHash, actor),
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
