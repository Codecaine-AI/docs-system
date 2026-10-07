import type { DocsEditSessionStreamEvent, DocsKernelClient } from "./docs-kernel-client";
import type { CreateDocsKernelSessionSourceOptions, DocsKernelSessionActionResult, DocsKernelSessionSource } from "./docs-kernel-session-types";

export function createDocsKernelReviewActions(
	options: CreateDocsKernelSessionSourceOptions,
	review: (
		annotationId: string,
		proposalId: string | undefined,
		call: (sessionId: string, alias: string, proposalId?: string) => ReturnType<DocsKernelClient["acceptProposal"]>,
		toEvent: (result: Record<string, unknown>, sessionId: string, alias: string) => DocsEditSessionStreamEvent,
	) => Promise<DocsKernelSessionActionResult>,
): Pick<DocsKernelSessionSource, "accept" | "reject" | "undo"> {
	return {
		accept(annotationId, proposalId) {
			return review(
				annotationId,
				proposalId,
				(id, alias, targetProposalId) =>
					options.client.acceptProposal(id, alias, targetProposalId),
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

		reject(annotationId, note, proposalId) {
			return review(
				annotationId,
				proposalId,
				(id, alias, targetProposalId) =>
					options.client.rejectProposal(id, alias, note, targetProposalId),
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
				undefined,
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

	};
}
