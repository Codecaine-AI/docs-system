import type { RefObject } from "react";
import type { AnnotationsDocument } from "@codecaine-ai/docs-model/annotations-schema";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { DocChangeSetView, DocEditRequest, DocEditSession } from "@codecaine-ai/docs-viewer/lab";
import type { DocProposal } from "../../../data/api";
import type { DocsKernelSessionHandle, DocsKernelSessionSnapshot } from "./docs-kernel-session-source";
import type { useDocLabRemoteState } from "./useDocLabRemoteState";
import type { deriveStagedProposals } from "./doc-lab-projection";

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

export type UndoableAccept = { alias: string; patchId: string };

export type DocLabActionContext = ReturnType<typeof useDocLabRemoteState> & {
	options: UseDocLabSessionOptions;
	path: string;
	doc: DocDocument | null;
	requestsRef: RefObject<DocEditRequest[]>;
	stagedRef: RefObject<ReturnType<typeof deriveStagedProposals>>;
	clearAliasError: (alias: string) => void;
	setAliasError: (alias: string, message: string) => void;
};
