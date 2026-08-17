import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { serializeDocDocument, type DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { applyOps, type DocOp } from "@codecaine-ai/docs-model/doc-ops";
import { resolveDocBundleJsonPath } from "@codecaine-ai/docs-index/paths";

import { atomicWriteFile } from "./atomic-write";
import { loadDocBundle, normalizeBundlePath } from "./bundle";
import { createContentHash } from "./content-hash";
import {
  applyDocOpsToBundle,
  attachAgentRunToAnnotation,
} from "./doc-ops";
import { draftLockStore, type DraftLockInfo } from "./draft-locks";
import { withPathLock } from "./path-mutex";

export const PROPOSALS_SIDECAR_FILENAME = "proposals.json";

export type DocProposal = {
  id: string;
  ops: DocOp[];
  changedBlockIds: string[];
  summary: string;
  baseHash: string;
  annotationId?: string;
  alias?: string;
  sessionId?: string;
  status: "staged" | "accepted" | "rejected";
  createdAt: string;
  resolvedAt?: string;
};

export type ProposalsDocument = { schemaVersion: 1; proposals: DocProposal[] };
export type ListedDocProposal = DocProposal & { stale: boolean };

type ProposalFailure = {
  ok: false;
  status: number;
  detail: string;
  current_hash?: string;
  expected_hash?: string;
  issues?: unknown;
  held_by?: DraftLockInfo;
};

type SidecarRead =
  | { ok: true; proposals: ProposalsDocument; hash: string | null }
  | { ok: false; status: number; detail: string };

const EMPTY_PROPOSALS: ProposalsDocument = { schemaVersion: 1, proposals: [] };

function proposalSidecarAbs(jsonAbs: string): string {
  return join(dirname(jsonAbs), PROPOSALS_SIDECAR_FILENAME);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDocOp(value: unknown): value is DocOp {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "insertBlock":
      return typeof value.blockId === "string" && typeof value.parentId === "string" &&
        Number.isInteger(value.index) && typeof value.blockType === "string" && isRecord(value.props);
    case "updateBlock":
    case "deleteBlock":
    case "splitBlock":
    case "componentAction":
      return typeof value.blockId === "string";
    case "moveBlock":
      return typeof value.blockId === "string" && typeof value.toParentId === "string" &&
        Number.isInteger(value.toIndex);
    case "mergeBlocks":
      return Array.isArray(value.blockIds) && value.blockIds.every((id) => typeof id === "string");
    default:
      return false;
  }
}

function validateProposal(value: unknown): value is DocProposal {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || !Array.isArray(value.ops) || !value.ops.every(isDocOp)) return false;
  if (!Array.isArray(value.changedBlockIds) || !value.changedBlockIds.every((id) => typeof id === "string")) return false;
  if (typeof value.summary !== "string" || typeof value.baseHash !== "string") return false;
  if (!(["staged", "accepted", "rejected"] as unknown[]).includes(value.status)) return false;
  if (typeof value.createdAt !== "string") return false;
  for (const key of ["annotationId", "alias", "sessionId", "resolvedAt"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string") return false;
  }
  return true;
}

async function readProposalsSidecar(abs: string): Promise<SidecarRead> {
  let raw: string;
  try {
    raw = await readFile(abs, "utf8");
  } catch {
    return { ok: true, proposals: EMPTY_PROPOSALS, hash: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, status: 422, detail: "Proposals sidecar is not valid JSON" };
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.proposals) ||
      !parsed.proposals.every(validateProposal)) {
    return { ok: false, status: 422, detail: "Proposals sidecar failed schema validation" };
  }
  return { ok: true, proposals: parsed as ProposalsDocument, hash: createContentHash(raw) };
}

async function writeProposalsSidecar(abs: string, document: ProposalsDocument) {
  const content = `${JSON.stringify(document, null, 2)}\n`;
  await atomicWriteFile(abs, content);
  return { content, hash: createContentHash(content) };
}

