// Slice: the queue's derivation — pure functions that turn a session's
// requests into the queue the interaction model runs on. Everything queues:
// nothing runs until Apply, and closed loops become compact records.
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
	/** The one card the batch run is working right now. */
	processing: boolean;
	/** `processing` · `staged` · `queued · next` · `queued · #2` · … */
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
	/** `resolved` | `discarded` | `failed`. */
	stateLabel: string;
	/** The block the record names — `document` for global notes. */
	targetLabel: string;
}

export interface RequestQueueModel {
	/** Every open request, in filing order. */
	queue: QueueEntry[];
	/** Every closed request, in filing order. */
	records: RecordEntry[];
	/** The queue card being worked, or null when the queue is at rest. */
	activeAlias: string | null;
	/** `processing R2 · 1 queued · 1 staged`, or `queue idle`. */
	pipeline: string;
	/** Apply has something to do. */
	canApply: boolean;
}

export interface RequestQueueInput {
	requests: readonly DocEditRequest[];
	proposals: readonly DocEditProposal[];
	/**
	 * Apply has been pressed and the batch has not drained. Only then does a
	 * card read `processing` — before Apply the queue is quiet, however many
	 * notes are waiting in it.
	 */
	applying: boolean;
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

/**
 * The whole REQUESTS-zone model in one pass.
 *
 * `activeAlias` is derived, not tracked: it is the first queued request
 * WITHOUT a staged proposal. Session events already arrive per staged
 * proposal, so the narration advances by itself as each one lands — there is
 * no separate "which one is running" signal to keep in sync (and none to go
 * stale when a host stages out of order).
 */
export function buildRequestQueue({
	requests,
	proposals,
	applying,
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
							: "discarded",
				targetLabel:
					disposition === "global"
						? "document"
						: (requestBlockId(request) ?? "document"),
			});
			continue;
		}
		queueRequests.push(request);
	}

	const unstaged = queueRequests.filter(
		(request) => !stagedAliases.has(request.alias),
	);
	const activeAlias = applying ? (unstaged[0]?.alias ?? null) : null;
	// Positions are counted over what is still WAITING — the processing card
	// is not "queued · next" to itself.
	const waiting = unstaged.filter((request) => request.alias !== activeAlias);

	const queue = queueRequests.map<QueueEntry>((request) => {
		const staged = stagedAliases.has(request.alias);
		const processing = request.alias === activeAlias;
		const waitingIndex = waiting.indexOf(request);
		return {
			request,
			disposition: requestDisposition(request),
			staged,
			processing,
			stateLabel: staged
				? "staged"
				: processing
					? "processing"
					: queuePositionLabel(waitingIndex),
			conflict: conflictedAliases?.has(request.alias) ?? false,
		};
	});

	return {
		queue,
		records,
		activeAlias,
		pipeline: pipelineSummary({
			activeAlias,
			queued: waiting.length,
			staged: queue.filter((entry) => entry.staged).length,
		}),
		canApply: !applying && unstaged.length > 0,
	};
}

/** `queued · next` for the head of the wait, `queued · #n` behind it. */
export function queuePositionLabel(waitingIndex: number): string {
	if (waitingIndex < 0) return "queued";
	return waitingIndex === 0 ? "queued · next" : `queued · #${waitingIndex + 1}`;
}

/** The pipeline line above the queue: what runs, what waits, what is staged. */
export function pipelineSummary({
	activeAlias,
	queued,
	staged,
}: {
	activeAlias: string | null;
	queued: number;
	staged: number;
}): string {
	const parts: string[] = [];
	if (activeAlias) parts.push(`processing ${activeAlias}`);
	if (queued > 0) parts.push(`${queued} queued`);
	if (staged > 0) parts.push(`${staged} staged`);
	return parts.length > 0 ? parts.join(" · ") : "queue idle";
}
