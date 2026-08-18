import type {
	DocChangeSetView,
	DocEditRequestStatus,
} from "@codecaine-ai/docs-viewer/lab";

import {
	isFailure,
	type DocsEditSessionState,
	type DocsEditSessionStreamEvent,
	type DocsKernelClient,
	type DocsKernelClientFailure,
} from "./docs-kernel-client";

export interface DocsKernelSessionSnapshot {
	live: boolean;
	starting: boolean;
	state: DocsEditSessionState | null;
	statusOverlay: ReadonlyMap<string, DocEditRequestStatus>;
	changesets: ReadonlyMap<string, DocChangeSetView>;
	sessionError?: string;
	streamError?: string;
}

/** The queue is applying while session creation or an agent turn is in flight. */
export function docsKernelSessionApplying(
	snapshot: Pick<DocsKernelSessionSnapshot, "starting" | "state">,
): boolean {
	return snapshot.starting || Boolean(snapshot.state?.agent.running);
}

export type DocsKernelSessionActionResult =
	| { ok: true }
	| { ok: false; miss: true; message: string }
	| { ok: false; miss?: false; message: string };

export interface DocsKernelSessionHandle {
	live(): boolean;
	sessionId(): string | undefined;
	statusOverlay(): ReadonlyMap<string, DocEditRequestStatus>;
	changesets(): ReadonlyMap<string, DocChangeSetView>;
	accept(annotationId: string): Promise<DocsKernelSessionActionResult>;
	reject(annotationId: string, note?: string): Promise<DocsKernelSessionActionResult>;
	undo(annotationId: string): Promise<DocsKernelSessionActionResult>;
	reply(annotationId: string, body: string): Promise<DocsKernelSessionActionResult>;
	subscribe(listener: () => void): () => void;
}

export interface DocsKernelSessionSource extends DocsKernelSessionHandle {
	applyQueue(annotationIds: readonly string[]): Promise<void>;
	endSession(): Promise<void>;
	getSnapshot(): DocsKernelSessionSnapshot;
	dispose(): void;
}

