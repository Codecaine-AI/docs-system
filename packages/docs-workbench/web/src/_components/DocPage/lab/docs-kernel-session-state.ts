import type { DocEditRequestStatus } from "@codecaine-ai/docs-viewer/lab";
import type { DocsEditSessionState, DocsEditSessionStreamEvent, DocsKernelClientFailure } from "./docs-kernel-client";
import type { DocsKernelSessionSnapshot, DocsKernelSessionActionResult } from "./docs-kernel-session-types";

/** The queue is applying while session creation or an agent turn is in flight. */
export function docsKernelSessionApplying(
	snapshot: Pick<DocsKernelSessionSnapshot, "starting" | "state">,
): boolean {
	return snapshot.starting || Boolean(snapshot.state?.agent.running);
}

function replaceRequest(
	state: DocsEditSessionState,
	alias: string,
	replacement: DocsEditSessionState["requests"][number],
): DocsEditSessionState {
	return {
		...state,
		requests: state.requests.map((request) =>
			request.alias === alias ? replacement : request,
		),
	};
}

/** Pure, idempotent reduction of the session SSE vocabulary. */
export function reduceDocsEditSessionEvent(
	state: DocsEditSessionState,
	event: Exclude<DocsEditSessionStreamEvent, { type: "session-disposed" }>,
): DocsEditSessionState {
	if (event.type === "session-state") return event.state;
	if (event.sessionId !== state.sessionId) return state;
	switch (event.type) {
		case "request-updated":
		case "thread-updated":
			return replaceRequest(state, event.request.alias, event.request);
		case "proposal-staged": {
			const proposal = { ...event.proposal, review: "pending" as const };
			const found = state.proposals.some(
				(candidate) => candidate.proposalId === proposal.proposalId,
			);
			return {
				...state,
				proposals: found
					? state.proposals.map((candidate) =>
							candidate.proposalId === proposal.proposalId
								? { ...candidate, ...proposal }
								: candidate,
						)
					: [...state.proposals, proposal],
			};
		}
		case "session-status":
			return { ...state, status: event.status };
		case "proposal-applied":
		case "proposal-rejected":
		case "proposal-undone": {
			const review =
				event.type === "proposal-applied"
					? "applied"
					: event.type === "proposal-rejected"
						? "rejected"
						: "undone";
			const status: DocEditRequestStatus =
				event.type === "proposal-applied"
					? "applied"
					: event.type === "proposal-rejected"
						? "declined"
						: "ready";
			return {
				...state,
				...(event.type === "proposal-applied" || event.type === "proposal-undone"
					? { currentHash: event.hash }
					: {}),
				requests: state.requests.map((request) =>
					request.alias === event.alias
						? {
								...request,
								status,
								review,
								waitingOnHuman: false,
								...(event.type === "proposal-rejected" && event.note
									? { note: event.note }
									: {}),
							}
						: request,
				),
				proposals: state.proposals.map((proposal) =>
					proposal.proposalId === event.proposalId
						? {
								...proposal,
								review,
								...("patchId" in event ? { patchId: event.patchId } : {}),
							}
						: proposal,
				),
			};
		}
		case "agent-turn":
			return {
				...state,
				agent: {
					...state.agent,
					running: event.phase === "started",
					turns: Math.max(state.agent.turns, event.turn),
					...(event.phase === "failed" ? { error: event.error } : {}),
				},
			};
		case "changeset-updated":
			return state;
	}
}

export function docsKernelFailureMessage(failure: DocsKernelClientFailure): string {
	if (failure.offline || failure.status === 0) return "docs agent not connected";
	if (
		failure.status === 400 &&
		failure.errors.some((error) => error.startsWith("corpus: unknown corpus"))
	) {
		return "The docs kernel doesn't serve this corpus — restart it with this corpus registered.";
	}
	const typed = failure.failure;
	if (typed && typeof typed === "object" && "reason" in typed) {
		if (typed.reason === "agent-busy") {
			return "The docs agent is busy with another document.";
		}
		if (typed.reason === "unknown-doc") {
			return "The docs agent is running against a different docs root — it doesn't know this document.";
		}
		if (typed.reason === "empty-scope") {
			return "none of the queued notes is an open request";
		}
	}
	if (typed && typeof typed === "object" && "kind" in typed) {
		if (typed.kind === "out_of_order") {
			return "accept proposals in staging order";
		}
	}
	if (
		failure.status === 404 &&
		failure.errors.some((message) =>
			/(?:doc|document).*(?:path)?.*not found|not found.*(?:doc|document)/i.test(
				message,
			),
		)
	) {
		return "The docs agent is running against a different docs root — it doesn't know this document.";
	}
	return failure.errors.join("; ") || `request failed (${failure.status})`;
}

const TERMINAL = new Set<DocEditRequestStatus>([
	"applied",
	"declined",
	"resolved",
	"failed",
]);

export function normalizedDocPath(path: string): string {
	const withForwardSlashes = path.replaceAll("\\", "/");
	if (withForwardSlashes.toLowerCase() === "doc.json") return "";
	if (withForwardSlashes.toLowerCase().endsWith("/doc.json")) {
		return withForwardSlashes.slice(0, -"/doc.json".length);
	}
	if (withForwardSlashes.toLowerCase().endsWith(".json")) {
		return withForwardSlashes.slice(0, -".json".length);
	}
	return withForwardSlashes.replace(/\/+$/, "");
}

export function settled(candidate: DocsEditSessionState): boolean {
	return (
		candidate.status === "completed" &&
		!candidate.agent.running &&
		!candidate.agent.rerunPending &&
		candidate.requests.every((request) => TERMINAL.has(request.status)) &&
		candidate.proposals.every(
			(proposal) =>
				proposal.review === "applied" || proposal.review === "rejected",
		)
	);
}

export function miss(): DocsKernelSessionActionResult {
	return { ok: false, miss: true, message: "request is not in the live session" };
}

