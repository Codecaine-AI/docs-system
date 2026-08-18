import type {
	AnnotationTarget,
	AnnotationsDocument,
	DocAnnotation,
} from "@codecaine-ai/docs-model/annotations-schema";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type {
	DocEditProposal,
	DocEditRequest,
	DocEditRequestStatus,
	DocEditTarget,
} from "@codecaine-ai/docs-viewer/lab";

import type { DocProposal } from "../data/api";
import { docAnnotationTargetFingerprintChanges } from "../lib/annotation-fingerprints";

export type ProposalRow = DocProposal & { stale: boolean };

export function mapAnnotationTargetToDocEditTarget(
	target: AnnotationTarget,
	docRoot: string | Pick<DocDocument, "root"> | null | undefined,
): DocEditTarget | null {
	const rootId = typeof docRoot === "string" ? docRoot : docRoot?.root;
	switch (target.kind) {
		case "block":
			return target.blockId === rootId
				? { kind: "doc" }
				: { kind: "block", blockId: target.blockId };
		case "text-range":
			return {
				kind: "text-range",
				blockId: target.blockId,
				start: target.start,
				end: target.end,
				quote: target.quote,
			};
		case "canvas-object":
			return null;
	}
}

function requestStatus(
	annotation: DocAnnotation,
	proposals: readonly ProposalRow[],
): DocEditRequestStatus {
	const linked = proposals.filter(
		(proposal) => proposal.annotationId === annotation.id,
	);

	if (annotation.status === "resolved") {
		if (linked.some((proposal) => proposal.status === "accepted")) {
			return "applied";
		}
		if (linked.some((proposal) => proposal.status === "rejected")) {
			return "declined";
		}
		return "resolved";
	}

	if (
		linked.some(
			(proposal) => proposal.status === "staged" && !proposal.stale,
		)
	) {
		return "ready";
	}

	const latestReply = annotation.replies?.[annotation.replies.length - 1];
	if (latestReply && latestReply.author !== annotation.author) {
		return "waiting";
	}
	return "open";
}

export function deriveDocEditRequests({
	annotations,
	proposals,
	doc,
}: {
	annotations: readonly DocAnnotation[] | AnnotationsDocument | null;
	proposals: readonly ProposalRow[];
	doc: DocDocument | null;
}): DocEditRequest[] {
	const annotationRows: readonly DocAnnotation[] = annotations === null
		? []
		: "annotations" in annotations
			? annotations.annotations
			: annotations;
	const requestAnnotations = annotationRows.filter(
		(annotation) =>
			annotation.intent === "agent-request" &&
			annotation.target.kind !== "canvas-object",
	);
	const targetChanges = docAnnotationTargetFingerprintChanges(
		doc,
		requestAnnotations,
	);

	return requestAnnotations.flatMap((annotation, index) => {
		const target = mapAnnotationTargetToDocEditTarget(
			annotation.target,
			doc?.root,
		);
		if (!target) return [];
		const status = requestStatus(annotation, proposals);
		return [{
			id: annotation.id,
			alias: `R${index + 1}`,
			annotationId: annotation.id,
			target,
			body: annotation.body,
			status,
			note:
				status === "declined" && typeof annotation.resolution === "string"
					? annotation.resolution
					: undefined,
			disposition: target.kind === "doc" ? "global" : "batch",
			thread: (annotation.replies ?? []).map((reply) => ({
				id: reply.id,
				author: reply.author === "agent" || reply.author === "system" ? "agent" : "user",
				body: reply.body,
				at: reply.createdAt,
			})),
			targetChanged:
				target.kind === "doc"
					? false
					: (targetChanges.get(annotation.id) ?? false),
		}];
	});
}

export function deriveStagedProposals({
	proposals,
	requests,
}: {
	proposals: readonly ProposalRow[];
	requests: readonly DocEditRequest[];
}): DocEditProposal[] {
	const staged = proposals.filter(
		(proposal) => proposal.status === "staged" && !proposal.stale,
	);
	const requestByAnnotationId = new Map(
		requests
			.filter((request) => request.annotationId !== undefined)
			.map((request) => [request.annotationId!, request]),
	);
	const usedAliases = new Set(requests.map((request) => request.alias));
	let fallbackNumber = 1;

	return staged.map((proposal) => {
		const requestAlias = proposal.annotationId
			? requestByAnnotationId.get(proposal.annotationId)?.alias
			: undefined;
		let alias = requestAlias ?? proposal.alias;
		if (!alias) {
			do {
				alias = `A${fallbackNumber++}`;
			} while (usedAliases.has(alias));
		}
		usedAliases.add(alias);

		return {
			transactionId: proposal.id,
			alias,
			summary: proposal.summary,
			ops: proposal.ops,
			changedBlockIds: proposal.changedBlockIds,
			baseHash: proposal.baseHash,
		};
	});
}

export function staleStagedProposals({
	proposals,
}: {
	proposals: readonly ProposalRow[];
}): ProposalRow[] {
	return proposals.filter(
		(proposal) => proposal.status === "staged" && proposal.stale,
	);
}
