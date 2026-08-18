import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { resolveDocBundleJsonPath } from "@codecaine-ai/docs-index/paths";
import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";

import { undo_patch } from "../agent-tools";
import { atomicWriteFile } from "../atomic-write";
import { attachAgentRunToAnnotation, resolveBundleAnnotation } from "../doc-ops";
import type { DocsChangeEvent } from "../docs-events";
import { draftLockStore } from "../draft-locks";
import {
  deleteStoredPatch,
  getStoredPatch,
  recordCompoundPatch,
  recordSidecarPatch,
  recordTreePatch,
} from "../patch-ledger";
import { withPathLock } from "../path-mutex";
import {
  PROPOSALS_SIDECAR_FILENAME,
  acceptBundleProposal,
  getBundleProposals,
  rejectBundleProposal,
  type DocProposal,
} from "../proposal-ops";
import {
  CHANGESETS_DIRECTORY,
  createChangeSetRecord,
  listChangeSetRecords,
  readChangeSetRecord,
  writeChangeSetRecord,
  type ChangeSetSidecarFailure,
  type CreateDocChangeSetInput,
  type DocChangeSet,
  type DocChangeSetEntry,
  type PositionedDocChangeSetTreeOp,
} from "./changesets-sidecar";
import { createContentHash } from "../content-hash";
import { applyAnnotationMigrations, prepareAnnotationMigrations } from "./annotation-migrations";
import { executeTreeOp } from "./tree-ops";

export type DocChangeSetEntryView = {
  docPath: string;
  proposalId: string;
  status: "staged" | "accepted" | "rejected" | "missing";
  stale: boolean;
  summary: string;
  addCount: number;
  delCount: number;
};

export type DocChangeSetView = Omit<DocChangeSet, "entries"> & {
  entries: DocChangeSetEntryView[];
  progress: { accepted: number; total: number };
};

export type ChangeSetFailure = {
  ok: false;
  status: number;
  detail: string;
};

export type ChangeSetAcceptEntryResult = {
  kind: "entry";
  index: number;
  docPath: string;
  proposalId: string;
  ok: boolean;
  status?: number;
  detail?: string;
  patchId?: string;
  skipped?: boolean;
  rolledBack?: boolean;
};

export type ChangeSetAcceptTreeOpResult = {
  kind: "tree-op";
  index: number;
  position: number;
  op: PositionedDocChangeSetTreeOp;
  ok: boolean;
  status?: number;
  detail?: string;
  failures?: Array<{ sourcePath: string; reason: string }>;
  rolledBack?: boolean;
};

export type ChangeSetAcceptStepResult =
  | ChangeSetAcceptEntryResult
  | ChangeSetAcceptTreeOpResult;

export type ChangeSetRollbackFailure = {
  kind: "entry" | "tree-op" | "proposal";
  detail: string;
  patchId?: string;
  docPath?: string;
  proposalId?: string;
  failures?: Array<{ sourcePath: string; reason: string }>;
};

export type AcceptChangeSetOptions = {
  sessionId?: string;
  publishChange?: (event: DocsChangeEvent) => void;
};

export type AcceptChangeSetResult =
  | {
      ok: true;
      changeset: DocChangeSetView;
      patchId: string;
      results: ChangeSetAcceptStepResult[];
      annotationFailure?: { status: number; detail: string };
    }
  | (ChangeSetFailure & {
      failedEntry?: DocChangeSetEntry;
      failedTreeOp?: PositionedDocChangeSetTreeOp;
      results: ChangeSetAcceptStepResult[];
      rolledBack: true;
      rollbackFailures?: ChangeSetRollbackFailure[];
    });

export type RejectChangeSetEntryResult = {
  docPath: string;
  proposalId: string;
  ok: boolean;
  status?: number;
  detail?: string;
  tolerated?: boolean;
};

export type RejectChangeSetResult =
  | { ok: true; changeset: DocChangeSetView; results: RejectChangeSetEntryResult[] }
  | (ChangeSetFailure & { results?: RejectChangeSetEntryResult[] });

export type UndoChangeSetResult =
  | { ok: true; changeset: DocChangeSetView; undonePatchIds: string[] }
  | (ChangeSetFailure & {
      failedPatchId?: string;
      undonePatchIds?: string[];
      proposalFailures?: ChangeSetRollbackFailure[];
    });