function changedBlockIds(ops: DocOp[]): string[] {
  const ids = new Set<string>();
  for (const op of ops) {
    if (op.type === "insertBlock") {
      ids.add(op.blockId);
      ids.add(op.parentId);
    } else if (op.type === "moveBlock") {
      ids.add(op.blockId);
      ids.add(op.toParentId);
    } else if (op.type === "mergeBlocks") {
      op.blockIds.forEach((id) => ids.add(id));
    } else {
      ids.add(op.blockId);
    }
  }
  // splitBlock and mergeBlocks mint result ids during apply, so those new ids
  // are unknowable while staging; only their statically named inputs appear.
  return [...ids];
}

export type GetBundleProposalsResult =
  | { ok: true; proposals: ListedDocProposal[]; hash: string | null; docHash: string }
  | ProposalFailure;

export async function getBundleProposals(
  docsRoot: string,
  path: string,
): Promise<GetBundleProposalsResult> {
  const jsonAbs = resolveDocBundleJsonPath(docsRoot, path);
  if (!jsonAbs) return { ok: false, status: 400, detail: `Invalid docs path: ${path}` };
  const loaded = await loadDocBundle(docsRoot, path);
  if ("error" in loaded) return { ok: false, ...loaded.error };
  const existing = await readProposalsSidecar(proposalSidecarAbs(jsonAbs));
  if (!existing.ok) return existing;
  return {
    ok: true,
    proposals: existing.proposals.proposals.map((proposal) => ({
      ...proposal,
      stale: proposal.status === "staged" && proposal.baseHash !== loaded.docHash,
    })),
    hash: existing.hash,
    docHash: loaded.docHash,
  };
}

export type StageBundleProposalInput = {
  ops: DocOp[];
  summary: string;
  expectedHash?: string;
  annotationId?: string;
  alias?: string;
  sessionId?: string;
};

export type StageBundleProposalResult =
  | { ok: true; proposal: DocProposal; proposals: ProposalsDocument; hash: string }
  | ProposalFailure;

export async function stageBundleProposal(
  docsRoot: string,
  path: string,
  input: StageBundleProposalInput,
  sessionId?: string,
): Promise<StageBundleProposalResult> {
  const jsonAbs = resolveDocBundleJsonPath(docsRoot, path);
  if (!jsonAbs) return { ok: false, status: 400, detail: `Invalid docs path: ${path}` };
  if (!Array.isArray(input.ops) || !input.ops.every(isDocOp)) {
    return { ok: false, status: 400, detail: "Doc ops failed to apply", issues: [{ path: "$.ops", message: "Proposal ops are invalid." }] };
  }
  if (typeof input.summary !== "string") {
    return { ok: false, status: 400, detail: "Proposal summary is invalid" };
  }
  const sidecarAbs = proposalSidecarAbs(jsonAbs);
  return withPathLock(sidecarAbs, async () => {
    const loaded = await loadDocBundle(docsRoot, path);
    if ("error" in loaded) return { ok: false as const, ...loaded.error };
    if (input.expectedHash && input.expectedHash !== loaded.docHash) {
      return { ok: false as const, status: 409, detail: "Doc bundle is stale; reload before staging proposal.", current_hash: loaded.docHash, expected_hash: input.expectedHash };
    }
    const lock = draftLockStore.checkForMutation({ kind: "doc", path: loaded.bundlePath }, sessionId ?? input.sessionId);
    if (lock.blocked) return { ok: false as const, status: 423, detail: "Draft in progress — another session is editing this file.", held_by: lock.heldBy };
    const dryRun = applyOps(loaded.document, input.ops, () => randomUUID());
    if (!dryRun.ok) return { ok: false as const, status: 400, detail: "Doc ops failed to apply", issues: dryRun.issues };
    const existing = await readProposalsSidecar(sidecarAbs);
    if (!existing.ok) return existing;
    const proposal: DocProposal = {
      id: randomUUID(), ops: input.ops, changedBlockIds: changedBlockIds(input.ops),
      summary: input.summary, baseHash: loaded.docHash,
      ...(input.annotationId !== undefined ? { annotationId: input.annotationId } : {}),
      ...(input.alias !== undefined ? { alias: input.alias } : {}),
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      status: "staged", createdAt: new Date().toISOString(),
    };
    const proposals = { schemaVersion: 1 as const, proposals: [...existing.proposals.proposals, proposal] };
    const written = await writeProposalsSidecar(sidecarAbs, proposals);
    return { ok: true as const, proposal, proposals, hash: written.hash };
  });
}

