import type {
	DocChangeSetView,
} from "@codecaine-ai/docs-viewer/lab";

import {
	isFailure,
	type DocsEditSessionState,
	type DocsEditSessionStreamEvent,
	type DocsKernelClient,
} from "./docs-kernel-client";

import type { CreateDocsKernelSessionSourceOptions, DocsKernelSessionSource, DocsKernelSessionSnapshot, DocsKernelSessionActionResult } from "./docs-kernel-session-types";
import { docsKernelFailureMessage, reduceDocsEditSessionEvent, normalizedDocPath, settled, miss } from "./docs-kernel-session-state";
import { createDocsKernelReviewActions } from "./docs-kernel-session-actions";
import { createDocsKernelSessionSnapshot } from "./docs-kernel-session-snapshot";

export type { DocsKernelSessionSnapshot, DocsKernelSessionActionResult, DocsKernelSessionHandle, DocsKernelSessionSource, CreateDocsKernelSessionSourceOptions } from "./docs-kernel-session-types";
export { docsKernelSessionApplying, reduceDocsEditSessionEvent, docsKernelFailureMessage } from "./docs-kernel-session-state";
export { probeKernelHealth } from "./docs-kernel-health";

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

	async function review(
		annotationId: string,
		proposalId: string | undefined,
		call: (sessionId: string, alias: string, proposalId?: string) => ReturnType<
			DocsKernelClient["acceptProposal"]
		>,
		toEvent: (result: Record<string, unknown>, sessionId: string, alias: string) =>
			DocsEditSessionStreamEvent,
	): Promise<DocsKernelSessionActionResult> {
		const current = state;
		const alias = aliasFor(annotationId);
		if (!current || !alias) return miss();
		const result = await call(current.sessionId, alias, proposalId);
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

		...createDocsKernelReviewActions(options, review),

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
			snapshot = createDocsKernelSessionSnapshot(
				state, starting, startingAnnotationIds, changesets, sessionError, streamError,
			);
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
