// Slice: the docs edit-session PROPS contract (the lab receives everything
// from a host container — it never fetches) plus the pure helpers that enforce
// the staged proposal ordering discipline.

import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";

/**
 * Request lifecycle, mirroring the canvas queue vocabulary:
 * open → working → (waiting ↔) ready → applied | declined, with `resolved`
 * for requests closed without a proposal. `waiting` is the waiting-on-human
 * flag — those requests render an inline amber thread bar.
 */
export type DocEditRequestStatus =
	| "open"
	| "working"
	| "waiting"
	| "ready"
	| "applied"
	| "declined"
	| "resolved"
	| "failed";

/** Where a filed request lives in a document. */
export type DocEditTarget =
	| { kind: "block"; blockId: string; docPath?: string }
	| {
			kind: "text-range";
			blockId: string;
			start: number;
			end: number;
			quote: string;
			docPath?: string;
		}
	| { kind: "doc"; docPath?: string };

/** A request is either queued against a target or filed for the whole document. */
export type DocRequestDisposition = "batch" | "global";

export interface DocEditThreadMessage {
	id: string;
	author: "user" | "agent";
	body: string;
	at: string;
}

/** What the composer hands the host when a note is filed. */
export interface DocRequestFiling {
	annotationId: string;
	disposition: DocRequestDisposition;
	target: DocEditTarget;
	body: string;
}

/** One R-alias request in the session queue. */
export interface DocEditRequest {
	id: string;
	/** Normalized bundle path; absent means the open/session document. */
	docPath?: string;
	/** Queue alias — "R1", "R2", agent-authored notes "A1"… Unique per session. */
	alias: string;
	/** The driving annotation, when the request came from the annotate flow. */
	annotationId?: string;
	target: DocEditTarget;
	body: string;
	status: DocEditRequestStatus;
	/** Closing note recorded when the loop closed, e.g. the rejection reason. */
	note?: string;
	disposition: DocRequestDisposition;
	thread: DocEditThreadMessage[];
	/** True when the original target no longer matches the current document. */
	targetChanged?: boolean;
}

/**
 * A staged (not yet accepted) proposal. `ops` are applied locally by the
 * consumer with docs-model's pure `applyOps`; `changedBlockIds` identify the
 * blocks the staged-region renderer replaces inline.
 */
export interface DocEditProposal {
	transactionId: string;
	/** Normalized bundle path; absent means the open/session document. */
	docPath?: string;
	alias: string;
	summary: string;
	ops: DocOp[];
	changedBlockIds: string[];
	baseHash: string;
}

/**
 * THE props contract between the lab and a session container. Ordering
 * discipline, enforced by the lab's buttons (disabled + tooltip reason,
 * never an error after click):
 *
 * - `proposals` is the STAGING ORDER. Accept is enabled only on the first
 *   staged proposal; later Accepts are disabled until their turn.
 * - Reject is enabled only on the LAST staged proposal.
 * - Undo is enabled only on the request named by `undoableAlias` (the most
 *   recently applied change).
 * - While any proposal is staged the lab blocks manual editing of the blocks
 *   it touches (their regions are replaced by the inline staged review).
 */
export interface DocEditSession {
	requests: DocEditRequest[];
	/** Staged proposals in staging order (accept front-to-back). */
	proposals: DocEditProposal[];
	/** Alias of the most recently APPLIED request — the only undoable one. */
	undoableAlias?: string;
	/** File a request from an inline or document-level composer. */
	onFileRequest?: (filing: DocRequestFiling) => void | Promise<void>;
	onAccept?: (alias: string) => void | Promise<void>;
	onReject?: (alias: string, note?: string) => void | Promise<void>;
	onUndo?: (alias: string) => void | Promise<void>;
	onAcceptAll?: () => void | Promise<void>;
	onDiscardDraft?: () => void | Promise<void>;
	onReplyToRequest?: (alias: string, body: string) => void | Promise<void>;
	/** Launch one batch session for the queued annotation ids, in queue order. */
	onApplyQueue?: (annotationIds: string[]) => void | Promise<void>;
	/** Dismiss a queued note before any run consumes it. */
	onDismissRequest?: (requestId: string) => void | Promise<void>;
}

/** The stable request handle for host callbacks. */
export function requestRunId(
	request: Pick<DocEditRequest, "id" | "annotationId">,
): string {
	return request.annotationId ?? request.id;
}

/* ------------------------------------------------------------------ */
/* Ordering discipline                                                 */
/* ------------------------------------------------------------------ */

/** Why this proposal's Accept is disabled, or null when it may accept. */
export function acceptDisabledReason(
	proposals: readonly DocEditProposal[],
	alias: string,
): string | null {
	const index = proposals.findIndex((proposal) => proposal.alias === alias);
	if (index <= 0) return null;
	return `Accept ${proposals[0]!.alias} first — accepts apply in staging order.`;
}

/** Why this proposal's Reject is disabled, or null when it may reject. */
export function rejectDisabledReason(
	proposals: readonly DocEditProposal[],
	alias: string,
): string | null {
	const index = proposals.findIndex((proposal) => proposal.alias === alias);
	if (index === -1 || index === proposals.length - 1) return null;
	return `Only the latest staged proposal (${proposals[proposals.length - 1]!.alias}) can be rejected.`;
}

/** Why this applied request's Undo is disabled, or null when it may undo. */
export function undoDisabledReason(
	session: Pick<DocEditSession, "undoableAlias">,
	alias: string,
): string | null {
	if (session.undoableAlias === alias) return null;
	return session.undoableAlias
		? `Undo ${session.undoableAlias} first — only the most recent applied change can be undone.`
		: "Nothing to undo.";
}