type EnrichResult =
  | { ok: true; changeset: DocChangeSetView }
  | ChangeSetFailure;

type AppliedEntry = {
  kind: "entry";
  resultIndex: number;
  entryIndex: number;
  docPath: string;
  proposalId: string;
  patchId: string;
  proposal: DocProposal;
};

type AppliedTreeOp = {
  kind: "tree-op";
  resultIndex: number;
  patchId: string;
};

type AppliedSidecars = { kind: "sidecars"; patchId: string };

type AppliedStep = AppliedEntry | AppliedTreeOp | AppliedSidecars;

type AppliedProposalRef = {
  patchId: string;
  docPath: string;
  proposalId: string;
};

/**
 * The ledger is intentionally process-local, so this companion map may be
 * process-local too. It records which accepted proposals belong to a compound
 * patch, allowing change-set undo to reopen only entries applied by the batch
 * (never an entry accepted earlier through the per-doc escape hatch).
 */
const appliedProposalsByCompoundPatch = new Map<string, AppliedProposalRef[]>();

function proposalCounts(ops: DocOp[]): { addCount: number; delCount: number } {
  let addCount = 0;
  let delCount = 0;
  for (const op of ops) {
    if (op.type === "insertBlock") {
      addCount += 1;
    } else if (op.type === "deleteBlock") {
      delCount += 1;
    } else if (
      op.type === "updateBlock" ||
      op.type === "moveBlock" ||
      op.type === "splitBlock" ||
      op.type === "mergeBlocks"
    ) {
      addCount += 1;
      delCount += 1;
    }
  }
  return { addCount, delCount };
}

async function enrichChangeSet(
  docsRoot: string,
  changeset: DocChangeSet,
): Promise<EnrichResult> {
  const entries: DocChangeSetEntryView[] = [];
  for (const entry of changeset.entries) {
    const listed = await getBundleProposals(docsRoot, entry.docPath);
    if (!listed.ok) {
      // A missing/deleted/moved bundle is an honest "missing" entry in the
      // corpus-level view. Corrupt sidecars and other failures still surface.
      if (listed.status === 404) {
        entries.push({
          ...entry,
          status: "missing",
          stale: false,
          summary: "",
          addCount: 0,
          delCount: 0,
        });
        continue;
      }
      return { ok: false, status: listed.status, detail: listed.detail };
    }
    const proposal = listed.proposals.find((candidate) => candidate.id === entry.proposalId);
    if (!proposal) {
      entries.push({
        ...entry,
        status: "missing",
        stale: false,
        summary: "",
        addCount: 0,
        delCount: 0,
      });
      continue;
    }
    entries.push({
      ...entry,
      status: proposal.status,
      stale: proposal.stale,
      summary: proposal.summary,
      ...proposalCounts(proposal.ops),
    });
  }
  return {
    ok: true,
    changeset: {
      ...changeset,
      entries,
      progress: {
        accepted: entries.filter((entry) => entry.status === "accepted").length,
        total: entries.length,
      },
    },
  };
}

function normalizedPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/+$/, "");
}

function touchesPath(changeset: DocChangeSet, path: string): boolean {
  const target = normalizedPath(path);
  return changeset.entries.some((entry) => normalizedPath(entry.docPath) === target) ||
    changeset.treeOps.some((op) => {
      if (op.kind === "move-doc") {
        return normalizedPath(op.from) === target || normalizedPath(op.to) === target;
      }
      return normalizedPath(op.docPath) === target;
    }) || changeset.annotationMigrations?.some((migration) =>
      normalizedPath(migration.fromDocPath) === target ||
      normalizedPath(migration.toDocPath) === target) === true;
}

export async function createChangeSet(
  docsRoot: string,
  input: CreateDocChangeSetInput,
): Promise<{ ok: true; changeset: DocChangeSetView } | ChangeSetFailure> {
  const created = await createChangeSetRecord(docsRoot, input);
  if (!created.ok) return created;
  return enrichChangeSet(docsRoot, created.changeset);
}

