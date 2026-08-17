/**
 * Shared docs-edit-session vocabulary.
 *
 * A session originates from one doc bundle and may stage proposals across the
 * docs corpus. Annotation ids remain the durable identity; R1, R2, ... aliases
 * are session-local and follow sidecar order. Edits are staged as docs-server
 * DocProposals and are only written by the service's explicit review path.
 */
import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";

export const DOCS_LAB_EDITOR_AGENT_NAME = "docs-lab-editor" as const;

// ---------------------------------------------------------------------------
// Targets and request threads
// ---------------------------------------------------------------------------

/**
 * The docs session target surface.
 *
 * docs-model has no document target kind. A block annotation whose blockId is
 * the document root maps to `doc` at the session boundary and maps back to the
 * root block when persisted. Text ranges retain every docs-model range field.
 */
export type DocsEditTarget =
  | { kind: "doc" }
  | { kind: "block"; blockId: string; fingerprint?: string }
  | {
      kind: "text-range";
      blockId: string;
      start: number;
      end: number;
      quote: string;
      fingerprint?: string;
    };

export type DocsEditDisposition = "batch" | "global";

/** D3 boundary rule used for both annotation-derived and host-added requests. */
export function docsEditDispositionForTarget(
  target: DocsEditTarget,
): DocsEditDisposition {
  return target.kind === "doc" ? "global" : "batch";
}

export type DocsEditRequestAuthor = "human" | "agent" | "system";

export interface DocsEditThreadReply {
  author: DocsEditRequestAuthor;
  body: string;
  createdAt?: string;
}

/** One annotation-backed or host-added request before aliases are assigned. */
export interface DocsEditRequestInput {
  id: string;
  target: DocsEditTarget;
  disposition: DocsEditDisposition;
  body: string;
  author?: DocsEditRequestAuthor;
  /** Prior replies, oldest first. */
  thread?: DocsEditThreadReply[];
  /** True for requests loaded from annotations.json; false for host additions. */
  sidecarBacked?: boolean;
}

/**
 * Exact shared web/session status vocabulary (D4).
 *
 * open -> working -> waiting/ready -> applied|declined|resolved|failed.
 */
export type DocsEditRequestStatus =
  | "open"
  | "working"
  | "waiting"
  | "ready"
  | "applied"
  | "declined"
  | "resolved"
  | "failed";

export const DOCS_EDIT_TERMINAL_REQUEST_STATUSES = [
  "applied",
  "declined",
  "resolved",
  "failed",
] as const satisfies readonly DocsEditRequestStatus[];

const TERMINAL_REQUEST_STATUS_SET: ReadonlySet<DocsEditRequestStatus> = new Set(
  DOCS_EDIT_TERMINAL_REQUEST_STATUSES,
);

export function isDocsEditRequestTerminal(status: DocsEditRequestStatus): boolean {
  return TERMINAL_REQUEST_STATUS_SET.has(status);
}

/** Immutable-snapshot shape used by the session and its event stream. */
export interface DocsEditRequestEntry {
  alias: string;
  annotationId: string;
  target: DocsEditTarget;
  disposition: DocsEditDisposition;
  body: string;
  author: DocsEditRequestAuthor;
  replies: readonly DocsEditThreadReply[];
  /** Controls annotation reply/resolve writes; not a wire-level identity. */
  sidecarBacked: boolean;
  status: DocsEditRequestStatus;
  waitingOnHuman: boolean;
  note?: string;
  proposalId?: string;
}

// ---------------------------------------------------------------------------
// Staged proposals and session events
// ---------------------------------------------------------------------------

export interface DocsEditProposal {
  proposalId: string;
  requestAlias: string;
  /** Normalized docs-root-relative path of the proposal's document bundle. */
  docPath: string;
  baseHash: string;
  ops: DocOp[];
  changedBlockIds: string[];
  summary: string;
  createdAt: string;
  /** Proposal ids superseded by stale-base restaging, oldest first. */
  supersededProposalIds?: string[];
  patchId?: string;
}

export type DocsEditProposeFailure =
  | { kind: "unknown_request"; alias: string }
  | { kind: "request_terminal"; alias: string; status: DocsEditRequestStatus }
  | { kind: "invalid_params"; message: string }
  | {
      kind: "stage_failed";
      status: number;
      detail: string;
      issues?: unknown;
      currentHash?: string;
      expectedHash?: string;
    };

export type DocsEditProposeResult =
  | { ok: true; proposal: DocsEditProposal }
  | { ok: false; failure: DocsEditProposeFailure };

/** Session lifecycle status; per-request workflow uses DocsEditRequestStatus. */
export type DocsEditSessionStatus = "running" | "completed";

export type DocsEditSessionEvent =
  | {
      type: "request-updated";
      sessionId: string;
      request: DocsEditRequestEntry;
    }
  | {
      type: "proposal-staged";
      sessionId: string;
      proposal: DocsEditProposal;
    }
  | {
      type: "thread-updated";
      sessionId: string;
      alias: string;
      request: DocsEditRequestEntry;
    }
  | {
      type: "session-status";
      sessionId: string;
      status: DocsEditSessionStatus;
    }
  | {
      type: "proposal-applied";
      sessionId: string;
      alias: string;
      proposalId: string;
      patchId: string;
      hash: string;
    }
  | {
      type: "proposal-rejected";
      sessionId: string;
      alias: string;
      proposalId: string;
      note?: string;
    }
  | {
      type: "proposal-undone";
      sessionId: string;
      alias: string;
      proposalId: string;
      patchId: string;
      hash: string;
    }
  | {
      type: "agent-turn";
      sessionId: string;
      phase: "started" | "finished" | "failed";
      turn: number;
      aliases: string[];
      error?: string;
    };

export type DocsEditSessionListener = (event: DocsEditSessionEvent) => void;
