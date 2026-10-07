import { useCallback } from "react";
import { ApiError, acceptProposal, rejectProposal } from "../../../data/api";
import { errorMessage } from "./error-message";
import type { DocLabActionContext } from "./types";

export function useDocLabProposalActions(context: DocLabActionContext) {
	const { options, path, doc, requestsRef, stagedRef, clearAliasError, setAliasError, proposalsRef, proposalsHashRef, docHashRef, refreshBundleRef, onDocAppliedRef, refetchProposalsRef, proposals, setProposals, setUndoable } = context;
	const onAccept = useCallback(async (alias: string, transactionId?: string) => {
		const request = requestsRef.current.find((row) => row.alias === alias);
		if (options.kernelSession?.live() && request?.annotationId) {
			const result = await options.kernelSession.accept(request.annotationId, transactionId);
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
		const stagedProposal = transactionId
			? stagedRef.current.find((proposal) => proposal.transactionId === transactionId)
			: stagedRef.current.find((proposal) => proposal.alias === alias);
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

	const onReject = useCallback(async (alias: string, note?: string, transactionId?: string) => {
		const request = requestsRef.current.find((row) => row.alias === alias);
		if (options.kernelSession?.live() && request?.annotationId) {
			const result = await options.kernelSession.reject(request.annotationId, note, transactionId);
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
		const stagedProposal = transactionId
			? stagedRef.current.find((proposal) => proposal.transactionId === transactionId)
			: stagedRef.current.find((proposal) => proposal.alias === alias);
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
		const proposalId = transactionId ?? stagedProposal?.transactionId ?? rawProposal?.id;
		if (!proposalId) return;
		try {
			const response = await rejectProposal(path, proposalId);
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

	return { onAccept, onReject };
}
