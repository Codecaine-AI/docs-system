// Slice: the queue's derivation — pure functions that turn a session's
// requests into the queue the lab panel renders. Open requests queue, and
// closed loops become compact records.
//
// No React, no DOM — the lab feeds it the session and renders the result.

import type {
	DocEditProposal,
	DocEditRequest,
	DocEditRequestStatus,
	DocRequestDisposition,
} from "./doc-edit-session";

/** Statuses that mean the loop is CLOSED — a record, not a live request. */
const DISPOSED: ReadonlySet<DocEditRequestStatus> = new Set([
	"applied",
	"declined",
	"resolved",
	"failed",
]);

export function isDisposedStatus(status: DocEditRequestStatus): boolean {
	return DISPOSED.has(status);
}

/**
 * The request's disposition. ADDITIVE default for requests filed before
 * dispositions existed: document notes are `global`, anything else is a
 * queue card (`batch`).
 */
export function requestDisposition(
	request: Pick<DocEditRequest, "disposition" | "target">,
): DocRequestDisposition {
	if (request.disposition) return request.disposition;
	return request.target.kind === "doc" ? "global" : "batch";
}

/** One live queue card (batch/global, loop still open). */
export interface QueueEntry {
	request: DocEditRequest;
	disposition: DocRequestDisposition;
	/** A proposal for this request is staged and waiting on the human. */
	staged: boolean;
	/** `staged` · `queued · next` · `queued · #2` · … */
	stateLabel: string;
	/** An accepted change has moved the block this note was filed against. */
	conflict: boolean;
}

/** One closed request, as the compact `✓ R4 · target · resolved` record. */
export interface RecordEntry {
	request: DocEditRequest;
	disposition: DocRequestDisposition;
	/** Accepted/closed cleanly (`applied` | `resolved`) vs declined or failed. */
	ok: boolean;
	/** `resolved` | `rejected` | `failed`. */
	stateLabel: string;
	/** The block the record names — `document` for global notes. */
	targetLabel: string;
}

export interface RequestQueueModel {
	/** Every open request, in filing order. */
	queue: QueueEntry[];
	/** Every closed request, in filing order. */
	records: RecordEntry[];
	/** `1 queued · 1 staged`, or `queue idle`. */
	pipeline: string;
}

export interface RequestQueueInput {
	requests: readonly DocEditRequest[];
	proposals: readonly DocEditProposal[];
	/** Aliases whose filed target has drifted. */
	conflictedAliases?: ReadonlySet<string>;
}

/** The block id a request names, or null for document-level notes. */
export function requestBlockId(
	request: Pick<DocEditRequest, "target">,
): string | null {
	const target = request.target;
	return target.kind === "doc" ? null : target.blockId;
}

/** The whole REQUESTS-zone model in one pass. */
export function buildRequestQueue({
	requests,
	proposals,
	conflictedAliases,
}: RequestQueueInput): RequestQueueModel {
	const stagedAliases = new Set(proposals.map((proposal) => proposal.alias));

	const queueRequests: DocEditRequest[] = [];
	const records: RecordEntry[] = [];

	for (const request of requests) {
		const disposition = requestDisposition(request);
		if (isDisposedStatus(request.status)) {
			const ok = request.status === "applied" || request.status === "resolved";
			records.push({
				request,
				disposition,
				ok,
				stateLabel:
					request.status === "failed"
						? "failed"
						: ok
							? "resolved"
							: "rejected",
				targetLabel:
					disposition === "global"
						? "document"
						: (requestBlockId(request) ?? "document"),
			});
			continue;
		}
		queueRequests.push(request);
	}

	// Positions are counted over what is still WAITING on a proposal.
	const waiting = queueRequests.filter(
		(request) => !stagedAliases.has(request.alias),
	);

	const queue = queueRequests.map<QueueEntry>((request) => {
		const staged = stagedAliases.has(request.alias);
		return {
			request,
			disposition: requestDisposition(request),
			staged,
			stateLabel: staged
				? "staged"
				: queuePositionLabel(waiting.indexOf(request)),
			conflict: conflictedAliases?.has(request.alias) ?? false,
		};
	});

	return {
		queue,
		records,
		pipeline: pipelineSummary({
			queued: waiting.length,
			staged: queue.filter((entry) => entry.staged).length,
		}),
	};
}

/** `queued · next` for the head of the wait, `queued · #n` behind it. */
export function queuePositionLabel(waitingIndex: number): string {
	if (waitingIndex < 0) return "queued";
	return waitingIndex === 0 ? "queued · next" : `queued · #${waitingIndex + 1}`;
}

/** The pipeline line above the queue: what waits and what is staged. */
export function pipelineSummary({
	queued,
	staged,
}: {
	queued: number;
	staged: number;
}): string {
	const parts: string[] = [];
	if (queued > 0) parts.push(`${queued} queued`);
	if (staged > 0) parts.push(`${staged} staged`);
	return parts.length > 0 ? parts.join(" · ") : "queue idle";
}
