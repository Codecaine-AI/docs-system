import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnnotationsDocument, AnnotationTarget } from "@codecaine-ai/docs-model/annotations-schema";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type {
	DocChangeSetView,
	DocEditRequest,
	DocEditSession,
} from "@codecaine-ai/docs-viewer/lab";

import {
	ApiError,
	acceptChangeset as acceptChangesetApi,
	acceptProposal,
	addAnnotation,
	addAnnotationReply,
	listChangesets,
	listProposals,
	resolveAnnotation,
	rejectChangeset as rejectChangesetApi,
	rejectProposal,
	subscribeDocsEvents,
	undoPatch,
	undoChangeset as undoChangesetApi,
	type DocProposal,
} from "../data/api";
import {
	deriveDocEditRequests,
	deriveStagedProposals,
	staleStagedProposals,
} from "./doc-lab-projection";
import {
	docsKernelSessionApplying,
	type DocsKernelSessionHandle,
	type DocsKernelSessionSnapshot,
} from "./docs-kernel-session-source";
import { overlayChangesets, selectChangesetsForDoc } from "./doc-lab-changesets";
import { changesetFailureMessage, type ChangesetAction } from "./doc-lab-changeset-messages";

export interface UseDocLabSessionOptions {
	path: string;
	doc: DocDocument | null;
	docHash: string | null;
	annotations: AnnotationsDocument | null;
	annotationsHash: string | null;
	/** Refetch the bundle (doc + annotations + hashes) from the server. */
	refreshBundle: () => void | Promise<void>;
	/** Fired after a successful accept with the server's post-accept doc + hash. */
	onDocApplied?: (doc: DocDocument, hash: string) => void;
	/** SEAM — a kernel-session source supplies this later. When absent the queue's
	 * Apply affordance is disabled ("docs agent not connected"). */
	onApplyQueue?: (annotationIds: string[]) => void | Promise<void>;
	/** Optional live kernel session overlay and review router. */
	kernelSession?: DocsKernelSessionHandle;
	/** Reactive snapshot paired with kernelSession (including session creation). */
	kernelSnapshot?: DocsKernelSessionSnapshot;
	/** Serve-mode gate; static exports do not call proposal/write routes. */
	enabled?: boolean;
}

export interface DocLabSessionResult {
	session: DocEditSession;
	staleProposals: (DocProposal & { stale: boolean })[];
	requestErrors: Record<string, string>;
	proposalsError: string | null;
	changesets: DocChangeSetView[];
	changesetBusy: Record<string, "accepting" | "rejecting" | "undoing">;
	changesetErrors: Record<string, string>;
	agentConnected: boolean;
	applying: boolean;
	sessionError: string | null;
	agentStatus: "connected" | "offline" | "running";
	refetchProposals: () => Promise<void>;
	refetchChangesets: () => Promise<void>;
	acceptChangeset: (id: string) => Promise<void>;
	rejectChangeset: (id: string) => Promise<void>;
	undoChangeset: (id: string) => Promise<void>;
}

type UndoableAccept = { alias: string; patchId: string };

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Request failed.";
}

