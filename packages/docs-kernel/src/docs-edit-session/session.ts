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
	type DocChangeSetView,
	loadDocBundle,
	normalizeBundlePath,
	rejectBundleProposal,
	resolveBundleAnnotation,
	stageBundleProposal,
} from "@codecaine-ai/docs-server";

import {
	formatDocsEditRequestsBlock,
	renderDocsBlockMap,
	renderDocsDocument,
} from "./render";
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
	/** Named corpus that owns docsRoot. */
	corpus?: string;
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
	/** Atomically claim corpus-relative paths before staging persistence. */
	claimPaths?: (paths: readonly string[]) => DocsEditPathClaimResult;
	/** Adopt a generator-persisted change-set without creating a duplicate. */
	onChangeSetStaged?: (changeset: DocChangeSetView) => void | Promise<void>;
	/** Persist removal of proposals superseded before a generator stages replacements. */
	onProposalsSuperseded?: (
		alias: string,
		proposals: readonly DocsEditProposal[],
	) => void | Promise<void>;
}

export type DocsEditRequestMutationResult =
	| { ok: true; request: DocsEditRequestEntry }
	| { ok: false; message: string };

/** Service/API-friendly alias retained alongside the state-machine name. */
export type DocsEditSimpleResult = DocsEditRequestMutationResult;

export type DocsEditPathClaimResult =
	| { ok: true; release: () => void }
	| { ok: false; message: string };

export interface DocsEditSession {
	readonly id: string;
	readonly corpus: string;
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
	claimPaths(paths: readonly string[]): DocsEditPathClaimResult;
	subscribe(listener: DocsEditSessionListener): () => void;
	propose(
		requestAliasOrId: string,
		ops: readonly DocOp[],
		summary: string,
		docPath?: string,
	): Promise<DocsEditProposeResult>;
	adoptChangeSet(
		aliasOrId: string,
		changeset: DocChangeSetView,
		proposals: readonly DocsEditProposal[],
	): Promise<DocsEditRequestMutationResult>;
	supersedeProposals(
		aliasOrId: string,
	): Promise<DocsEditRequestMutationResult>;
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
		proposalId: string,
		hash?: string,
	): DocsEditRequestMutationResult;
	markRejected(
		aliasOrId: string,
		proposalId: string,
		note?: string,
	): DocsEditRequestMutationResult;
	markUndone(
		aliasOrId: string,
		proposalId: string,
		hash?: string,
	): DocsEditRequestMutationResult;
	/** Replace the active proposal after the service restages a stale one. */
	replaceProposal(
		aliasOrId: string,
		proposalId: string,
		proposal: DocsEditProposal,
	): DocsEditRequestMutationResult;
}

type IndexedDocOp = { op: DocOp; opIndex: number };

function docParentMap(document: DocDocument): Map<string, string> {
	const parents = new Map<string, string>();
	for (const block of Object.values(document.blocks)) {
		for (const childId of block.children) parents.set(childId, block.id);
	}
	return parents;
}

function topLevelAncestor(
	document: DocDocument,
	parents: ReadonlyMap<string, string>,
	blockId: string,
): string | null {
	if (blockId === document.root || document.blocks[blockId] === undefined) {
		return null;
	}
	let current = blockId;
	let parent = parents.get(current);
	while (parent !== undefined && parent !== document.root) {
		current = parent;
		parent = parents.get(current);
	}
	return parent === document.root ? current : null;
}

function opTopLevelAncestor(
	document: DocDocument,
	parents: ReadonlyMap<string, string>,
	op: DocOp,
): string | null {
	if (op.type === "insertBlock") {
		return topLevelAncestor(document, parents, op.parentId);
	}
	if (op.type === "moveBlock") {
		const source = topLevelAncestor(document, parents, op.blockId);
		const destination = topLevelAncestor(document, parents, op.toParentId);
		return source !== null && source === destination ? source : null;
	}
	if (op.type === "mergeBlocks") {
		const ancestors = op.blockIds.map((blockId) =>
			topLevelAncestor(document, parents, blockId)
		);
		const first = ancestors[0] ?? null;
		return first !== null && ancestors.every((ancestor) => ancestor === first)
			? first
			: null;
	}
	return topLevelAncestor(document, parents, op.blockId);
}