export async function listChangeSets(
  docsRoot: string,
  path?: string,
): Promise<{ ok: true; changesets: DocChangeSetView[] } | ChangeSetFailure> {
  const listed = await listChangeSetRecords(docsRoot);
  if (!listed.ok) return listed;
  const changesets: DocChangeSetView[] = [];
  for (const record of listed.changesets) {
    if (path !== undefined && !touchesPath(record, path)) continue;
    const enriched = await enrichChangeSet(docsRoot, record);
    if (!enriched.ok) return enriched;
    changesets.push(enriched.changeset);
  }
  return { ok: true, changesets };
}

export async function getChangeSet(
  docsRoot: string,
  id: string,
): Promise<{ ok: true; changeset: DocChangeSetView } | ChangeSetFailure> {
  const loaded = await readChangeSetRecord(docsRoot, id);
  if (!loaded.ok) return loaded;
  return enrichChangeSet(docsRoot, loaded.changeset);
}

function lockPaths(changeset: DocChangeSet): string[] {
  const paths = new Set<string>();
  for (const entry of changeset.entries) paths.add(normalizedPath(entry.docPath));
  for (const op of changeset.treeOps) {
    if (op.kind === "move-doc") {
      paths.add(normalizedPath(op.from));
      paths.add(normalizedPath(op.to));
    } else {
      paths.add(normalizedPath(op.docPath));
    }
  }
  for (const migration of changeset.annotationMigrations ?? []) {
    paths.add(normalizedPath(migration.fromDocPath));
    paths.add(normalizedPath(migration.toDocPath));
  }
  return [...paths].sort((left, right) => left.localeCompare(right));
}

async function withOrderedSentinelLocks<T>(
  docsRoot: string,
  paths: string[],
  fn: () => Promise<T>,
): Promise<T> {
  const root = resolve(docsRoot);
  const acquire = (index: number): Promise<T> => {
    if (index >= paths.length) return fn();
    const key = join(
      root,
      CHANGESETS_DIRECTORY,
      `.lock--${paths[index].replaceAll("/", "--")}`,
    );
    return withPathLock(key, () => acquire(index + 1));
  };
  return acquire(0);
}

type ProposalStatusMutationResult =
  | { ok: true }
  | { ok: false; status: number; detail: string };

/** Reopens an accepted proposal after its doc inverse has been replayed. */
async function reopenProposal(
  docsRoot: string,
  docPath: string,
  proposalId: string,
): Promise<ProposalStatusMutationResult> {
  const jsonAbs = resolveDocBundleJsonPath(docsRoot, docPath);
  if (!jsonAbs) return { ok: false, status: 400, detail: `Invalid docs path: ${docPath}` };
  const sidecarAbs = join(dirname(jsonAbs), PROPOSALS_SIDECAR_FILENAME);
  return withPathLock(sidecarAbs, async (): Promise<ProposalStatusMutationResult> => {
    let raw: string;
    try {
      raw = await readFile(sidecarAbs, "utf8");
    } catch {
      return { ok: false, status: 404, detail: `Proposals sidecar not found: ${docPath}` };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, status: 422, detail: `Proposals sidecar is not valid JSON: ${docPath}` };
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray((parsed as { proposals?: unknown }).proposals)
    ) {
      return { ok: false, status: 422, detail: `Proposals sidecar failed schema validation: ${docPath}` };
    }
    let found = false;
    const proposals = (parsed as { proposals: unknown[] }).proposals.map((value) => {
      if (!value || typeof value !== "object" || (value as { id?: unknown }).id !== proposalId) {
        return value;
      }
      found = true;
      const proposal: Record<string, unknown> = {
        ...(value as Record<string, unknown>),
        status: "staged",
      };
      delete proposal.resolvedAt;
      return proposal;
    });
    if (!found) {
      return { ok: false, status: 404, detail: `Proposal not found: ${proposalId}` };
    }
    const content = `${JSON.stringify({ ...(parsed as object), proposals }, null, 2)}\n`;
    await atomicWriteFile(sidecarAbs, content);
    return { ok: true };
  });
}

function treeMutationPaths(op: PositionedDocChangeSetTreeOp): string[] {
  if (op.kind === "move-doc") return [op.from, op.to];
  return [op.docPath];
}

