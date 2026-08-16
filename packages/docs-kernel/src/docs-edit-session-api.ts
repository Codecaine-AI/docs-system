/**
 * Docs-edit session routes. The service prevents live sessions from touching
 * overlapping normalized doc paths; this module validates the wire shape, maps typed failures to
 * HTTP responses, and forwards the service event stream as SSE.
 *
 *   POST   <prefix>/docs-edit-sessions
 *   GET    <prefix>/docs-edit-sessions
 *   GET    <prefix>/docs-edit-sessions/:id
 *   GET    <prefix>/docs-edit-sessions/:id/events
 *   POST   <prefix>/docs-edit-sessions/:id/requests
 *   POST   <prefix>/docs-edit-sessions/:id/accept-all
 *   POST   <prefix>/docs-edit-sessions/:id/requests/:alias/accept
 *   POST   <prefix>/docs-edit-sessions/:id/requests/:alias/reject
 *   POST   <prefix>/docs-edit-sessions/:id/requests/:alias/undo
 *   POST   <prefix>/docs-edit-sessions/:id/requests/:alias/replies
 *   DELETE <prefix>/docs-edit-sessions/:id
 *
 * Mutations answer 403 when writes are disabled, reads answer 404 for an
 * unknown session, review conflicts answer 409 with their typed failure, and
 * malformed input answers 400 + { errors }. Create additionally maps an
 * unknown doc path to 404, agent-busy / empty-scope to 409, and launch errors
 * to 422. In-process docs-server apply/reject/undo failures carry the typed
 * failure through unchanged; stale-document conflicts retain the 409 idiom.
 *
 * The SSE stream sends one session-state snapshot on connect, then every
 * service event as `data: <json>\n\n`, closing after session-disposed.
 */
import { Elysia } from "elysia";

import type {
	AcceptDocsEditProposalResult,
	DocsEditAcceptAllResult,
	DocsEditSessionService,
	RejectDocsEditProposalResult,
	UndoAcceptedDocsProposalResult,
} from "./docs-edit-session/service";

export interface CreateDocsEditSessionApiOptions {
	prefix?: string;
	/** Overrides the service's write gate when provided. */
	allowWrites?: boolean;
}