/**
 * Stages against a supplied virtual base document. Split-doc uses this for
 * the destination proposal before its create-doc tree op materializes the
 * canonical doc.json. The proposal remains ordinary: after create-doc runs,
 * its baseHash matches that minimal document and normal accept logic applies.
 */
export async function stageBundleProposalAgainstDocument(
  docsRoot: string,
  path: string,
  input: StageBundleProposalInput,
  baseDocument: DocDocument,
  sessionId?: string,
): Promise<StageBundleProposalResult> {
  const jsonAbs = resolveDocBundleJsonPath(docsRoot, path);
  if (!jsonAbs) return { ok: false, status: 400, detail: `Invalid docs path: ${path}` };
  if (!Array.isArray(input.ops) || !input.ops.every(isDocOp)) {
    return { ok: false, status: 400, detail: "Doc ops failed to apply", issues: [{ path: "$.ops", message: "Proposal ops are invalid." }] };
  }
  const baseHash = createContentHash(serializeDocDocument(baseDocument));
  if (input.expectedHash && input.expectedHash !== baseHash) {
    return { ok: false, status: 409, detail: "Virtual document is stale.", current_hash: baseHash, expected_hash: input.expectedHash };
  }
  const dryRun = applyOps(baseDocument, input.ops, () => randomUUID());
  if (!dryRun.ok) return { ok: false, status: 400, detail: "Doc ops failed to apply", issues: dryRun.issues };

  const sidecarAbs = proposalSidecarAbs(jsonAbs);
  return withPathLock(sidecarAbs, async () => {
    const lock = draftLockStore.checkForMutation(
      { kind: "doc", path: normalizeBundlePath(path) },
      sessionId ?? input.sessionId,
    );
    if (lock.blocked) return { ok: false as const, status: 423, detail: "Draft in progress — another session is editing this file.", held_by: lock.heldBy };
    const existing = await readProposalsSidecar(sidecarAbs);
    if (!existing.ok) return existing;
    const proposal: DocProposal = {
      id: randomUUID(),
      ops: input.ops,
      changedBlockIds: changedBlockIds(input.ops),
      summary: input.summary,
      baseHash,
      ...(input.annotationId !== undefined ? { annotationId: input.annotationId } : {}),
      ...(input.alias !== undefined ? { alias: input.alias } : {}),
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      status: "staged",
      createdAt: new Date().toISOString(),
    };
    const proposals = { schemaVersion: 1 as const, proposals: [...existing.proposals.proposals, proposal] };
    const written = await writeProposalsSidecar(sidecarAbs, proposals);
    return { ok: true as const, proposal, proposals, hash: written.hash };
  });
}

export type AcceptBundleProposalInput = { expectedHash?: string; sessionId?: string };
export type AcceptBundleProposalResult =
  | { ok: true; proposal: DocProposal; proposals: ProposalsDocument; proposalsHash: string; doc: DocDocument; hash: string; patchId: string }
  | ProposalFailure;