function resultFailure(
  status: number,
  detail: string,
  record: DocChangeSet,
  results: ChangeSetAcceptStepResult[],
  failedEntry?: DocChangeSetEntry,
  failedTreeOp?: PositionedDocChangeSetTreeOp,
): AcceptChangeSetResult {
  return {
    ok: false,
    status,
    detail,
    ...(failedEntry ? { failedEntry } : {}),
    ...(failedTreeOp ? { failedTreeOp } : {}),
    results,
    rolledBack: true,
  };
}

export async function acceptChangeSet(
  docsRoot: string,
  id: string,
  options: AcceptChangeSetOptions = {},
): Promise<AcceptChangeSetResult> {
  const initial = await readChangeSetRecord(docsRoot, id);
  if (!initial.ok) {
    return { ...initial, results: [], rolledBack: true };
  }

  return withOrderedSentinelLocks(docsRoot, lockPaths(initial.changeset), async () => {
    const loaded = await readChangeSetRecord(docsRoot, id);
    if (!loaded.ok) return { ...loaded, results: [], rolledBack: true };
    const record = loaded.changeset;
    if (record.status !== "open") {
      return {
        ok: false,
        status: 409,
        detail: `Change-set is already ${record.status}.`,
        results: [],
        rolledBack: true,
      };
    }

    const preparedMigrations = await prepareAnnotationMigrations(
      docsRoot,
      record.annotationMigrations ?? [],
    );
    if (!Array.isArray(preparedMigrations)) {
      return { ...preparedMigrations, results: [], rolledBack: true };
    }

    const results: ChangeSetAcceptStepResult[] = [];
    const applied: AppliedStep[] = [];
    const patchIds: string[] = [];
    const changedIdsByPath = new Map<string, Set<string>>();
    const appliedProposalRefs: AppliedProposalRef[] = [];

    const notePathMutation = (path: string, changedIds: string[] = []) => {
      const existing = changedIdsByPath.get(path) ?? new Set<string>();
      for (const changedId of changedIds) existing.add(changedId);
      changedIdsByPath.set(path, existing);
    };

    const rollback = async (
      failure: AcceptChangeSetResult,
    ): Promise<AcceptChangeSetResult> => {
      if (failure.ok) return failure;
      const rollbackFailures: ChangeSetRollbackFailure[] = [];
      for (const step of [...applied].reverse()) {
        if (step.kind === "entry" || step.kind === "sidecars") {
          const undone = await undo_patch(docsRoot, step.patchId);
          if (!undone.ok) {
            rollbackFailures.push({
              kind: "entry",
              patchId: step.patchId,
              ...(step.kind === "entry"
                ? { docPath: step.docPath, proposalId: step.proposalId }
                : {}),
              detail: undone.detail,
            });
            continue;
          }
          if (step.kind === "sidecars") continue;
          results[step.resultIndex].rolledBack = true;
          const reopened = await reopenProposal(docsRoot, step.docPath, step.proposalId);
          if (!reopened.ok) {
            rollbackFailures.push({
              kind: "proposal",
              docPath: step.docPath,
              proposalId: step.proposalId,
              detail: reopened.detail,
            });
          }
          continue;
        }
        const replayed = await undo_patch(docsRoot, step.patchId);
        if (!replayed.ok) {
          rollbackFailures.push({
            kind: "tree-op",
            patchId: step.patchId,
            detail: replayed.detail,
          });
        } else {
          results[step.resultIndex].rolledBack = true;
        }
      }
      return {
        ...failure,
        ...(rollbackFailures.length > 0 ? { rollbackFailures } : {}),
      };
    };

    for (let position = 0; position <= record.entries.length; position += 1) {
      for (const [treeIndex, op] of record.treeOps.entries()) {
        if (op.position !== position) continue;
        const actor = options.sessionId ?? record.sessionId;
        const blocked = treeMutationPaths(op)
          .map((path) => ({
            path,
            check: draftLockStore.checkForMutation({ kind: "doc", path: normalizedPath(path) }, actor),
          }))
          .find((candidate) => candidate.check.blocked);
        if (blocked) {
          const detail = "Draft in progress — another session is editing this file.";
          results.push({
            kind: "tree-op",
            index: treeIndex,
            position,
            op,
            ok: false,
            status: 423,
            detail,
          });
          return rollback(resultFailure(423, detail, record, results, undefined, op));
        }
        const executed = await executeTreeOp(docsRoot, op);
        const resultIndex = results.length;
        if (!executed.ok) {
          results.push({
            kind: "tree-op",
            index: treeIndex,
            position,
            op,
            ok: false,
            status: executed.status,
            detail: executed.detail,
            ...(executed.failures ? { failures: executed.failures } : {}),
          });
          return rollback(
            resultFailure(executed.status, executed.detail, record, results, undefined, op),
          );
        }
        results.push({
          kind: "tree-op",
          index: treeIndex,
          position,
          op,
          ok: true,
          ...("failures" in executed && executed.failures
            ? { failures: executed.failures }
            : {}),
        });
        const patchId = randomUUID();
        recordTreePatch(patchId, executed.inverse);
        patchIds.push(patchId);
        applied.push({ kind: "tree-op", resultIndex, patchId });
        for (const path of treeMutationPaths(op)) notePathMutation(path);
      }

      if (position === record.entries.length) continue;
      const entry = record.entries[position];
      const listed = await getBundleProposals(docsRoot, entry.docPath);
      if (!listed.ok) {
        results.push({
          kind: "entry",
          index: position,
          ...entry,
          ok: false,
          status: listed.status,
          detail: listed.detail,
        });
        return rollback(resultFailure(listed.status, listed.detail, record, results, entry));
      }
      const proposal = listed.proposals.find((candidate) => candidate.id === entry.proposalId);
      if (!proposal) {
        const detail = `Proposal not found: ${entry.proposalId}`;
        results.push({ kind: "entry", index: position, ...entry, ok: false, status: 404, detail });
        return rollback(resultFailure(404, detail, record, results, entry));
      }
      if (proposal.status === "accepted") {
        results.push({ kind: "entry", index: position, ...entry, ok: true, skipped: true });
        continue;
      }
      if (proposal.status !== "staged") {
        const detail = `Proposal is already ${proposal.status}.`;
        results.push({ kind: "entry", index: position, ...entry, ok: false, status: 409, detail });
        return rollback(resultFailure(409, detail, record, results, entry));
      }

      const accepted = await acceptBundleProposal(docsRoot, entry.docPath, entry.proposalId, {
        sessionId: options.sessionId ?? record.sessionId,
      });
      if (!accepted.ok) {
        results.push({
          kind: "entry",
          index: position,
          ...entry,
          ok: false,
          status: accepted.status,
          detail: accepted.detail,
        });
        return rollback(
          resultFailure(accepted.status, accepted.detail, record, results, entry),
        );
      }
      const resultIndex = results.length;
      results.push({
        kind: "entry",
        index: position,
        ...entry,
        ok: true,
        patchId: accepted.patchId,
      });
      patchIds.push(accepted.patchId);
      appliedProposalRefs.push({
        patchId: accepted.patchId,
        docPath: entry.docPath,
        proposalId: entry.proposalId,
      });
      applied.push({
        kind: "entry",
        resultIndex,
        entryIndex: position,
        docPath: entry.docPath,
        proposalId: entry.proposalId,
        patchId: accepted.patchId,
        proposal: accepted.proposal,
      });
      notePathMutation(entry.docPath, accepted.proposal.changedBlockIds);
    }

    const compoundPatchId = randomUUID();
    const migrated = await applyAnnotationMigrations(docsRoot, preparedMigrations);
    if (!migrated.ok) {
      return rollback(resultFailure(migrated.status, migrated.detail, record, results));
    }

    let annotationFailure: { status: number; detail: string } | undefined;
    if (record.annotationId && record.annotationDocPath) {
      const changedIds = [...new Set(
        applied
          .filter((step): step is AppliedEntry => step.kind === "entry")
          .flatMap((step) => step.proposal.changedBlockIds),
      )];
      const effectiveAnnotationPath = migrated.migratedAnnotationPaths.get(record.annotationId) ??
        record.annotationDocPath;
      const attached = await attachAgentRunToAnnotation(docsRoot, effectiveAnnotationPath, {
        annotationId: record.annotationId,
        sessionId: options.sessionId ?? record.sessionId ?? "anonymous",
        patchId: compoundPatchId,
        summary: record.summary,
        changedIds,
      });
      if (!attached.ok) annotationFailure = { status: attached.status, detail: attached.detail };
    }

    if (migrated.files.length > 0) {
      for (const file of migrated.files) {
        try {
          const raw = await readFile(join(resolve(docsRoot), file.path), "utf8");
          file.hashAfterApply = createContentHash(raw);
        } catch (error) {
          file.hashAfterApply = (error as NodeJS.ErrnoException).code === "ENOENT" ? null : file.hashAfterApply;
        }
      }
      const migrationPatchId = randomUUID();
      recordSidecarPatch(migrationPatchId, migrated.files);
      patchIds.push(migrationPatchId);
      applied.push({ kind: "sidecars", patchId: migrationPatchId });
    }

    recordCompoundPatch(compoundPatchId, patchIds);
    const resolved: DocChangeSet = {
      ...record,
      status: "applied",
      resolvedAt: new Date().toISOString(),
      compoundPatchId,
    };
    const written = await writeChangeSetRecord(docsRoot, resolved);
    if (!written.ok) {
      deleteStoredPatch(compoundPatchId);
      return rollback(resultFailure(written.status, written.detail, record, results));
    }
    appliedProposalsByCompoundPatch.set(compoundPatchId, appliedProposalRefs);

    for (const [path, changedIds] of changedIdsByPath) {
      options.publishChange?.({
        path,
        changedIds: [...changedIds],
        patchId: compoundPatchId,
        actor: options.sessionId ?? record.sessionId ?? "anonymous",
      });
    }
    options.publishChange?.({
      path: "",
      changedIds: [],
      patchId: compoundPatchId,
      actor: options.sessionId ?? record.sessionId ?? "anonymous",
    });

    const enriched = await enrichChangeSet(docsRoot, resolved);
    if (!enriched.ok) {
      // The mutation already committed; do not manufacture a failed accept.
      return {
        ok: true,
        changeset: {
          ...resolved,
          entries: record.entries.map((entry) => ({
            ...entry,
            status: "missing" as const,
            stale: false,
            summary: "",
            addCount: 0,
            delCount: 0,
          })),
          progress: { accepted: 0, total: record.entries.length },
        },
        patchId: compoundPatchId,
        results,
        ...(annotationFailure ? { annotationFailure } : {}),
      };
    }
    return {
      ok: true,
      changeset: enriched.changeset,
      patchId: compoundPatchId,
      results,
      ...(annotationFailure ? { annotationFailure } : {}),
    };
  });
}