/** Split one batch into the same contiguous top-level runs used for review. */
function proposalOpGroups(
	document: DocDocument,
	ops: readonly DocOp[],
): DocOp[][] {
	const parents = docParentMap(document);
	const rootChildren = document.blocks[document.root]?.children ?? [];
	const byAncestor = new Map<string, IndexedDocOp[]>();
	const resolvedOps: Array<IndexedDocOp & { ancestor: string }> = [];
	const unresolvedOps: IndexedDocOp[] = [];

	for (const [opIndex, op] of ops.entries()) {
		const indexed = { op, opIndex };
		const ancestor = opTopLevelAncestor(document, parents, op);
		if (ancestor === null) {
			unresolvedOps.push(indexed);
			continue;
		}
		resolvedOps.push({ ...indexed, ancestor });
		const group = byAncestor.get(ancestor) ?? [];
		group.push(indexed);
		byAncestor.set(ancestor, group);
	}

	// Root-level inserts and cross-section structural ops have no single owning
	// section. Keep them with the closest resolvable operation in batch order.
	for (const unresolved of unresolvedOps) {
		let nearest: (IndexedDocOp & { ancestor: string }) | undefined;
		let nearestDistance = Number.POSITIVE_INFINITY;
		for (const candidate of resolvedOps) {
			const distance = Math.abs(candidate.opIndex - unresolved.opIndex);
			if (distance >= nearestDistance) continue;
			nearest = candidate;
			nearestDistance = distance;
		}
		if (nearest === undefined) continue;
		const group = byAncestor.get(nearest.ancestor) ?? [];
		group.push(unresolved);
		byAncestor.set(nearest.ancestor, group);
	}

	const ordered = [...byAncestor.entries()]
		.map(([ancestor, indexedOps]) => ({
			ancestor,
			rootIndex: rootChildren.indexOf(ancestor),
			indexedOps,
		}))
		.filter((group) => group.rootIndex >= 0)
		.sort((a, b) => a.rootIndex - b.rootIndex);
	const merged: Array<{ endIndex: number; indexedOps: IndexedDocOp[] }> = [];
	for (const group of ordered) {
		const previous = merged.at(-1);
		if (previous !== undefined && group.rootIndex === previous.endIndex + 1) {
			previous.endIndex = group.rootIndex;
			previous.indexedOps.push(...group.indexedOps);
			continue;
		}
		merged.push({ endIndex: group.rootIndex, indexedOps: [...group.indexedOps] });
	}

	const groupedOps = merged.map((group) =>
		group.indexedOps
			.sort((a, b) => a.opIndex - b.opIndex)
			.map(({ op }) => op)
	);
	if (resolvedOps.length === 0) groupedOps.push(unresolvedOps.map(({ op }) => op));
	return groupedOps;
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
	const rejectedProposalIds = new Set<string>();
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
		const claimed = options.claimPaths?.([normalizedTargetPath]) ?? {
			ok: true as const,
			release: () => {},
		};
		if (!claimed.ok) {
			return {
				ok: false,
				failure: {
					kind: "stage_failed",
					status: 409,
					detail: claimed.message,
				},
			};
		}
		const proposals: DocsEditProposal[] = [];
		let retained = false;
		try {
			const loaded = await loadDocBundle(options.docsRoot, targetPath.trim());
			if ("error" in loaded) {
				claimed.release();
				return {
					ok: false,
					failure: {
						kind: "stage_failed",
						status: loaded.error.status,
						detail: loaded.error.detail,
					},
				};
			}

			const groupedOps = proposalOpGroups(loaded.document, ops);
			for (const groupOps of groupedOps) {
				const staged = await stageBundleProposal(
					options.docsRoot,
					targetPath.trim(),
					{
						ops: groupOps,
						summary: summary.trim(),
						...(groupedOps.length === 1 &&
							entry.sidecarBacked &&
							normalizedTargetPath === normalizedOriginPath
							? { annotationId: entry.annotationId }
							: {}),
						alias: entry.alias,
						sessionId: id,
					},
					id,
				);
				if (!staged.ok) {
					for (const proposal of proposals) {
						try {
							await rejectBundleProposal(
								options.docsRoot,
								proposal.docPath,
								proposal.proposalId,
								{ sessionId: id },
							);
						} catch {
							// Rollback is best-effort; preserve the original staging failure.
						}
					}
					claimed.release();
					return {
						ok: false,
						failure: {
							kind: "stage_failed",
							status: staged.status,
							detail: staged.detail,
							...(staged.issues !== undefined
								? { issues: staged.issues }
								: {}),
							...(staged.current_hash !== undefined
								? { currentHash: staged.current_hash }
								: {}),
							...(staged.expected_hash !== undefined
								? { expectedHash: staged.expected_hash }
								: {}),
						},
					};
				}
				proposals.push({
					proposalId: staged.proposal.id,
					lint: staged.lint,
					requestAlias: entry.alias,
					docPath: normalizedTargetPath,
					baseHash: staged.proposal.baseHash,
					ops: [...staged.proposal.ops],
					changedBlockIds: [...staged.proposal.changedBlockIds],
					summary: staged.proposal.summary,
					createdAt: staged.proposal.createdAt,
				});
			}

			const superseded = stagedProposals.filter(
				(candidate) =>
					candidate.requestAlias === entry.alias &&
					candidate.docPath === normalizedTargetPath &&
					candidate.patchId === undefined &&
					!rejectedProposalIds.has(candidate.proposalId),
			);
			for (const previous of superseded) {
				try {
					await rejectBundleProposal(
						options.docsRoot,
						previous.docPath,
						previous.proposalId,
						{ sessionId: id },
					);
				} catch {
					// The replacement set is persisted, so rejection is best-effort.
				}
			}
			for (const previous of stagedProposals) {
				if (previous.requestAlias === entry.alias) {
					rejectedProposalIds.delete(previous.proposalId);
				}
			}
			stagedProposals = [
				...stagedProposals.filter(
					(candidate) => candidate.requestAlias !== entry.alias,
				),
				...proposals,
			];
			retained = true;
			const proposal = proposals.at(-1)!;
			const updated = replaceEntry(entry.alias, {
				status: "ready",
				waitingOnHuman: false,
				proposalId: proposal.proposalId,
			});
			for (const stagedProposal of proposals) {
				emit({ type: "proposal-staged", sessionId: id, proposal: stagedProposal });
			}
			emit({ type: "request-updated", sessionId: id, request: updated });
			refreshStatus();
			for (const stagedProposal of proposals) {
				await options.onProposalStaged?.(stagedProposal);
			}
			return { ok: true, proposal };
		} catch (error) {
			if (!retained) {
				for (const proposal of proposals) {
					try {
						await rejectBundleProposal(
							options.docsRoot,
							proposal.docPath,
							proposal.proposalId,
							{ sessionId: id },
						);
					} catch {
						// Rollback is best-effort; preserve the original exception.
					}
				}
				claimed.release();
			}
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

	function reviewedRequestStatus(
		alias: string,
	): "ready" | "applied" | "declined" | undefined {
		const proposals = stagedProposals.filter(
			(proposal) => proposal.requestAlias === alias,
		);
		if (
			proposals.some(
				(proposal) =>
					proposal.patchId === undefined &&
					!rejectedProposalIds.has(proposal.proposalId),
			)
		) {
			return "ready";
		}
		if (proposals.some((proposal) => proposal.patchId !== undefined)) {
			return "applied";
		}
		if (
			proposals.length > 0 &&
			proposals.every((proposal) =>
				rejectedProposalIds.has(proposal.proposalId)
			)
		) {
			return "declined";
		}
		return undefined;
	}

	function markApplied(
		aliasOrId: string,
		patchId: string,
		proposalId: string,
		hash = baseHash,
	): DocsEditRequestMutationResult {
		const entry = findEntry(aliasOrId);
		if (!entry) {
			return { ok: false, message: `No request "${aliasOrId.trim()}" in the queue.` };
		}
		const proposal = stagedProposals.find(
			(candidate) =>
				candidate.requestAlias === entry.alias &&
				candidate.proposalId === proposalId,
		);
		if (!proposal) {
			return {
				ok: false,
				message: `${entry.alias} has no proposal "${proposalId}".`,
			};
		}
		stagedProposals = stagedProposals.map((proposal) =>
			proposal.proposalId === proposalId
				? { ...proposal, patchId }
				: proposal,
		);
		rejectedProposalIds.delete(proposalId);
		const updated = updateRequest(entry, {
			status: reviewedRequestStatus(entry.alias) ?? "applied",
			waitingOnHuman: false,
		});
		emit({
			type: "proposal-applied",
			sessionId: id,
			alias: entry.alias,
			proposalId,
			patchId,
			hash,
		});
		return { ok: true, request: updated };
	}

	function markRejected(
		aliasOrId: string,
		proposalId: string,
		note?: string,
	): DocsEditRequestMutationResult {
		const entry = findEntry(aliasOrId);
		if (!entry) {
			return { ok: false, message: `No request "${aliasOrId.trim()}" in the queue.` };
		}
		const proposal = stagedProposals.find(
			(candidate) =>
				candidate.requestAlias === entry.alias &&
				candidate.proposalId === proposalId,
		);
		if (!proposal) {
			return {
				ok: false,
				message: `${entry.alias} has no proposal "${proposalId}".`,
			};
		}
		rejectedProposalIds.add(proposalId);
		const updated = updateRequest(entry, {
			status: reviewedRequestStatus(entry.alias) ?? "declined",
			waitingOnHuman: false,
			...(note?.trim() ? { note: note.trim() } : {}),
		});
		emit({
			type: "proposal-rejected",
			sessionId: id,
			alias: entry.alias,
			proposalId,
			...(note !== undefined ? { note } : {}),
		});
		return { ok: true, request: updated };
	}

	function markUndone(
		aliasOrId: string,
		proposalId: string,
		hash = baseHash,
	): DocsEditRequestMutationResult {
		const entry = findEntry(aliasOrId);
		if (!entry) {
			return { ok: false, message: `No request "${aliasOrId.trim()}" in the queue.` };
		}
		const proposal = stagedProposals.find(
			(candidate) =>
				candidate.requestAlias === entry.alias &&
				candidate.proposalId === proposalId,
		);
		if (!proposal?.patchId) {
			return { ok: false, message: `${entry.alias} has no applied patch to undo.` };
		}
		stagedProposals = stagedProposals.map((candidate) => {
			if (candidate.proposalId !== proposal.proposalId) return candidate;
			const { patchId: _patchId, ...withoutPatch } = candidate;
			return withoutPatch;
		});
		rejectedProposalIds.delete(proposal.proposalId);
		const updated = updateRequest(entry, {
			status: reviewedRequestStatus(entry.alias) ?? "ready",
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
		proposalId: string,
		proposal: DocsEditProposal,
	): DocsEditRequestMutationResult {
		const entry = findEntry(aliasOrId);
		if (!entry) {
			return { ok: false, message: `No request "${aliasOrId.trim()}" in the queue.` };
		}
		const oldProposal = stagedProposals.find(
			(candidate) =>
				candidate.requestAlias === entry.alias &&
				candidate.proposalId === proposalId,
		);
		if (!oldProposal) {
			return {
				ok: false,
				message: `${entry.alias} has no proposal "${proposalId}".`,
			};
		}
		const replacement: DocsEditProposal = {
			...proposal,
			requestAlias: entry.alias,
			supersededProposalIds: [
				...(oldProposal.supersededProposalIds ?? []),
				oldProposal.proposalId,
			],
		};
		stagedProposals = stagedProposals.map((candidate) =>
			candidate.proposalId === oldProposal.proposalId ? replacement : candidate,
		);
		rejectedProposalIds.delete(oldProposal.proposalId);
		rejectedProposalIds.delete(replacement.proposalId);
		const updated = updateRequest(entry, {
			status: "ready",
			waitingOnHuman: false,
			proposalId: entry.proposalId === proposalId
				? replacement.proposalId
				: entry.proposalId,
		});
		emit({ type: "proposal-staged", sessionId: id, proposal: replacement });
		return { ok: true, request: updated };
	}

	async function adoptChangeSet(
		aliasOrId: string,
		changeset: DocChangeSetView,
		proposals: readonly DocsEditProposal[],
	): Promise<DocsEditRequestMutationResult> {
		const entry = findEntry(aliasOrId);
		if (!entry) {
			return { ok: false, message: `No request "${aliasOrId.trim()}" in the queue.` };
		}
		if (isDocsEditRequestTerminal(entry.status)) {
			return { ok: false, message: `${entry.alias} is already ${entry.status}.` };
		}
		const adopted = proposals.map((proposal) => ({
			...proposal,
			requestAlias: entry.alias,
		}));
		for (const previous of stagedProposals) {
			if (previous.requestAlias === entry.alias) {
				rejectedProposalIds.delete(previous.proposalId);
			}
		}
		stagedProposals = [
			...stagedProposals.filter((proposal) => proposal.requestAlias !== entry.alias),
			...adopted,
		];
		const updated = replaceEntry(entry.alias, {
			status: "ready",
			waitingOnHuman: false,
			proposalId: adopted.at(-1)?.proposalId,
		});
		for (const proposal of adopted) {
			emit({ type: "proposal-staged", sessionId: id, proposal });
		}
		emit({ type: "request-updated", sessionId: id, request: updated });
		refreshStatus();
		await options.onChangeSetStaged?.(changeset);
		return { ok: true, request: updated };
	}

	async function supersedeProposals(
		aliasOrId: string,
	): Promise<DocsEditRequestMutationResult> {
		const entry = findEntry(aliasOrId);
		if (!entry) {
			return { ok: false, message: `No request "${aliasOrId.trim()}" in the queue.` };
		}
		if (isDocsEditRequestTerminal(entry.status)) {
			return { ok: false, message: `${entry.alias} is already ${entry.status}.` };
		}
		const superseded = stagedProposals.filter(
			(proposal) => proposal.requestAlias === entry.alias,
		);
		if (superseded.length === 0) return { ok: true, request: entry };

		for (const proposal of superseded) {
			const rejected = await rejectBundleProposal(
				options.docsRoot,
				proposal.docPath,
				proposal.proposalId,
				{ sessionId: id },
			);
			if (!rejected.ok && rejected.status !== 409) {
				return {
					ok: false,
					message: `Failed to supersede proposal ${proposal.proposalId}: ${rejected.detail}`,
				};
			}
		}

		stagedProposals = stagedProposals.filter(
			(proposal) => proposal.requestAlias !== entry.alias,
		);
		for (const proposal of superseded) {
			rejectedProposalIds.delete(proposal.proposalId);
		}
		const updated = replaceEntry(entry.alias, { proposalId: undefined });
		await options.onProposalsSuperseded?.(entry.alias, superseded);
		emit({ type: "request-updated", sessionId: id, request: updated });
		return { ok: true, request: updated };
	}

	return {
		id,
		corpus: options.corpus ?? "default",
		docsRoot: options.docsRoot,
		path,
		docId: document.id,
		baseHash,
		instruction: options.instruction,
		status: () => status,
		requests: () => entries,
		proposals: () => stagedProposals,
		document: () => document,
		renderedDocument: () =>
			`${renderDocsDocument(document)}\n\n${renderDocsBlockMap(document)}`,
		requestsBlock: () => formatDocsEditRequestsBlock(entries),
		claimPaths: (paths) => options.claimPaths?.(paths) ?? {
			ok: true,
			release: () => {},
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		propose,
		adoptChangeSet,
		supersedeProposals,
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