export function useDocLabSession(options: UseDocLabSessionOptions): DocLabSessionResult {
	const { path, doc, docHash, annotations, annotationsHash } = options;
	const enabled = options.enabled ?? true;
	const [proposals, setProposals] = useState<(DocProposal & { stale: boolean })[]>([]);
	const proposalsRef = useRef(proposals);
	proposalsRef.current = proposals;
	const proposalsHashRef = useRef<string | null>(null);
	const [proposalsError, setProposalsError] = useState<string | null>(null);
	const [fetchedChangesets, setFetchedChangesets] = useState<DocChangeSetView[]>([]);
	const [changesetBusy, setChangesetBusy] = useState<Record<string, "accepting" | "rejecting" | "undoing">>({});
	const [changesetErrors, setChangesetErrors] = useState<Record<string, string>>({});
	const [requestErrors, setRequestErrors] = useState<Record<string, string>>({});
	const [undoable, setUndoable] = useState<UndoableAccept | null>(null);
	const fetchSequenceRef = useRef(0);
	const changesetFetchSequenceRef = useRef(0);
	const pathRef = useRef(path);
	const annotationsHashRef = useRef(annotationsHash);
	const docHashRef = useRef(docHash);
	const refreshBundleRef = useRef(options.refreshBundle);
	const onDocAppliedRef = useRef(options.onDocApplied);
	const onApplyQueueRef = useRef(options.onApplyQueue);

	pathRef.current = path;
	annotationsHashRef.current = annotationsHash;
	docHashRef.current = docHash;
	refreshBundleRef.current = options.refreshBundle;
	onDocAppliedRef.current = options.onDocApplied;
	onApplyQueueRef.current = options.onApplyQueue;

	const refetchProposals = useCallback(async () => {
		if (!enabled) return;
		const requestedPath = path;
		const sequence = ++fetchSequenceRef.current;
		try {
			const response = await listProposals(requestedPath);
			if (sequence !== fetchSequenceRef.current || pathRef.current !== requestedPath) return;
			setProposals(response.proposals);
			proposalsHashRef.current = response.hash;
			setProposalsError(null);
		} catch (error) {
			if (sequence !== fetchSequenceRef.current || pathRef.current !== requestedPath) return;
			setProposalsError(errorMessage(error));
		}
	}, [enabled, path]);

	const refetchChangesets = useCallback(async () => {
		if (!enabled) return;
		const requestedPath = path;
		const sequence = ++changesetFetchSequenceRef.current;
		try {
			const next = await listChangesets();
			if (sequence !== changesetFetchSequenceRef.current || pathRef.current !== requestedPath) return;
			setFetchedChangesets(next);
		} catch (error) {
			if (sequence !== changesetFetchSequenceRef.current || pathRef.current !== requestedPath) return;
			setChangesetErrors((current) => ({ ...current, _list: errorMessage(error) }));
		}
	}, [enabled, path]);

	useEffect(() => {
		fetchSequenceRef.current += 1;
		changesetFetchSequenceRef.current += 1;
		setProposals([]);
		proposalsHashRef.current = null;
		setUndoable(null);
		setRequestErrors({});
		setProposalsError(null);
		setFetchedChangesets([]);
		setChangesetBusy({});
		setChangesetErrors({});
		if (enabled) {
			void refetchProposals();
			void refetchChangesets();
		}
	}, [enabled, path, refetchProposals, refetchChangesets]);

	const refetchProposalsRef = useRef(refetchProposals);
	refetchProposalsRef.current = refetchProposals;
	const refetchChangesetsRef = useRef(refetchChangesets);
	refetchChangesetsRef.current = refetchChangesets;
	useEffect(() => {
		if (!enabled) return;
		return subscribeDocsEvents((event) => {
			if (event.path === pathRef.current || event.path === "") {
				void refetchProposalsRef.current();
				void refetchChangesetsRef.current();
			}
		});
	}, [enabled]);

	const kernelLive = options.kernelSession?.live() ?? false;
	const kernelStatusOverlay = options.kernelSession?.statusOverlay();
	const kernelStarting = options.kernelSnapshot?.starting ?? false;
	const kernelChangesets = options.kernelSession?.changesets?.() ?? new Map<string, DocChangeSetView>();
	const changesets = useMemo(
		() => selectChangesetsForDoc(
			overlayChangesets(fetchedChangesets, kernelChangesets.values()),
			path,
			options.kernelSession?.sessionId?.(),
		),
		[fetchedChangesets, kernelChangesets, path, options.kernelSession],
	);
	const requests = useMemo(() => {
		const projected = deriveDocEditRequests({ annotations, proposals, doc });
		if ((!kernelLive && !kernelStarting) || !kernelStatusOverlay) return projected;
		return projected.map((request) => {
			const status = request.annotationId
				? kernelStatusOverlay.get(request.annotationId)
				: undefined;
			return status === undefined ? request : { ...request, status };
		});
	},
		[annotations, proposals, doc, kernelLive, kernelStarting, kernelStatusOverlay],
	);
	const staged = useMemo(
		() => deriveStagedProposals({ proposals, requests }),
		[proposals, requests],
	);
	const stale = useMemo(() => staleStagedProposals({ proposals }), [proposals]);
	const requestsRef = useRef<DocEditRequest[]>(requests);
	const stagedRef = useRef(staged);
	requestsRef.current = requests;
	stagedRef.current = staged;

	const clearAliasError = useCallback((alias: string) => {
		setRequestErrors((current) => {
			if (!(alias in current)) return current;
			const next = { ...current };
			delete next[alias];
			return next;
		});
	}, []);
	const setAliasError = useCallback((alias: string, message: string) => {
		setRequestErrors((current) => ({ ...current, [alias]: message }));
	}, []);

	const onAccept = useCallback(async (alias: string) => {
		const request = requestsRef.current.find((row) => row.alias === alias);
		if (options.kernelSession?.live() && request?.annotationId) {
			const result = await options.kernelSession.accept(request.annotationId);
			if (result.ok) {
				clearAliasError(alias);
				await refreshBundleRef.current();
				await refetchProposalsRef.current();
				return;
			}
			if (!result.miss) {
				setAliasError(alias, result.message);
				return;
			}
		}
		const stagedProposal = stagedRef.current.find((proposal) => proposal.alias === alias);
		if (!stagedProposal) return;
		try {
			const response = await acceptProposal(
				path,
				stagedProposal.transactionId,
				proposalsHashRef.current ?? undefined,
			);
			proposalsHashRef.current = response.hash;
			setProposals(response.proposals.map((proposal) => ({
				...proposal,
				stale: proposal.status === "staged" && proposal.baseHash !== response.doc_hash,
			})));
			setUndoable({ alias, patchId: response.patch_id });
			clearAliasError(alias);
			onDocAppliedRef.current?.(response.doc, response.doc_hash);
			await refreshBundleRef.current();
			await refetchProposalsRef.current();
		} catch (error) {
			if (error instanceof ApiError && error.status === 409 && error.message === "stale-proposal") {
				setAliasError(alias, "Proposal is stale — the document changed underneath it.");
				await refetchProposalsRef.current();
				return;
			}
			setAliasError(alias, errorMessage(error));
		}
	}, [path, options.kernelSession, clearAliasError, setAliasError]);

	const onReject = useCallback(async (alias: string) => {
		const request = requestsRef.current.find((row) => row.alias === alias);
		if (options.kernelSession?.live() && request?.annotationId) {
			const result = await options.kernelSession.reject(request.annotationId);
			if (result.ok) {
				clearAliasError(alias);
				await refreshBundleRef.current();
				await refetchProposalsRef.current();
				return;
			}
			if (!result.miss) {
				setAliasError(alias, result.message);
				return;
			}
		}
		const stagedProposal = stagedRef.current.find((proposal) => proposal.alias === alias);
		const rawProposal = proposalsRef.current.find((proposal) => {
			if (proposal.id === stagedProposal?.transactionId || proposal.alias === alias) {
				return true;
			}
			if (!proposal.annotationId) return false;
			return requestsRef.current.some(
				(request) =>
					request.annotationId === proposal.annotationId && request.alias === alias,
			);
		});
		const transactionId = stagedProposal?.transactionId ?? rawProposal?.id;
		if (!transactionId) return;
		try {
			const response = await rejectProposal(path, transactionId);
			proposalsHashRef.current = response.hash;
			setProposals(response.proposals.map((proposal) => ({
				...proposal,
				stale: proposal.status === "staged" && proposal.baseHash !== docHashRef.current,
			})));
			clearAliasError(alias);
			await refreshBundleRef.current();
			await refetchProposalsRef.current();
		} catch (error) {
			setAliasError(alias, errorMessage(error));
		}
	}, [path, options.kernelSession, clearAliasError, setAliasError]);

	const onUndo = useCallback(async (alias: string) => {
		const request = requestsRef.current.find((row) => row.alias === alias);
		if (options.kernelSession?.live() && request?.annotationId) {
			const result = await options.kernelSession.undo(request.annotationId);
			if (result.ok) {
				clearAliasError(alias);
				await refreshBundleRef.current();
				await refetchProposalsRef.current();
				return;
			}
			if (!result.miss) {
				setAliasError(alias, result.message);
				return;
			}
		}
		if (!undoable || undoable.alias !== alias) return;
		try {
			const result = await undoPatch(undoable.patchId);
			if (!result.ok) {
				if (result.alreadyUndone) setUndoable(null);
				setAliasError(alias, result.detail);
				await refreshBundleRef.current();
				await refetchProposalsRef.current();
				return;
			}
			setUndoable(null);
			clearAliasError(alias);
			await refreshBundleRef.current();
			await refetchProposalsRef.current();
		} catch (error) {
			setAliasError(alias, errorMessage(error));
		}
	}, [undoable, options.kernelSession, clearAliasError, setAliasError]);

	const onFileRequest = useCallback(async (filing: Parameters<NonNullable<DocEditSession["onFileRequest"]>>[0]) => {
		const target: AnnotationTarget = filing.target.kind === "doc"
			? (() => {
				if (!doc?.root) {
					throw new Error("Cannot file a document-level request without a loaded document.");
				}
				return { kind: "block", blockId: doc.root } as const;
			})()
			: filing.target.kind === "block"
				? { kind: "block", blockId: filing.target.blockId }
				: { ...filing.target };
		try {
			await addAnnotation(path, {
				target,
				body: filing.body,
				intent: "agent-request",
				author: "you",
				expectedHash: annotationsHashRef.current,
			});
			await refreshBundleRef.current();
			await refetchProposalsRef.current();
		} catch (error) {
			await refreshBundleRef.current();
			void refetchProposalsRef.current();
			throw error;
		}
	}, [path, doc?.root]);

	const onReplyToRequest = useCallback(async (alias: string, body: string) => {
		const request = requestsRef.current.find((row) => row.alias === alias);
		if (!request?.annotationId) throw new Error(`Request ${alias} has no annotation.`);
		if (options.kernelSession?.live()) {
			const result = await options.kernelSession.reply(request.annotationId, body);
			if (result.ok) {
				clearAliasError(alias);
				await refreshBundleRef.current();
				await refetchProposalsRef.current();
				return;
			}
			if (!result.miss) {
				setAliasError(alias, result.message);
				return;
			}
		}
		try {
			await addAnnotationReply(path, request.annotationId, body, annotationsHashRef.current);
			await refreshBundleRef.current();
			await refetchProposalsRef.current();
		} catch (error) {
			await refreshBundleRef.current();
			void refetchProposalsRef.current();
			throw error;
		}
	}, [path, options.kernelSession, clearAliasError, setAliasError]);

	const onDismissRequest = useCallback(async (requestId: string) => {
		const request = requestsRef.current.find((row) => row.id === requestId);
		if (!request?.annotationId) return;
		const { alias, annotationId } = request;
		if (options.kernelSession?.live()) {
			const status = options.kernelSession.statusOverlay().get(annotationId);
			if (
				status !== undefined &&
				status !== "applied" &&
				status !== "declined" &&
				status !== "resolved" &&
				status !== "failed"
			) {
				setAliasError(alias, "This note is part of the running session — it can't be removed right now.");
				return;
			}
		}
		try {
			await resolveAnnotation(path, annotationId, undefined, "Dismissed from the queue.");
			clearAliasError(alias);
			await refreshBundleRef.current();
			await refetchProposalsRef.current();
		} catch (error) {
			setAliasError(alias, errorMessage(error));
		}
	}, [path, options.kernelSession, clearAliasError, setAliasError]);

	const onApplyQueue = useMemo(() => options.onApplyQueue
		? (annotationIds: string[]) => onApplyQueueRef.current?.(annotationIds)
		: undefined, [options.onApplyQueue]);

	const runChangesetAction = useCallback(async (
		id: string,
		busy: "accepting" | "rejecting" | "undoing",
		actionName: ChangesetAction,
		action: (id: string) => Promise<DocChangeSetView>,
	) => {
		setChangesetBusy((current) => ({ ...current, [id]: busy }));
		setChangesetErrors((current) => {
			const next = { ...current };
			delete next[id];
			return next;
		});
		try {
			await action(id);
			await Promise.all([
				refetchProposalsRef.current(),
				refetchChangesetsRef.current(),
				refreshBundleRef.current(),
			]);
		} catch (error) {
			setChangesetErrors((current) => ({
				...current,
				[id]: changesetFailureMessage(error, actionName),
			}));
		} finally {
			setChangesetBusy((current) => {
				const next = { ...current };
				delete next[id];
				return next;
			});
		}
	}, []);
	const acceptChangeset = useCallback(
		(id: string) => runChangesetAction(id, "accepting", "accept", acceptChangesetApi),
		[runChangesetAction],
	);
	const rejectChangeset = useCallback(
		(id: string) => runChangesetAction(id, "rejecting", "reject", rejectChangesetApi),
		[runChangesetAction],
	);
	const undoChangeset = useCallback(
		(id: string) => runChangesetAction(id, "undoing", "undo", undoChangesetApi),
		[runChangesetAction],
	);

	const session = useMemo<DocEditSession>(() => ({
		requests,
		proposals: staged,
		undoableAlias: undoable?.alias,
		onFileRequest,
		onAccept,
		onReject,
		onUndo,
		onReplyToRequest,
		onApplyQueue,
		// Accept-all and draft discard are not wired in wave 1.
		onAcceptAll: undefined,
		onDiscardDraft: undefined,
		onDismissRequest,
	}), [requests, staged, undoable, onFileRequest, onAccept, onReject, onUndo, onReplyToRequest, onApplyQueue, onDismissRequest]);

	const agentConnected = Boolean(options.onApplyQueue);
	const applying = options.kernelSnapshot
		? docsKernelSessionApplying(options.kernelSnapshot)
		: false;

	return {
		session,
		staleProposals: stale,
		requestErrors,
		proposalsError,
		changesets,
		changesetBusy,
		changesetErrors,
		agentConnected,
		applying,
		sessionError:
			options.kernelSnapshot?.sessionError ??
			options.kernelSnapshot?.streamError ??
			null,
		agentStatus: applying
			? "running"
			: agentConnected
				? "connected"
				: "offline",
		refetchProposals,
		refetchChangesets,
		acceptChangeset,
		rejectChangeset,
		undoChangeset,
	};
}