export async function rejectChangeSet(
  docsRoot: string,
  id: string,
  options: { sessionId?: string } = {},
): Promise<RejectChangeSetResult> {
  const loaded = await readChangeSetRecord(docsRoot, id);
  if (!loaded.ok) return loaded;
  if (loaded.changeset.status !== "open") {
    return { ok: false, status: 409, detail: `Change-set is already ${loaded.changeset.status}.` };
  }

  const results: RejectChangeSetEntryResult[] = [];
  for (const entry of loaded.changeset.entries) {
    const rejected = await rejectBundleProposal(docsRoot, entry.docPath, entry.proposalId, {
      sessionId: options.sessionId ?? loaded.changeset.sessionId,
    });
    if (!rejected.ok) {
      const tolerated = rejected.status === 404 || rejected.status === 409;
      results.push({ ...entry, ok: false, status: rejected.status, detail: rejected.detail, tolerated });
      if (!tolerated) return { ok: false, status: rejected.status, detail: rejected.detail, results };
      continue;
    }
    const annotationId = rejected.proposal.annotationId;
    const hasActiveProposal = annotationId !== undefined && rejected.proposals.proposals.some(
      (proposal) =>
        proposal.id !== rejected.proposal.id &&
        proposal.annotationId === annotationId &&
        (proposal.status === "staged" || proposal.status === "accepted"),
    );
    if (annotationId && !hasActiveProposal) {
      try {
        await resolveBundleAnnotation(
          docsRoot,
          entry.docPath,
          annotationId,
          undefined,
          options.sessionId ?? loaded.changeset.sessionId,
          "Rejected in review.",
        );
      } catch {
        // Annotation closure is best-effort; this proposal reject already succeeded.
      }
    }
    results.push({ ...entry, ok: true });
  }

  const declined: DocChangeSet = {
    ...loaded.changeset,
    status: "declined",
    resolvedAt: new Date().toISOString(),
  };
  const written = await writeChangeSetRecord(docsRoot, declined);
  if (!written.ok) return { ...written, results };
  const enriched = await enrichChangeSet(docsRoot, declined);
  if (!enriched.ok) return { ...enriched, results };
  return { ok: true, changeset: enriched.changeset, results };
}

