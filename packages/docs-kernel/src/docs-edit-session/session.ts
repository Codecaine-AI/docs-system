/**
 * docs-edit-session/session — one origin document, one stable request queue.
 *
 * Unlike prompt-edit sessions, DocProposals do not form a synthetic working
 * document. Each proposal is dry-run validated and persisted by docs-server's
 * in-process proposal backend, then the service applies it only after explicit
 * human review. The service owns accept/reject/undo ordering; this object owns
 * agent-facing queue state and proposal staging.
 */
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";
import {
	addBundleAnnotationReply,
	normalizeBundlePath,
	resolveBundleAnnotation,
	stageBundleProposal,
} from "@codecaine-ai/docs-server";

import { formatDocsEditRequestsBlock, renderDocsDocument } from "./render";
import type {
	DocsEditProposal,
	DocsEditProposeResult,
	DocsEditRequestAuthor,
	DocsEditRequestEntry,
	DocsEditRequestInput,
	DocsEditSessionEvent,
	DocsEditSessionListener,
	DocsEditSessionStatus,
	DocsEditThreadReply,
} from "./types";
import { isDocsEditRequestTerminal } from "./types";

export interface CreateDocsEditSessionOptions {
	docsRoot: string;
	/** Canonical docs-root-relative bundle path. */
	path: string;
	document: DocDocument;
	baseHash: string;
	requests: DocsEditRequestInput[];
	instruction?: string;
	sessionId?: string;
	now?: () => string;
	/** Awaited after the session has retained a newly staged proposal. */
	onProposalStaged?: (proposal: DocsEditProposal) => void | Promise<void>;
}

export type DocsEditRequestMutationResult =
	| { ok: true; request: DocsEditRequestEntry }
	| { ok: false; message: string };

/** Service/API-friendly alias retained alongside the state-machine name. */
export type DocsEditSimpleResult = DocsEditRequestMutationResult;

export interface DocsEditSession {
	readonly id: string;
	readonly docsRoot: string;
	readonly path: string;
	readonly docId: string;
	readonly baseHash: string;
	readonly instruction?: string;
	status(): DocsEditSessionStatus;
	requests(): readonly DocsEditRequestEntry[];
	proposals(): readonly DocsEditProposal[];
	document(): DocDocument;
	renderedDocument(): string;
	requestsBlock(): string;
	subscribe(listener: DocsEditSessionListener): () => void;
	propose(
		requestAliasOrId: string,
		ops: readonly DocOp[],
		summary: string,
		docPath?: string,
	): Promise<DocsEditProposeResult>;
	resolve(
		aliasOrId: string,
		outcome: "done" | "declined",
		note: string,
	): Promise<DocsEditRequestMutationResult>;
	reply(aliasOrId: string, body: string): Promise<DocsEditRequestMutationResult>;
	appendHumanReply(aliasOrId: string, body: string): Promise<DocsEditRequestMutationResult>;
	addRequest(input: DocsEditRequestInput): DocsEditRequestMutationResult;
	/** Service-side agent turn transition. */
	markWorking(aliases: readonly string[]): void;
	/** Start/settle one non-overlapping agent turn. Empty aliases means every
	 * non-terminal request in the scoped queue. */
	beginAgentTurn(aliases: readonly string[]): void;
	finishAgentTurn(error?: string): void;
	/** Service-side terminal agent/staging failure transition. */
	markFailed(aliasOrId: string, note: string): DocsEditRequestMutationResult;
	/** Review overlays mirrored into the request/proposal snapshots. */
	markApplied(
		aliasOrId: string,
		patchId: string,
		proposalId?: string,
		hash?: string,
	): DocsEditRequestMutationResult;
	markRejected(aliasOrId: string, note?: string): DocsEditRequestMutationResult;
	markUndone(
		aliasOrId: string,
		hash?: string,
	): DocsEditRequestMutationResult;
	/** Replace the active proposal after the service restages a stale one. */
	replaceProposal(
		aliasOrId: string,
		proposal: DocsEditProposal,
	): DocsEditRequestMutationResult;
}

let sessionCounter = 0;

