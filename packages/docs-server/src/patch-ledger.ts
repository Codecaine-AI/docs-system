import { canonicalDocsRoot } from "./draft-locks";
import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
import type { SequenceDocument } from "@codecaine-ai/sequence/schema";
import type { TreeOpInverse } from "./changesets/tree-ops";

/**
 * Shared patch/inverse store (undo ledger). A stored patch is a doc-ops
 * inverse, a full prior canvas/sequence snapshot, or a compound entry that
 * orders member patch ids. Canvas and sequence operations don't carry a
 * generic per-op inverse the way `DocOp`s do — a whole-snapshot inverse is
 * the simplest thing that is ALWAYS correct (apply-then-undo) at the cost of
 * coarser undo granularity.
 *
 * In-memory, process-wide, single-use: undoing a patch consumes it
 * (matching a normal editor undo stack rather than a replayable log).
 * `path` is docs-root-relative. Every patch records its canonical docs root;
 * undo must match that root before reading or mutating any files.
 */
type PatchContent =
  | { kind: "doc"; path: string; inverse: DocOp[]; hashAfterApply: string; createdAt: string }
  | {
      kind: "canvas";
      path: string;
      priorSnapshot: InteractiveCanvasDocument;
      hashAfterApply: string;
      createdAt: string;
    }
  | {
      kind: "sequence";
      path: string;
      priorSnapshot: SequenceDocument;
      hashAfterApply: string;
      createdAt: string;
    }
  | { kind: "tree"; inverse: TreeOpInverse; createdAt: string }
  | {
      kind: "sidecars";
      files: Array<{
        path: string;
        beforeContent: string | null;
        hashAfterApply: string | null;
      }>;
      createdAt: string;
    }
  | { kind: "compound"; patchIds: string[]; createdAt: string };

export type StoredPatch = PatchContent & { docsRoot: string };

const patchesById = new Map<string, StoredPatch>();

export function recordDocPatch(
  patchId: string,
  path: string,
  inverse: DocOp[],
  hashAfterApply: string,
  docsRoot: string,
): void {
  patchesById.set(patchId, {
    docsRoot: canonicalDocsRoot(docsRoot),
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
  docsRoot: string,
): void {
  patchesById.set(patchId, {
    docsRoot: canonicalDocsRoot(docsRoot),
    kind: "canvas",
    path,
    priorSnapshot,
    hashAfterApply,
    createdAt: new Date().toISOString(),
  });
}

export function recordSequencePatch(
  patchId: string,
  path: string,
  priorSnapshot: SequenceDocument,
  hashAfterApply: string,
  docsRoot: string,
): void {
  patchesById.set(patchId, {
    docsRoot: canonicalDocsRoot(docsRoot),
    kind: "sequence",
    path,
    priorSnapshot,
    hashAfterApply,
    createdAt: new Date().toISOString(),
  });
}

export function recordCompoundPatch(patchId: string, patchIds: string[], docsRoot: string): void {
  patchesById.set(patchId, {
    docsRoot: canonicalDocsRoot(docsRoot),
    kind: "compound",
    patchIds: [...patchIds],
    createdAt: new Date().toISOString(),
  });
}

export function recordTreePatch(patchId: string, inverse: TreeOpInverse, docsRoot: string): void {
  patchesById.set(patchId, {
    docsRoot: canonicalDocsRoot(docsRoot),
    kind: "tree",
    inverse,
    createdAt: new Date().toISOString(),
  });
}

export function recordSidecarPatch(
  patchId: string,
  files: Extract<StoredPatch, { kind: "sidecars" }>["files"],
  docsRoot: string,
): void {
  patchesById.set(patchId, {
    docsRoot: canonicalDocsRoot(docsRoot),
    kind: "sidecars",
    files: files.map((file) => ({ ...file })),
    createdAt: new Date().toISOString(),
  });
}

export function getStoredPatch(patchId: string, docsRoot?: string): StoredPatch | undefined {
  const patch = patchesById.get(patchId);
  return docsRoot === undefined || patch?.docsRoot === canonicalDocsRoot(docsRoot) ? patch : undefined;
}

export function deleteStoredPatch(patchId: string, docsRoot: string): void {
  if (getStoredPatch(patchId, docsRoot)) patchesById.delete(patchId);
}