function deriveAppliedProposalRefs(record: DocChangeSet, patchIds: string[]): AppliedProposalRef[] {
  const usedEntries = new Set<number>();
  const refs: AppliedProposalRef[] = [];
  for (const patchId of patchIds) {
    const stored = getStoredPatch(patchId);
    if (!stored || stored.kind !== "doc") continue;
    const index = record.entries.findIndex(
      (entry, entryIndex) => !usedEntries.has(entryIndex) && entry.docPath === stored.path,
    );
    if (index < 0) continue;
    usedEntries.add(index);
    refs.push({ patchId, ...record.entries[index] });
  }
  return refs;
}

export async function undoChangeSet(
  docsRoot: string,
  id: string,
  _options: { sessionId?: string } = {},
): Promise<UndoChangeSetResult> {
  const loaded = await readChangeSetRecord(docsRoot, id);
  if (!loaded.ok) return loaded;
  const record = loaded.changeset;
  if (record.status !== "applied" || !record.compoundPatchId) {
    return { ok: false, status: 409, detail: "Change-set is not applied." };
  }
  const compound = getStoredPatch(record.compoundPatchId);
  if (!compound || compound.kind !== "compound") {
    return { ok: false, status: 404, detail: `No live compound patch found: ${record.compoundPatchId}` };
  }
  const proposalRefs = appliedProposalsByCompoundPatch.get(record.compoundPatchId) ??
    deriveAppliedProposalRefs(record, compound.patchIds);

  const undone = await undo_patch(docsRoot, record.compoundPatchId);
  const undonePatchIds = undone.ok
    ? (undone.kind === "compound" ? undone.undonePatchIds : [])
    : (undone.undonePatchIds ?? []);
  const proposalFailures: ChangeSetRollbackFailure[] = [];
  for (const patchId of undonePatchIds) {
    const ref = proposalRefs.find((candidate) => candidate.patchId === patchId);
    if (!ref) continue;
    const reopened = await reopenProposal(docsRoot, ref.docPath, ref.proposalId);
    if (!reopened.ok) {
      proposalFailures.push({
        kind: "proposal",
        docPath: ref.docPath,
        proposalId: ref.proposalId,
        detail: reopened.detail,
      });
    }
  }
  if (!undone.ok) {
    return {
      ok: false,
      status: undone.status,
      detail: undone.detail,
      failedPatchId: undone.failedPatchId,
      undonePatchIds,
      ...(proposalFailures.length > 0 ? { proposalFailures } : {}),
    };
  }

  const reopened: DocChangeSet = { ...record, status: "open" };
  delete reopened.resolvedAt;
  delete reopened.compoundPatchId;
  const written = await writeChangeSetRecord(docsRoot, reopened);
  if (!written.ok) {
    return {
      ...written,
      undonePatchIds,
      ...(proposalFailures.length > 0 ? { proposalFailures } : {}),
    };
  }
  appliedProposalsByCompoundPatch.delete(record.compoundPatchId);
  const enriched = await enrichChangeSet(docsRoot, reopened);
  if (!enriched.ok) {
    return {
      ...enriched,
      undonePatchIds,
      ...(proposalFailures.length > 0 ? { proposalFailures } : {}),
    };
  }
  return { ok: true, changeset: enriched.changeset, undonePatchIds };
}

// Preserve the sidecar failure in the public type graph for consumers that
// want to distinguish schema/I/O errors without importing the sidecar module.
export type { ChangeSetSidecarFailure, CreateDocChangeSetInput };
