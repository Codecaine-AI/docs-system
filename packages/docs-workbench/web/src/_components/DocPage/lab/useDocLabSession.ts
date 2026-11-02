import { useCallback, useMemo, useRef } from "react";
import type { DocChangeSetView, DocEditRequest, DocEditSession } from "@codecaine-ai/docs-viewer/lab";
import { acceptChangeset as acceptChangesetApi, rejectChangeset as rejectChangesetApi, undoChangeset as undoChangesetApi } from "../../../data/api";
import { deriveDocEditRequests, deriveStagedProposals, staleStagedProposals } from "./doc-lab-projection";
import { selectChangesetsForDoc } from "./doc-lab-changesets";
import { changesetFailureMessage, type ChangesetAction } from "./doc-lab-changeset-messages";
import type { DocLabSessionResult, UseDocLabSessionOptions } from "./types";
import { useDocLabRemoteState } from "./useDocLabRemoteState";
import { useDocLabProposalActions } from "./useDocLabProposalActions";
import { useDocLabReviewActions } from "./useDocLabReviewActions";
import { useDocLabRequestActions } from "./useDocLabRequestActions";

export type { DocLabSessionResult, UseDocLabSessionOptions, UndoableAccept } from "./types";

export function useDocLabSession(options: UseDocLabSessionOptions): DocLabSessionResult {
	const { path, doc, annotations } = options;
	const enabled = options.enabled ?? true;
	const remoteState = useDocLabRemoteState(options, enabled);
	const { refreshBundleRef, refetchProposals, refetchChangesets, refetchProposalsRef, refetchChangesetsRef, proposals, proposalsError, fetchedChangesets, changesetBusy, setChangesetBusy, changesetErrors, setChangesetErrors, requestErrors, setRequestErrors, undoable } = remoteState;

	const changesets = useMemo(
		() => selectChangesetsForDoc(fetchedChangesets, path),
		[fetchedChangesets, path],
	);
	const requests = useMemo(
		() => deriveDocEditRequests({ annotations, proposals, doc }),
		[annotations, proposals, doc],
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

	const actionContext = { ...remoteState, options, path, doc, requestsRef, stagedRef, clearAliasError, setAliasError };

	const { onAccept, onReject } = useDocLabProposalActions(actionContext);

	const { onRejectWithFeedback, onUndo } = useDocLabReviewActions(actionContext);

	const { onFileRequest, onReplyToRequest, onDismissRequest } = useDocLabRequestActions(actionContext);

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
		onRejectWithFeedback,
		onUndo,
		onReplyToRequest,
		// Accept-all and draft discard are not wired in wave 1.
		onAcceptAll: undefined,
		onDiscardDraft: undefined,
		onDismissRequest,
	}), [requests, staged, undoable, onFileRequest, onAccept, onReject, onRejectWithFeedback, onUndo, onReplyToRequest, onDismissRequest]);

	return {
		session,
		staleProposals: stale,
		requestErrors,
		proposalsError,
		changesets,
		changesetBusy,
		changesetErrors,
		refetchProposals,
		refetchChangesets,
		acceptChangeset,
		rejectChangeset,
		undoChangeset,
	};
}