export function createDocsEditSession(
	options: CreateDocsEditSessionOptions,
): DocsEditSession {
	const now = options.now ?? (() => new Date().toISOString());
	const id =
		options.sessionId ??
		`des-${(sessionCounter += 1)}-${Date.now().toString(36)}`;
	const path = options.path;
	const document = options.document;
	const baseHash = options.baseHash;

	let status: DocsEditSessionStatus = "running";
	let entries: DocsEditRequestEntry[] = options.requests.map(
		(request, index) => ({
			alias: `R${index + 1}`,
			annotationId: request.id,
			target: request.target,
			disposition: request.disposition,
			body: request.body,
			author: request.author ?? "human",
			replies: [...(request.thread ?? [])],
			sidecarBacked: request.sidecarBacked ?? false,
			status: "open",
			waitingOnHuman: false,
		}),
	);
	let aliasCounter = entries.length;
	let stagedProposals: DocsEditProposal[] = [];
	let activeTurnAliases: string[] = [];
	const listeners = new Set<DocsEditSessionListener>();

	function emit(event: DocsEditSessionEvent): void {
		for (const listener of listeners) listener(event);
	}

	function findEntry(aliasOrId: string): DocsEditRequestEntry | undefined {
		const wanted = aliasOrId.trim();
		return entries.find(
			(entry) => entry.alias === wanted || entry.annotationId === wanted,
		);
	}

	function replaceEntry(
		alias: string,
		patch: Partial<DocsEditRequestEntry>,
	): DocsEditRequestEntry {
		let updated: DocsEditRequestEntry | undefined;
		entries = entries.map((entry) => {
			if (entry.alias !== alias) return entry;
			updated = { ...entry, ...patch };
			return updated;
		});
		if (!updated) throw new Error(`docs-edit-session: no entry ${alias}`);
		return updated;
	}

	function refreshStatus(): void {
		const next: DocsEditSessionStatus = entries.every((entry) =>
			isDocsEditRequestTerminal(entry.status),
		)
			? "completed"
			: "running";
		if (next === status) return;
		status = next;
		emit({ type: "session-status", sessionId: id, status });
	}

	function updateRequest(
		entry: DocsEditRequestEntry,
		patch: Partial<DocsEditRequestEntry>,
		thread = false,
	): DocsEditRequestEntry {
		const updated = replaceEntry(entry.alias, patch);
		emit({ type: "request-updated", sessionId: id, request: updated });
		if (thread) {
			emit({
				type: "thread-updated",
				sessionId: id,
				alias: updated.alias,
				request: updated,
			});
		}
		refreshStatus();
		return updated;
	}

	async function propose(
		requestAliasOrId: string,
		ops: readonly DocOp[],
		summary: string,
		docPath?: string,
	): Promise<DocsEditProposeResult> {
		if (typeof summary !== "string" || summary.trim() === "") {
			return {
				ok: false,
				failure: {
					kind: "invalid_params",
					message: "propose_ops requires a non-empty one-line summary.",
				},
			};
		}
		if (!Array.isArray(ops) || ops.length === 0) {
			return {
				ok: false,
				failure: {
					kind: "invalid_params",
					message: "propose_ops requires at least one document operation.",
				},
			};
		}
		const entry = findEntry(requestAliasOrId);
		if (!entry) {
			return {
				ok: false,
				failure: {
					kind: "unknown_request",
					alias: requestAliasOrId.trim(),
				},
			};
		}
		if (isDocsEditRequestTerminal(entry.status)) {
			return {
				ok: false,
				failure: {
					kind: "request_terminal",
					alias: entry.alias,
					status: entry.status,
				},
			};
		}

		const targetPath = docPath ?? path;
		if (typeof targetPath !== "string" || targetPath.trim() === "") {
			return {
				ok: false,
				failure: {
					kind: "invalid_params",
					message:
						"propose_ops docPath must be a non-empty docs-root-relative bundle path.",
				},
			};
		}
		const normalizedTargetPath = normalizeBundlePath(targetPath.trim());
		const normalizedOriginPath = normalizeBundlePath(path);

		try {
			const staged = await stageBundleProposal(
				options.docsRoot,
				targetPath.trim(),
				{
					ops: [...ops],
					summary: summary.trim(),
					...(entry.sidecarBacked &&
						normalizedTargetPath === normalizedOriginPath
						? { annotationId: entry.annotationId }
						: {}),
					alias: entry.alias,
					sessionId: id,
				},
				id,
			);
			if (!staged.ok) {
				return {
					ok: false,
					failure: {
						kind: "stage_failed",
						status: staged.status,
						detail: staged.detail,
						...(staged.issues !== undefined ? { issues: staged.issues } : {}),
						...(staged.current_hash !== undefined
							? { currentHash: staged.current_hash }
							: {}),
						...(staged.expected_hash !== undefined
							? { expectedHash: staged.expected_hash }
							: {}),
					},
				};
			}

			const proposal: DocsEditProposal = {
				proposalId: staged.proposal.id,
				requestAlias: entry.alias,
				docPath: normalizedTargetPath,
				baseHash: staged.proposal.baseHash,
				ops: [...staged.proposal.ops],
				changedBlockIds: [...staged.proposal.changedBlockIds],
				summary: staged.proposal.summary,
				createdAt: staged.proposal.createdAt,
			};
			const existingIndex = stagedProposals.findIndex(
				(candidate) => candidate.requestAlias === entry.alias,
			);
			if (existingIndex < 0) stagedProposals = [...stagedProposals, proposal];
			else {
				// Re-proposals are independent (no synthetic working document). Move
				// the replacement to the end so review order remains staging order.
				stagedProposals = [
					...stagedProposals.filter((_, index) => index !== existingIndex),
					proposal,
				];
			}
			const updated = replaceEntry(entry.alias, {
				status: "ready",
				waitingOnHuman: false,
				proposalId: proposal.proposalId,
			});
			emit({ type: "proposal-staged", sessionId: id, proposal });
			emit({ type: "request-updated", sessionId: id, request: updated });
			refreshStatus();
			await options.onProposalStaged?.(proposal);
			return { ok: true, proposal };
		} catch (error) {
			return {
				ok: false,
				failure: {
					kind: "stage_failed",
					status: 500,
					detail: error instanceof Error ? error.message : String(error),
				},
			};
		}
	}

	async function persistReply(
		entry: DocsEditRequestEntry,
		author: DocsEditRequestAuthor,
		body: string,
	): Promise<string | null> {
		if (!entry.sidecarBacked) return null;
		try {
			const result = await addBundleAnnotationReply(
				options.docsRoot,
				path,
				entry.annotationId,
				{ body, author },
				id,
			);
			return result.ok ? null : result.detail;
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
	}

	async function persistResolution(
		entry: DocsEditRequestEntry,
		response: string,
	): Promise<string | null> {
		if (!entry.sidecarBacked) return null;
		try {
			const result = await resolveBundleAnnotation(
				options.docsRoot,
				path,
				entry.annotationId,
				undefined,
				id,
				response,
			);
			return result.ok ? null : result.detail;
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
	}

	async function resolve(
		aliasOrId: string,
		outcome: "done" | "declined",
		note: string,
	): Promise<DocsEditRequestMutationResult> {
		if (typeof note !== "string" || note.trim() === "") {
			return {
				ok: false,
				message:
					"resolve_request requires a non-empty note — say what you did, or why you declined.",
			};
		}
		const entry = findEntry(aliasOrId);
		if (!entry) {
			return {
				ok: false,
				message: `No request "${aliasOrId.trim()}" in the queue.`,
			};
		}
		if (isDocsEditRequestTerminal(entry.status)) {
			return { ok: false, message: `${entry.alias} is already ${entry.status}.` };
		}

		const closingReply: DocsEditThreadReply = {
			author: "agent",
			body: note.trim(),
			createdAt: now(),
		};
		const nextStatus = outcome === "declined"
			? "declined"
			: entry.proposalId
				? "ready"
				: "resolved";
		const replyError = await persistReply(entry, "agent", note.trim());
		if (replyError) {
			return { ok: false, message: `Could not persist annotation reply: ${replyError}` };
		}
		if (nextStatus === "declined" || nextStatus === "resolved") {
			const resolutionError = await persistResolution(entry, note.trim());
			if (resolutionError) {
				return { ok: false, message: `Could not resolve annotation: ${resolutionError}` };
			}
		}
		const updated = updateRequest(
			entry,
			{
				status: nextStatus,
				note: note.trim(),
				replies: [...entry.replies, closingReply],
				waitingOnHuman: false,
			},
			true,
		);
		return { ok: true, request: updated };
	}

	async function appendReply(
		aliasOrId: string,
		author: DocsEditRequestAuthor,
		body: string,
	): Promise<DocsEditRequestMutationResult> {
		if (typeof body !== "string" || body.trim() === "") {
			return { ok: false, message: "Reply body must be a non-empty string." };
		}
		const entry = findEntry(aliasOrId);
		if (!entry) {
			return {
				ok: false,
				message: `No request "${aliasOrId.trim()}" in the queue.`,
			};
		}
		if (isDocsEditRequestTerminal(entry.status)) {
			return {
				ok: false,
				message: `${entry.alias} is already ${entry.status} — its thread is closed.`,
			};
		}
		const reply: DocsEditThreadReply = {
			author,
			body: body.trim(),
			createdAt: now(),
		};
		const persistenceError = await persistReply(entry, author, body.trim());
		if (persistenceError) {
			return { ok: false, message: `Could not persist annotation reply: ${persistenceError}` };
		}
		const updated = updateRequest(
			entry,
			{
				replies: [...entry.replies, reply],
				status: author === "agent" ? "waiting" : "open",
				waitingOnHuman: author === "agent",
			},
			true,
		);
		return { ok: true, request: updated };
	}

	function addRequest(
		input: DocsEditRequestInput,
	): DocsEditRequestMutationResult {
		if (typeof input?.body !== "string" || input.body.trim() === "") {
			return { ok: false, message: "addRequest requires a non-empty body." };
		}
		if (typeof input.id !== "string" || input.id.trim() === "") {
			return { ok: false, message: "addRequest requires an id." };
		}
		if (findEntry(input.id)) {
			return {
				ok: false,
				message: `Request "${input.id}" is already in the queue.`,
			};
		}
		if (input.target.kind !== "doc") {
			const blockId = input.target.blockId?.trim?.() ?? "";
			if (blockId === "" || document.blocks[blockId] === undefined) {
				return {
					ok: false,
					message: `No block "${blockId}" in the session document to target.`,
				};
			}
		}
		aliasCounter += 1;
		const entry: DocsEditRequestEntry = {
			alias: `R${aliasCounter}`,
			annotationId: input.id.trim(),
			target: input.target,
			disposition: input.disposition,
			body: input.body.trim(),
			author: input.author ?? "human",
			replies: [...(input.thread ?? [])],
			sidecarBacked: input.sidecarBacked ?? false,
			status: "open",
			waitingOnHuman: false,
		};
		entries = [...entries, entry];
		emit({ type: "request-updated", sessionId: id, request: entry });
		refreshStatus();
		return { ok: true, request: entry };
	}

	function markWorking(aliases: readonly string[]): void {
		for (const alias of aliases) {
			const entry = findEntry(alias);
			if (!entry || isDocsEditRequestTerminal(entry.status)) continue;
			updateRequest(entry, { status: "working", waitingOnHuman: false });
		}
	}

	function beginAgentTurn(aliases: readonly string[]): void {
		activeTurnAliases = aliases.length > 0
			? [...new Set(aliases)]
			: entries
				.filter((entry) => !isDocsEditRequestTerminal(entry.status))
				.map((entry) => entry.alias);
		markWorking(activeTurnAliases);
	}

	function finishAgentTurn(error?: string): void {
		for (const alias of activeTurnAliases) {
			const entry = findEntry(alias);
			// A tool may have moved the request to ready/waiting/terminal while the
			// turn was running; settle only entries still owned by the turn marker.
			if (!entry || entry.status !== "working") continue;
			if (error !== undefined) {
				markFailed(alias, error);
				continue;
			}
			updateRequest(entry, {
				status: entry.proposalId ? "ready" : entry.waitingOnHuman ? "waiting" : "open",
			});
		}
		activeTurnAliases = [];
	}

	function markFailed(
		aliasOrId: string,
		note: string,
	): DocsEditRequestMutationResult {
		const entry = findEntry(aliasOrId);
		if (!entry) {
			return { ok: false, message: `No request "${aliasOrId.trim()}" in the queue.` };
		}
		const updated = updateRequest(entry, {
			status: "failed",
			waitingOnHuman: false,
			note: note.trim() || "Docs edit failed.",
		});
		return { ok: true, request: updated };
	}

	function markApplied(
		aliasOrId: string,
		patchId: string,
		proposalId?: string,
		hash = baseHash,
	): DocsEditRequestMutationResult {
		const entry = findEntry(aliasOrId);
		if (!entry) {
			return { ok: false, message: `No request "${aliasOrId.trim()}" in the queue.` };
		}
		const activeProposalId = proposalId ?? entry.proposalId;
		if (!activeProposalId) {
			return { ok: false, message: `${entry.alias} has no staged proposal.` };
		}
		stagedProposals = stagedProposals.map((proposal) =>
			proposal.proposalId === activeProposalId
				? { ...proposal, patchId }
				: proposal,
		);
		const updated = updateRequest(entry, {
			status: "applied",
			waitingOnHuman: false,
			proposalId: activeProposalId,
		});
		emit({
			type: "proposal-applied",
			sessionId: id,
			alias: entry.alias,
			proposalId: activeProposalId,
			patchId,
			hash,
		});
		return { ok: true, request: updated };
	}

	function markRejected(
		aliasOrId: string,
		note?: string,
	): DocsEditRequestMutationResult {
		const entry = findEntry(aliasOrId);
		if (!entry) {
			return { ok: false, message: `No request "${aliasOrId.trim()}" in the queue.` };
		}
		if (!entry.proposalId) {
			return { ok: false, message: `${entry.alias} has no staged proposal.` };
		}
		const updated = updateRequest(entry, {
			status: "declined",
			waitingOnHuman: false,
			...(note?.trim() ? { note: note.trim() } : {}),
		});
		emit({
			type: "proposal-rejected",
			sessionId: id,
			alias: entry.alias,
			proposalId: entry.proposalId,
			...(note !== undefined ? { note } : {}),
		});
		return { ok: true, request: updated };
	}

	function markUndone(
		aliasOrId: string,
		hash = baseHash,
	): DocsEditRequestMutationResult {
		const entry = findEntry(aliasOrId);
		if (!entry) {
			return { ok: false, message: `No request "${aliasOrId.trim()}" in the queue.` };
		}
		const proposal = stagedProposals.find(
			(candidate) => candidate.proposalId === entry.proposalId,
		);
		if (!proposal?.patchId) {
			return { ok: false, message: `${entry.alias} has no applied patch to undo.` };
		}
		stagedProposals = stagedProposals.map((candidate) => {
			if (candidate.proposalId !== proposal.proposalId) return candidate;
			const { patchId: _patchId, ...withoutPatch } = candidate;
			return withoutPatch;
		});
		const updated = updateRequest(entry, {
			status: "ready",
			waitingOnHuman: false,
		});
		emit({
			type: "proposal-undone",
			sessionId: id,
			alias: entry.alias,
			proposalId: proposal.proposalId,
			patchId: proposal.patchId,
			hash,
		});
		return { ok: true, request: updated };
	}

	function replaceProposal(
		aliasOrId: string,
		proposal: DocsEditProposal,
	): DocsEditRequestMutationResult {
		const entry = findEntry(aliasOrId);
		if (!entry) {
			return { ok: false, message: `No request "${aliasOrId.trim()}" in the queue.` };
		}
		const oldProposal = stagedProposals.find(
			(candidate) => candidate.requestAlias === entry.alias,
		);
		const replacement: DocsEditProposal = {
			...proposal,
			requestAlias: entry.alias,
			...(oldProposal
				? {
					supersededProposalIds: [
						...(oldProposal.supersededProposalIds ?? []),
						oldProposal.proposalId,
					],
				}
				: {}),
		};
		if (oldProposal) {
			stagedProposals = stagedProposals.map((candidate) =>
				candidate.requestAlias === entry.alias ? replacement : candidate,
			);
		} else stagedProposals = [...stagedProposals, replacement];
		const updated = updateRequest(entry, {
			status: "ready",
			waitingOnHuman: false,
			proposalId: replacement.proposalId,
		});
		emit({ type: "proposal-staged", sessionId: id, proposal: replacement });
		return { ok: true, request: updated };
	}

	return {
		id,
		docsRoot: options.docsRoot,
		path,
		docId: document.id,
		baseHash,
		instruction: options.instruction,
		status: () => status,
		requests: () => entries,
		proposals: () => stagedProposals,
		document: () => document,
		renderedDocument: () => renderDocsDocument(document),
		requestsBlock: () => formatDocsEditRequestsBlock(entries),
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		propose,
		resolve,
		reply: (aliasOrId, body) => appendReply(aliasOrId, "agent", body),
		appendHumanReply: (aliasOrId, body) =>
			appendReply(aliasOrId, "human", body),
		addRequest,
		markWorking,
		beginAgentTurn,
		finishAgentTurn,
		markFailed,
		markApplied,
		markRejected,
		markUndone,
		replaceProposal,
	};
}