export async function acceptBundleProposal(
  docsRoot: string,
  path: string,
  proposalId: string,
  input: AcceptBundleProposalInput = {},
): Promise<AcceptBundleProposalResult> {
  const jsonAbs = resolveDocBundleJsonPath(docsRoot, path);
  if (!jsonAbs) return { ok: false, status: 400, detail: `Invalid docs path: ${path}` };
  const sidecarAbs = proposalSidecarAbs(jsonAbs);
  return withPathLock(sidecarAbs, async () => {
    const existing = await readProposalsSidecar(sidecarAbs);
    if (!existing.ok) return existing;
    if (input.expectedHash && input.expectedHash !== existing.hash) return { ok: false as const, status: 409, detail: "Proposals sidecar is stale; reload before accepting.", current_hash: existing.hash ?? undefined, expected_hash: input.expectedHash };
    const index = existing.proposals.proposals.findIndex((item) => item.id === proposalId);
    if (index < 0) return { ok: false as const, status: 404, detail: `Proposal not found: ${proposalId}` };
    const proposal = existing.proposals.proposals[index];
    if (proposal.status !== "staged") return { ok: false as const, status: 409, detail: `Proposal is already ${proposal.status}.` };
    const loaded = await loadDocBundle(docsRoot, path);
    if ("error" in loaded) return { ok: false as const, ...loaded.error };
    if (loaded.docHash !== proposal.baseHash) return { ok: false as const, status: 409, detail: "stale-proposal", current_hash: loaded.docHash, expected_hash: proposal.baseHash };
    const applied = await applyDocOpsToBundle(docsRoot, path, proposal.ops, proposal.baseHash, input.sessionId ?? proposal.sessionId);
    if (!applied.ok) {
      if (applied.status === 409) return { ...applied, detail: "stale-proposal" };
      return applied;
    }
    const accepted: DocProposal = { ...proposal, status: "accepted", resolvedAt: new Date().toISOString() };
    const proposals: ProposalsDocument = { schemaVersion: 1, proposals: existing.proposals.proposals.map((item, itemIndex) => itemIndex === index ? accepted : item) };
    const written = await writeProposalsSidecar(sidecarAbs, proposals);
    if (accepted.annotationId) {
      const attached = await attachAgentRunToAnnotation(docsRoot, path, {
        annotationId: accepted.annotationId,
        sessionId: input.sessionId ?? accepted.sessionId ?? "anonymous",
        patchId: applied.patchId,
        summary: accepted.summary,
        changedIds: accepted.changedBlockIds,
      });
      if (!attached.ok) return attached;
    }
    return { ok: true as const, proposal: accepted, proposals, proposalsHash: written.hash, doc: applied.doc, hash: applied.hash, patchId: applied.patchId };
  });
}

export type RejectBundleProposalInput = { expectedHash?: string; sessionId?: string };
export type RejectBundleProposalResult =
  | { ok: true; proposal: DocProposal; proposals: ProposalsDocument; hash: string }
  | ProposalFailure;

export async function rejectBundleProposal(
  docsRoot: string,
  path: string,
  proposalId: string,
  input: RejectBundleProposalInput = {},
): Promise<RejectBundleProposalResult> {
  const jsonAbs = resolveDocBundleJsonPath(docsRoot, path);
  if (!jsonAbs) return { ok: false, status: 400, detail: `Invalid docs path: ${path}` };
  const sidecarAbs = proposalSidecarAbs(jsonAbs);
  return withPathLock(sidecarAbs, async () => {
    const existing = await readProposalsSidecar(sidecarAbs);
    if (!existing.ok) return existing;
    if (input.expectedHash && input.expectedHash !== existing.hash) return { ok: false as const, status: 409, detail: "Proposals sidecar is stale; reload before rejecting.", current_hash: existing.hash ?? undefined, expected_hash: input.expectedHash };
    const index = existing.proposals.proposals.findIndex((item) => item.id === proposalId);
    if (index < 0) return { ok: false as const, status: 404, detail: `Proposal not found: ${proposalId}` };
    const proposal = existing.proposals.proposals[index];
    if (proposal.status !== "staged") return { ok: false as const, status: 409, detail: `Proposal is already ${proposal.status}.` };
    const lock = draftLockStore.checkForMutation({ kind: "doc", path: normalizeBundlePath(path) }, input.sessionId ?? proposal.sessionId);
    if (lock.blocked) return { ok: false as const, status: 423, detail: "Draft in progress — another session is editing this file.", held_by: lock.heldBy };
    const rejected: DocProposal = { ...proposal, status: "rejected", resolvedAt: new Date().toISOString() };
    const proposals: ProposalsDocument = { schemaVersion: 1, proposals: existing.proposals.proposals.map((item, itemIndex) => itemIndex === index ? rejected : item) };
    const written = await writeProposalsSidecar(sidecarAbs, proposals);
    return { ok: true as const, proposal: rejected, proposals, hash: written.hash };
  });
}
