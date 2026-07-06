import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

/**
 * Shared patch/inverse store (undo ledger). A stored patch is EITHER a
 * doc-ops patch (inverse = `DocOp[]`, replayed through `applyDocOpsToBundle`)
 * OR a canvas patch (inverse = the full pre-patch canvas snapshot, replayed
 * as a whole-document replace). Canvas patch operations don't carry a
 * generic per-op inverse the way `DocOp`s do — a whole-snapshot inverse is
 * the simplest thing that is ALWAYS correct (apply-then-undo) at the cost of
 * coarser undo granularity.
 *
 * In-memory, process-wide, single-use: undoing a patch consumes it
 * (matching a normal editor undo stack rather than a replayable log).
 * `path` is docs-root-relative; the docs root itself is supplied at undo
 * time by the caller that owns the store for that root.
 */
export type StoredPatch =
  | { kind: "doc"; path: string; inverse: DocOp[]; hashAfterApply: string; createdAt: string }
  | {
      kind: "canvas";
      path: string;
      priorSnapshot: InteractiveCanvasDocument;
      hashAfterApply: string;
      createdAt: string;
    };

const patchesById = new Map<string, StoredPatch>();

export function recordDocPatch(
  patchId: string,
  path: string,
  inverse: DocOp[],
  hashAfterApply: string,
): void {
  patchesById.set(patchId, {
    kind: "doc",
    path,
    inverse,
    hashAfterApply,
    createdAt: new Date().toISOString(),
  });
}

export function recordCanvasPatch(
  patchId: string,
  path: string,
  priorSnapshot: InteractiveCanvasDocument,
  hashAfterApply: string,
): void {
  patchesById.set(patchId, {
    kind: "canvas",
    path,
    priorSnapshot,
    hashAfterApply,
    createdAt: new Date().toISOString(),
  });
}

export function getStoredPatch(patchId: string): StoredPatch | undefined {
  return patchesById.get(patchId);
}

export function deleteStoredPatch(patchId: string): void {
  patchesById.delete(patchId);
}