function normalizePrefix(prefix: string): string {
	if (prefix === "/") return "";
	return prefix.startsWith("/") ? prefix : `/${prefix}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failureErrors(failure: unknown): string[] {
	if (!isPlainObject(failure)) return ["Docs edit failed"];
	if (
		Array.isArray(failure.errors) &&
		failure.errors.every((error) => typeof error === "string")
	) {
		return failure.errors;
	}
	if (typeof failure.detail === "string") return [failure.detail];
	if (typeof failure.message === "string") return [failure.message];
	return ["Docs edit failed"];
}

type ReviewResult =
	| AcceptDocsEditProposalResult
	| RejectDocsEditProposalResult
	| UndoAcceptedDocsProposalResult;

/** Accept-all failures are atomic review conflicts and retain their batch result. */
function answerAcceptAll(
	result: DocsEditAcceptAllResult | null,
	sessionId: string,
	set: { status?: number | string },
): unknown {
	if (result === null) {
		set.status = 404;
		return { error: `Docs-edit session ${sessionId} not found` };
	}
	if (!result.ok) set.status = 409;
	return result;
}

/** Shared failure mapping for accept/reject/undo. */
function answerReview(
	result: ReviewResult | null,
	sessionId: string,
	set: { status?: number | string },
): unknown {
	if (result === null) {
		set.status = 404;
		return { error: `Docs-edit session ${sessionId} not found` };
	}
	if (result.ok) return result;
	const failure = result.failure;
	switch (failure.kind) {
		case "writes_disabled":
			set.status = 403;
			return {
				error: "Docs writes are disabled — the kernel is not running in dev mode",
			};
		case "unknown_request":
			set.status = 404;
			return { error: `Request ${failure.alias} not found`, failure };
		case "apply_failure":
		case "reject_failed":
		case "undo_failed":
			if (failure.status === 409) {
				set.status = 409;
				return {
					...("currentHash" in failure
						? { currentHash: failure.currentHash }
						: {}),
					failure,
				};
			}
			set.status = 400;
			return { errors: failureErrors(failure), failure };
		default:
			// Review-order/state conflicts: out_of_order, no_staged_proposal,
			// already_applied, not_applied, not_latest_applied.
			set.status = 409;
			return { failure };
	}
}

export function createDocsEditSessionApi(
	sessions: DocsEditSessionService,
	options: CreateDocsEditSessionApiOptions = {},
) {
	const prefix = normalizePrefix(options.prefix ?? "/kernel");
	const allowWrites = options.allowWrites ?? sessions.allowWrites;

	const readOnly = (set: { status?: number | string }) => {
		set.status = 403;
		return {
			error: "Docs writes are disabled — the kernel is not running in dev mode",
		};
	};

	const notFound = (sessionId: string, set: { status?: number | string }) => {
		set.status = 404;
		return { error: `Docs-edit session ${sessionId} not found` };
	};

	return new Elysia()
		.post(`${prefix}/docs-edit-sessions`, async ({ body, set }) => {
			if (!allowWrites) return readOnly(set);
			try {
				const input = body === undefined || body === null ? {} : body;
				if (!isPlainObject(input)) {
					set.status = 400;
					return { errors: ["docs-edit-session: expected an object body"] };
				}
				const errors: string[] = [];
				if (typeof input.path !== "string" || input.path.trim() === "") {
					errors.push("path: expected a non-empty string");
				}
				if (
					input.instruction !== undefined &&
					typeof input.instruction !== "string"
				) {
					errors.push("instruction: expected a string");
				}
				if (
					input.sessionId !== undefined &&
					typeof input.sessionId !== "string"
				) {
					errors.push("sessionId: expected a string");
				}
				if (input.spawn !== undefined && typeof input.spawn !== "boolean") {
					errors.push("spawn: expected a boolean");
				}
				if (
					input.extraRequests !== undefined &&
					!Array.isArray(input.extraRequests)
				) {
					errors.push("extraRequests: expected an array");
				}
				if (input.requestIds !== undefined) {
					if (
						!Array.isArray(input.requestIds) ||
						input.requestIds.some((id) => typeof id !== "string")
					) {
						errors.push("requestIds: expected an array of strings");
					} else if (input.requestIds.length === 0) {
						errors.push("requestIds: expected at least one id");
					}
				}
				if (errors.length > 0) {
					set.status = 400;
					return { errors };
				}

				const result = await sessions.createSession({
					path: input.path as string,
					instruction: input.instruction as string | undefined,
					sessionId: input.sessionId as string | undefined,
					spawn: input.spawn as boolean | undefined,
					requestIds: input.requestIds as string[] | undefined,
					// Request-shape problems surface as typed session/launch failures;
					// the wire check above deliberately stays structural.
					extraRequests: input.extraRequests as never,
				});
				if (!result.ok) {
					if (result.reason === "unknown-doc") {
						set.status = 404;
						return {
							error: `Doc path ${input.path as string} not found`,
							failure: result,
						};
					}
					if (result.reason === "agent-busy") {
						set.status = 409;
						return {
								error: `Doc path ${result.path} already has an open docs-edit session (${result.sessionId})`,
							failure: result,
						};
					}
					if (result.reason === "empty-scope") {
						set.status = 409;
						return {
							error:
								"None of the requested annotations is an open agent request",
							failure: result,
						};
					}
					set.status = 422;
					return { errors: result.errors, failure: result };
				}
				set.status = 201;
				return { state: result.state };
			} catch (error) {
				console.error("Error creating docs-edit session:", error);
				set.status = 500;
				return { error: "Failed to create docs-edit session" };
			}
		})
		.get(`${prefix}/docs-edit-sessions`, () => ({
			sessions: sessions.list(),
		}))
		.get(`${prefix}/docs-edit-sessions/:id`, ({ params, set }) => {
			const state = sessions.getState(params.id);
			if (!state) return notFound(params.id, set);
			return { state };
		})
		.get(`${prefix}/docs-edit-sessions/:id/events`, ({ params, set }) => {
			const state = sessions.getState(params.id);
			if (!state) return notFound(params.id, set);

			const encoder = new TextEncoder();
			let unsubscribe: (() => void) | null = null;
			let closed = false;
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					const close = () => {
						if (closed) return;
						closed = true;
						unsubscribe?.();
						unsubscribe = null;
						try {
							controller.close();
						} catch {
							// Already closed by the consumer.
						}
					};
					const send = (event: unknown) => {
						if (closed) return;
						try {
							controller.enqueue(
								encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
							);
						} catch {
							close();
						}
					};
					send({
						type: "session-state",
						sessionId: params.id,
						state,
					});
					unsubscribe = sessions.subscribe(params.id, (event) => {
						send(event);
						if (event.type === "session-disposed") close();
					});
					if (!unsubscribe) close();
				},
				cancel() {
					closed = true;
					unsubscribe?.();
					unsubscribe = null;
				},
			});
			return new Response(stream, {
				headers: {
					"content-type": "text/event-stream",
					"cache-control": "no-cache",
					connection: "keep-alive",
				},
			});
		})
		.post(`${prefix}/docs-edit-sessions/:id/requests`, async ({ params, body, set }) => {
			if (!allowWrites) return readOnly(set);
			try {
				if (!isPlainObject(body)) {
					set.status = 400;
					return { errors: ["request: expected an object body"] };
				}
				if (typeof body.body !== "string" || body.body.trim() === "") {
					set.status = 400;
					return { errors: ["body: expected a non-empty string"] };
				}
				if (body.target === undefined) {
					set.status = 400;
					return { errors: ["target: required"] };
				}
				const result = await sessions.addHumanRequest(params.id, {
					id: typeof body.id === "string" ? body.id : undefined,
					target: body.target as never,
					body: body.body,
					author: body.author as never,
				});
				if (result === null) return notFound(params.id, set);
				if (!result.ok) {
					set.status = 400;
					return { errors: [result.message] };
				}
				return result;
			} catch (error) {
				console.error("Error adding docs-edit session request:", error);
				set.status = 500;
				return { error: "Failed to add docs-edit session request" };
			}
		})
		.post(
			`${prefix}/docs-edit-sessions/:id/accept-all`,
			async ({ params, set }) => {
				if (!allowWrites) return readOnly(set);
				try {
					return answerAcceptAll(
						await sessions.acceptAll(params.id),
						params.id,
						set,
					);
				} catch (error) {
					console.error("Error accepting all docs-edit proposals:", error);
					set.status = 500;
					return { error: "Failed to accept all docs-edit proposals" };
				}
			},
		)
		.post(
			`${prefix}/docs-edit-sessions/:id/requests/:alias/accept`,
			async ({ params, set }) => {
				if (!allowWrites) return readOnly(set);
				try {
					return answerReview(
						await sessions.acceptProposal(params.id, params.alias),
						params.id,
						set,
					);
				} catch (error) {
					console.error("Error accepting docs-edit proposal:", error);
					set.status = 500;
					return { error: "Failed to accept docs-edit proposal" };
				}
			},
		)
		.post(
			`${prefix}/docs-edit-sessions/:id/requests/:alias/reject`,
			async ({ params, body, set }) => {
				if (!allowWrites) return readOnly(set);
				try {
					const input = body === undefined || body === null ? {} : body;
					if (!isPlainObject(input)) {
						set.status = 400;
						return { errors: ["reject: expected an object body"] };
					}
					if (input.note !== undefined && typeof input.note !== "string") {
						set.status = 400;
						return { errors: ["note: expected a string"] };
					}
					return answerReview(
						await sessions.rejectProposal(params.id, params.alias, input.note),
						params.id,
						set,
					);
				} catch (error) {
					console.error("Error rejecting docs-edit proposal:", error);
					set.status = 500;
					return { error: "Failed to reject docs-edit proposal" };
				}
			},
		)
		.post(
			`${prefix}/docs-edit-sessions/:id/requests/:alias/undo`,
			async ({ params, set }) => {
				if (!allowWrites) return readOnly(set);
				try {
					return answerReview(
						await sessions.undoAccepted(params.id, params.alias),
						params.id,
						set,
					);
				} catch (error) {
					console.error("Error undoing docs-edit proposal:", error);
					set.status = 500;
					return { error: "Failed to undo docs-edit proposal" };
				}
			},
		)
		.post(
			`${prefix}/docs-edit-sessions/:id/requests/:alias/replies`,
			async ({ params, body, set }) => {
				if (!allowWrites) return readOnly(set);
				try {
					if (
						!isPlainObject(body) ||
						typeof body.body !== "string" ||
						body.body.trim() === ""
					) {
						set.status = 400;
						return { errors: ["body: expected a non-empty string"] };
					}
					const result = await sessions.replyToRequest(
						params.id,
						params.alias,
						body.body,
					);
					if (result === null) return notFound(params.id, set);
					if (!result.ok) {
						set.status = 400;
						return { errors: [result.message] };
					}
					return result;
				} catch (error) {
					console.error("Error replying to docs-edit request:", error);
					set.status = 500;
					return { error: "Failed to reply to docs-edit request" };
				}
			},
		)
		.delete(`${prefix}/docs-edit-sessions/:id`, ({ params, set }) => {
			if (!allowWrites) return readOnly(set);
			if (!sessions.dispose(params.id)) return notFound(params.id, set);
			return { ok: true };
		});
}
