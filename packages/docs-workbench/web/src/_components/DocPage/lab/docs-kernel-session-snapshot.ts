import type { DocChangeSetView, DocEditRequestStatus } from "@codecaine-ai/docs-viewer/lab";
import type { DocsEditSessionState } from "./docs-kernel-client";
import type { DocsKernelSessionSnapshot } from "./docs-kernel-session-types";

export function createDocsKernelSessionSnapshot(
	state: DocsEditSessionState | null,
	starting: boolean,
	startingAnnotationIds: ReadonlySet<string>,
	changesets: ReadonlyMap<string, DocChangeSetView>,
	sessionError: string | undefined,
	streamError: string | undefined,
): DocsKernelSessionSnapshot {
	const overlay = new Map<string, DocEditRequestStatus>();
	for (const annotationId of startingAnnotationIds) {
		overlay.set(annotationId, "working");
	}
	if (state) {
		for (const request of state.requests) {
			overlay.set(request.annotationId, request.status);
		}
	}
	return {
		live: state !== null,
		starting,
		state,
		statusOverlay: overlay,
		changesets: new Map(changesets),
		...(sessionError !== undefined ? { sessionError } : {}),
		...(streamError !== undefined ? { streamError } : {}),
	};
}