export interface CreateDocsKernelSessionSourceOptions {
	client: DocsKernelClient;
	path: string;
	corpus?: string;
	onSessionEnd: () => void | Promise<void>;
	onDocChanged?: (hash: string) => void | Promise<void>;
	onProposalStaged?: () => void | Promise<void>;
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

const healthProbes = new WeakMap<DocsKernelClient, Promise<boolean>>();

/** One health request per client instance; concurrent callers share it. */
export function probeKernelHealth(client: DocsKernelClient): Promise<boolean> {
	const existing = healthProbes.get(client);
	if (existing) return existing;
	const probe = Promise.resolve(client.health()).catch(() => false);
	healthProbes.set(client, probe);
	return probe;
}

const TERMINAL = new Set<DocEditRequestStatus>([
	"applied",
	"declined",
	"resolved",
	"failed",
]);

function normalizedDocPath(path: string): string {
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

export function createDocsKernelSessionSource(
	options: CreateDocsKernelSessionSourceOptions,
): DocsKernelSessionSource {
	const listeners = new Set<() => void>();
	let state: DocsEditSessionState | null = null;
	let starting = false;
	let startingAnnotationIds = new Set<string>();
	let sessionError: string | undefined;
	let streamError: string | undefined;
	let unsubscribeStream: (() => void) | null = null;
	let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
	let recoveryGeneration = 0;
	let recoveringSession: string | null = null;
	let attaching = false;
	let disposed = false;
	let snapshot: DocsKernelSessionSnapshot | null = null;
	let lastChangedHash: string | null = null;
	const changesets = new Map<string, DocChangeSetView>();
	const endedSessions = new Set<string>();
	const disposingSessions = new Set<string>();

	function notify(): void {
		snapshot = null;
		for (const listener of [...listeners]) listener();
	}

	function cancelRecovery(): void {
		recoveryGeneration += 1;
		recoveringSession = null;
		if (recoveryTimer !== null) clearTimeout(recoveryTimer);
		recoveryTimer = null;
	}

	function stopStream(): void {
		unsubscribeStream?.();
		unsubscribeStream = null;
		cancelRecovery();
	}

	function announceEnd(sessionId: string): void {
		if (endedSessions.has(sessionId)) return;
		endedSessions.add(sessionId);
		void options.onSessionEnd();
	}

	function clearSession(sessionId: string): void {
		if (state?.sessionId !== sessionId) return;
		stopStream();
		state = null;
		changesets.clear();
		notify();
		announceEnd(sessionId);
	}

	function docChanged(hash: string): void {
		if (hash === lastChangedHash) return;
		lastChangedHash = hash;
		void options.onDocChanged?.(hash);
	}

	function settled(candidate: DocsEditSessionState): boolean {
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

	function releaseSettledSession(): void {
		if (!state || !settled(state) || disposingSessions.has(state.sessionId)) return;
		const sessionId = state.sessionId;
		disposingSessions.add(sessionId);
		void options.client.disposeSession(sessionId).then((result) => {
			disposingSessions.delete(sessionId);
			if (isFailure(result) && result.status !== 404) {
				sessionError = docsKernelFailureMessage(result);
				notify();
				return;
			}
			clearSession(sessionId);
		});
	}

	function handleEvent(event: DocsEditSessionStreamEvent): void {
		if (event.type === "session-disposed") {
			clearSession(event.sessionId);
			return;
		}
		if (event.type === "session-state") {
			state = event.state;
			notify();
		} else if (event.type === "changeset-updated") {
			if (state === null || event.sessionId !== state.sessionId) return;
			changesets.set(event.changeset.id, event.changeset);
			notify();
		} else if (state !== null) {
			state = reduceDocsEditSessionEvent(state, event);
			notify();
		} else return;
		if (event.type === "proposal-applied" || event.type === "proposal-undone") {
			docChanged(event.hash);
		}
		if (event.type === "proposal-staged") {
			void options.onProposalStaged?.();
		}
		releaseSettledSession();
	}

	function subscribeStream(sessionId: string): void {
		stopStream();
		streamError = undefined;
		unsubscribeStream = options.client.subscribeSessionEvents(
			sessionId,
			handleEvent,
			(error) => {
				void error;
				recoverStream(sessionId);
			},
		);
	}

	async function attach(sessionId: string): Promise<boolean> {
		if (disposed || state !== null || attaching) return false;
		attaching = true;
		try {
			const result = await options.client.getSession(sessionId);
			if (disposed || state !== null || isFailure(result)) return false;
			state = result.state;
			sessionError = undefined;
			streamError = undefined;
			lastChangedHash = result.state.currentHash;
			subscribeStream(result.state.sessionId);
			notify();
			releaseSettledSession();
			return true;
		} catch {
			return false;
		} finally {
			attaching = false;
		}
	}

	function recoverStream(sessionId: string): void {
		if (
			disposed ||
			state?.sessionId !== sessionId ||
			recoveringSession === sessionId
		) return;
		recoveringSession = sessionId;
		const generation = ++recoveryGeneration;
		const delays = [300, 900, 1_800];

		const attempt = (index: number): void => {
			recoveryTimer = setTimeout(async () => {
				recoveryTimer = null;
				if (
					disposed ||
					generation !== recoveryGeneration ||
					state?.sessionId !== sessionId
				) return;

				let result: Awaited<ReturnType<DocsKernelClient["getSession"]>>;
				try {
					result = await options.client.getSession(sessionId);
				} catch {
					result = { ok: false, status: 0, errors: [], offline: true };
				}
				if (
					disposed ||
					generation !== recoveryGeneration ||
					state?.sessionId !== sessionId
				) return;
				if (!isFailure(result)) {
					state = result.state;
					streamError = undefined;
					subscribeStream(sessionId);
					notify();
					releaseSettledSession();
					return;
				}
				if (result.status === 404) {
					streamError = undefined;
					clearSession(sessionId);
					return;
				}
				if (index + 1 < delays.length) {
					attempt(index + 1);
					return;
				}
				recoveringSession = null;
				streamError =
					"Lost the agent session stream — showing the last known state; reload to re-sync.";
				notify();
			}, delays[index]);
		};

		attempt(0);
	}

	function aliasFor(annotationId: string): string | null {
		return (
			state?.requests.find((request) => request.annotationId === annotationId)
				?.alias ?? null
		);
	}

	function miss(): DocsKernelSessionActionResult {
		return { ok: false, miss: true, message: "request is not in the live session" };
	}

	async function review(
		annotationId: string,
		call: (sessionId: string, alias: string) => ReturnType<
			DocsKernelClient["acceptProposal"]
		>,
		toEvent: (result: Record<string, unknown>, sessionId: string, alias: string) =>
			DocsEditSessionStreamEvent,
	): Promise<DocsKernelSessionActionResult> {
		const current = state;
		const alias = aliasFor(annotationId);
		if (!current || !alias) return miss();
		const result = await call(current.sessionId, alias);
		if (isFailure(result)) {
			const message = docsKernelFailureMessage(result);
			sessionError = message;
			notify();
			return { ok: false, message };
		}
		sessionError = undefined;
		handleEvent(toEvent(result as Record<string, unknown>, current.sessionId, alias));
		return { ok: true };
	}

	const startupReattach = (async () => {
		try {
			const result = await options.client.listSessions();
			if (disposed || state !== null || isFailure(result)) return;
			const path = normalizedDocPath(options.path);
			const match = result.sessions.find(
				(candidate) =>
					candidate.corpus === options.corpus &&
					normalizedDocPath(candidate.path) === path,
			);
			if (match) await attach(match.sessionId);
		} catch {
			// Startup discovery is best-effort; remain detached on failure.
		}
	})();

	const api: DocsKernelSessionSource = {
		async applyQueue(annotationIds) {
			if (disposed || state !== null || starting || attaching) return;
			changesets.clear();
			starting = true;
			startingAnnotationIds = new Set(annotationIds);
			sessionError = undefined;
			notify();
			await startupReattach;
			if (disposed || state !== null || attaching) {
				starting = false;
				startingAnnotationIds.clear();
				notify();
				return;
			}
			const result = await options.client.createSession({
				path: options.path,
				...(options.corpus ? { corpus: options.corpus } : {}),
				...(annotationIds.length > 0 ? { requestIds: [...annotationIds] } : {}),
			});
			starting = false;
			startingAnnotationIds.clear();
			if (disposed) return;
			if (isFailure(result)) {
				const typed = result.failure;
				if (
					typed &&
					typeof typed === "object" &&
					typed.reason === "agent-busy" &&
					typeof typed.sessionId === "string"
				) {
					try {
						const listed = await options.client.listSessions();
						if (!disposed && !isFailure(listed)) {
							const owner = listed.sessions.find(
								(candidate) => candidate.sessionId === typed.sessionId,
							);
							if (
								owner &&
								owner.corpus === options.corpus &&
								normalizedDocPath(owner.path) === normalizedDocPath(options.path)
							) {
								await attach(owner.sessionId);
								return;
							}
							if (owner) {
								sessionError = `The docs agent is busy with another document (${owner.path}).`;
								notify();
								return;
							}
						}
					} catch {
						// Fall through to the generic busy message.
					}
				}
				sessionError = docsKernelFailureMessage(result);
				notify();
				return;
			}
			await attach(result.state.sessionId);
		},

		accept(annotationId) {
			return review(
				annotationId,
				(id, alias) => options.client.acceptProposal(id, alias),
				(result, sessionId, alias) => ({
					type: "proposal-applied",
					sessionId,
					alias,
					proposalId: String(result.proposalId),
					patchId: String(result.patchId),
					hash: String(result.hash),
				}),
			);
		},

		reject(annotationId, note) {
			return review(
				annotationId,
				(id, alias) => options.client.rejectProposal(id, alias, note),
				(result, sessionId, alias) => ({
					type: "proposal-rejected",
					sessionId,
					alias,
					proposalId: String(result.proposalId),
					...(note !== undefined ? { note } : {}),
				}),
			);
		},

		undo(annotationId) {
			return review(
				annotationId,
				(id, alias) => options.client.undoProposal(id, alias),
				(result, sessionId, alias) => ({
					type: "proposal-undone",
					sessionId,
					alias,
					proposalId: String(result.proposalId),
					patchId: String(result.patchId),
					hash: String(result.hash),
				}),
			);
		},

		async reply(annotationId, body) {
			const current = state;
			const alias = aliasFor(annotationId);
			if (!current || !alias) return miss();
			const result = await options.client.replyToRequest(
				current.sessionId,
				alias,
				body,
			);
			if (isFailure(result)) {
				const message = docsKernelFailureMessage(result);
				sessionError = message;
				notify();
				return { ok: false, message };
			}
			sessionError = undefined;
			if (state?.sessionId === current.sessionId) {
				state = reduceDocsEditSessionEvent(state, {
					type: "thread-updated",
					sessionId: current.sessionId,
					alias,
					request: result.request,
				});
			}
			notify();
			return { ok: true };
		},

		async endSession() {
			if (!state) return;
			const sessionId = state.sessionId;
			stopStream();
			const result = await options.client.disposeSession(sessionId);
			if (isFailure(result) && result.status !== 404) {
				sessionError = docsKernelFailureMessage(result);
				notify();
				return;
			}
			clearSession(sessionId);
		},

		live: () => state !== null,

		sessionId: () => state?.sessionId,

		statusOverlay() {
			return api.getSnapshot().statusOverlay;
		},

		changesets() {
			return api.getSnapshot().changesets;
		},

		getSnapshot() {
			if (snapshot) return snapshot;
			const overlay = new Map<string, DocEditRequestStatus>();
			for (const annotationId of startingAnnotationIds) {
				overlay.set(annotationId, "working");
			}
			if (state) {
				for (const request of state.requests) {
					overlay.set(request.annotationId, request.status);
				}
			}
			snapshot = {
				live: state !== null,
				starting,
				state,
				statusOverlay: overlay,
				changesets: new Map(changesets),
				...(sessionError !== undefined ? { sessionError } : {}),
				...(streamError !== undefined ? { streamError } : {}),
			};
			return snapshot;
		},

		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},

		dispose() {
			disposed = true;
			stopStream();
			listeners.clear();
		},
	};

	return api;
}
