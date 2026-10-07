import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";
import type { DocAnnotation } from "@codecaine-ai/docs-model/annotations-schema";
import { fetchJson, postJson, assertWritable, bundlePathOf } from "./http";
import { getSessionId } from "../session";

// ---------------------------------------------------------------------------
// Staged proposals (serve only)
// ---------------------------------------------------------------------------

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

export type ListedDocProposal = DocProposal & { stale: boolean };

export type ListProposalsResponse = {
  proposals: ListedDocProposal[];
  hash: string;
};

export type StageProposalResponse = {
  proposal: DocProposal;
  proposals: DocProposal[];
  hash: string;
};

export type AcceptProposalResponse = {
  proposal: DocProposal;
  proposals: DocProposal[];
  hash: string;
  doc: DocDocument;
  doc_hash: string;
  patch_id: string;
  annotation?: DocAnnotation;
};

export type RejectProposalResponse = {
  proposal: DocProposal;
  proposals: DocProposal[];
  hash: string;
};

type ProposalMutationWire<T extends { proposals: DocProposal[] }> = Omit<T, "proposals"> & {
  // Current servers return the sidecar document; tolerate the flattened wire
  // shape too so the exported client contract remains a proposal array.
  proposals: DocProposal[] | { schemaVersion: 1; proposals: DocProposal[] };
};

function normalizeProposalMutation<T extends { proposals: DocProposal[] }>(
  response: ProposalMutationWire<T>,
): T {
  return {
    ...response,
    proposals: Array.isArray(response.proposals)
      ? response.proposals
      : response.proposals.proposals,
  } as T;
}

export async function listProposals(path: string): Promise<ListProposalsResponse> {
  assertWritable("Loading proposals");
  return fetchJson(
    `api/proposals?path=${encodeURIComponent(bundlePathOf(path))}`,
  );
}

export async function stageProposal(
  path: string,
  input: {
    ops: DocOp[];
    summary: string;
    expectedHash?: string;
    annotationId?: string;
    alias?: string;
  },
): Promise<StageProposalResponse> {
  assertWritable("Staging proposals");
  const response = await postJson<ProposalMutationWire<StageProposalResponse>>(
    `api/proposals`,
    {
      path: bundlePathOf(path),
      ops: input.ops,
      summary: input.summary,
      expected_hash: input.expectedHash,
      annotation_id: input.annotationId,
      alias: input.alias,
      session_id: getSessionId(),
    },
  );
  return normalizeProposalMutation(response);
}

export async function acceptProposal(
  path: string,
  proposalId: string,
  expectedHash?: string,
): Promise<AcceptProposalResponse> {
  assertWritable("Accepting proposals");
  const response = await postJson<ProposalMutationWire<AcceptProposalResponse>>(
    `api/proposals/${encodeURIComponent(proposalId)}/accept`,
    {
      path: bundlePathOf(path),
      expected_hash: expectedHash,
      session_id: getSessionId(),
    },
  );
  return normalizeProposalMutation(response);
}

export async function rejectProposal(
  path: string,
  proposalId: string,
  options?: { resolveAnnotation?: boolean },
): Promise<RejectProposalResponse> {
  assertWritable("Rejecting proposals");
  const response = await postJson<ProposalMutationWire<RejectProposalResponse>>(
    `api/proposals/${encodeURIComponent(proposalId)}/reject`,
    {
      path: bundlePathOf(path),
      session_id: getSessionId(),
      ...(options?.resolveAnnotation === false ? { resolve_annotation: false } : {}),
    },
  );
  return normalizeProposalMutation(response);
}

