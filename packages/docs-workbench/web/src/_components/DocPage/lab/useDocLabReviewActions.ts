import { useCallback } from "react";
import { rejectProposal, addAnnotationReply, resolveAnnotation, undoPatch } from "../../../data/api";
import { errorMessage } from "./error-message";
import type { DocLabActionContext } from "./types";

export function useDocLabReviewActions(context: DocLabActionContext) {
	const { options, path, requestsRef, stagedRef, clearAliasError, setAliasError, proposalsRef, proposalsHashRef, annotationsHashRef, docHashRef, refreshBundleRef, refetchProposalsRef, proposals, setProposals, undoable, setUndoable } = context;
	const onRejectWithFeedback = useCallback(async (alias: string, note: string) => {
		const request = requestsRef.current.find((row) => row.alias === alias);
		if (!request?.annotationId) {
			setAliasError(alias, `Request ${alias} has no annotation.`);
			return;
		}
		const annotationId = request.annotationId;
		try {
			if (options.kernelSession?.live()) {
				const result = await options.kernelSession.reply(annotationId, note);
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
					(row) => row.annotationId === proposal.annotationId && row.alias === alias,
				);
			});
			const transactionId = stagedProposal?.transactionId ?? rawProposal?.id;
			if (!transactionId) return;
			const response = await rejectProposal(path, transactionId, { resolveAnnotation: false });
			await addAnnotationReply(path, annotationId, note, annotationsHashRef.current);
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

	return { onRejectWithFeedback, onUndo };
}
