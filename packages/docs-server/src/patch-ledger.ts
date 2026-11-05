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

/**
 * The newest patches kept per docs root. Recording one more drops that root's
 * oldest, so a long-lived runtime holds a bounded ledger (a canvas or sequence
 * patch is a whole prior snapshot). Undo of a dropped patch fails with a clear
 * error: see `patchWasDropped`.
 */
export const MAX_PATCHES_PER_ROOT = 200;
/** Dropped ids remembered so undo can tell "dropped" from "never recorded". */
const MAX_DROPPED_REMEMBERED = 2000;

const patchesById = new Map<string, StoredPatch>();
/** Live patch ids per canonical docs root in record order: the first is the oldest. */
const idsByRoot = new Map<string, Set<string>>();
const droppedIds = new Set<string>();
let droppedTotal = 0;

/**
 * The patches that leave the ledger with `patchId`: it, and when it is a
 * compound or a member of one, that compound and its live members. A compound
 * then never outlives a member, so its undo is whole or reports it dropped.
 */
function evictionUnit(ids: Set<string>, patchId: string): Set<string> {
  const unit = new Set([patchId]);
  for (const id of ids) {
    const patch = patchesById.get(id);
    if (patch?.kind !== "compound" || (id !== patchId && !patch.patchIds.includes(patchId))) continue;
    unit.add(id);
    for (const memberId of patch.patchIds) if (ids.has(memberId)) unit.add(memberId);
  }
  return unit;
}

/** Open patch batches per canonical docs root: while one runs, that root drops nothing. */
const openBatchesByRoot = new Map<string, number>();

/**
 * Drop the root's oldest units until it holds MAX_PATCHES_PER_ROOT or fewer.
 * The unit of `keepId` stays even when it alone is larger than the cap.
 */
function trim(ids: Set<string>, keepId?: string): void {
  const keep = keepId === undefined ? new Set<string>() : evictionUnit(ids, keepId);
  while (ids.size > MAX_PATCHES_PER_ROOT) {
    const oldest = [...ids].find((id) => !keep.has(id));
    if (oldest === undefined) break;
    for (const dropped of evictionUnit(ids, oldest)) {
      ids.delete(dropped);
      patchesById.delete(dropped);
      droppedIds.add(dropped);
      droppedTotal++;
    }
    while (droppedIds.size > MAX_DROPPED_REMEMBERED) droppedIds.delete(droppedIds.values().next().value as string);
  }
}

/** Record a patch, dropping the root's oldest units beyond MAX_PATCHES_PER_ROOT. Re-recording an id makes it the newest. */
function store(patchId: string, patch: StoredPatch): void {
  const previous = patchesById.get(patchId);
  if (previous) idsByRoot.get(previous.docsRoot)?.delete(patchId);
  patchesById.set(patchId, patch);
  droppedIds.delete(patchId);
  let ids = idsByRoot.get(patch.docsRoot);
  if (!ids) idsByRoot.set(patch.docsRoot, (ids = new Set()));
  ids.add(patchId);
  if (!openBatchesByRoot.has(patch.docsRoot)) trim(ids, patchId);
}

/**
 * Run `work` as one patch batch on `docsRoot` (a change-set accept). The root
 * drops no patch while the batch runs, so a rollback can undo every step
 * however many there are. When the batch ends the root trims back to the cap,
 * and the unit of the id passed to `keep` (the batch's compound) stays.
 */
export async function withPatchBatch<T>(docsRoot: string, work: (keep: (patchId: string) => void) => Promise<T>): Promise<T> {
  const root = canonicalDocsRoot(docsRoot);
  let keepId: string | undefined;
  openBatchesByRoot.set(root, (openBatchesByRoot.get(root) ?? 0) + 1);
  try {
    return await work((patchId) => {
      keepId = patchId;
    });
  } finally {
    const open = openBatchesByRoot.get(root)! - 1;
    if (open > 0) openBatchesByRoot.set(root, open);
    else {
      openBatchesByRoot.delete(root);
      const ids = idsByRoot.get(root);
      if (ids) trim(ids, keepId);
    }
  }
}

/** Put a patch taken out with `deleteStoredPatch` back as the root's newest (a compound undo that failed part way). */
export function restoreStoredPatch(patchId: string, patch: StoredPatch): void {
  store(patchId, patch);
}

/** True when the ledger dropped this patch to stay within MAX_PATCHES_PER_ROOT (and nothing re-recorded it since). */
export function patchWasDropped(patchId: string): boolean {
  return droppedIds.has(patchId);
}

export function recordDocPatch(
  patchId: string,
  path: string,
  inverse: DocOp[],
  hashAfterApply: string,
  docsRoot: string,
): void {
  store(patchId, {
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
  store(patchId, {
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
  store(patchId, {
    docsRoot: canonicalDocsRoot(docsRoot),
    kind: "sequence",
    path,
    priorSnapshot,
    hashAfterApply,
    createdAt: new Date().toISOString(),
  });
}

export function recordCompoundPatch(patchId: string, patchIds: string[], docsRoot: string): void {
  store(patchId, {
    docsRoot: canonicalDocsRoot(docsRoot),
    kind: "compound",
    patchIds: [...patchIds],
    createdAt: new Date().toISOString(),
  });
}

export function recordTreePatch(patchId: string, inverse: TreeOpInverse, docsRoot: string): void {
  store(patchId, {
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
  store(patchId, {
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
  const patch = getStoredPatch(patchId, docsRoot);
  if (!patch) return;
  patchesById.delete(patchId);
  const ids = idsByRoot.get(patch.docsRoot);
  ids?.delete(patchId);
  if (ids?.size === 0) idsByRoot.delete(patch.docsRoot);
}

export type LedgerStats = {
  entries: number;
  byKind: Record<StoredPatch["kind"], number>;
  /** ISO time of the oldest stored patch, or null when the ledger is empty. */
  oldestAt: string | null;
  /** Patches dropped so far to keep each root within maxPerRoot. */
  dropped: number;
  maxPerRoot: number;
};

/** Ledger counts for health reporting: entries per kind, the oldest entry time and the drops. Counts only, no byte walk. */
export function ledgerStats(): LedgerStats {
  const byKind: LedgerStats["byKind"] = { doc: 0, canvas: 0, sequence: 0, tree: 0, sidecars: 0, compound: 0 };
  let oldestAt: string | null = null;
  for (const patch of patchesById.values()) {
    byKind[patch.kind]++;
    if (oldestAt === null || patch.createdAt < oldestAt) oldestAt = patch.createdAt;
  }
  return { entries: patchesById.size, byKind, oldestAt, dropped: droppedTotal, maxPerRoot: MAX_PATCHES_PER_ROOT };
}
