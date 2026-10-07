import type { DocChangeSetView, DocEditRequestStatus } from "@codecaine-ai/docs-viewer/lab";
import type { DocsEditSessionState, DocsKernelClient } from "./docs-kernel-client";

export interface DocsKernelSessionSnapshot {
	live: boolean;
	starting: boolean;
	state: DocsEditSessionState | null;
	statusOverlay: ReadonlyMap<string, DocEditRequestStatus>;
	changesets: ReadonlyMap<string, DocChangeSetView>;
	sessionError?: string;
	streamError?: string;
}

export type DocsKernelSessionActionResult =
	| { ok: true }
	| { ok: false; miss: true; message: string }
	| { ok: false; miss?: false; message: string };

export interface DocsKernelSessionHandle {
	live(): boolean;
	sessionId(): string | undefined;
	statusOverlay(): ReadonlyMap<string, DocEditRequestStatus>;
	changesets(): ReadonlyMap<string, DocChangeSetView>;
	accept(annotationId: string, proposalId?: string): Promise<DocsKernelSessionActionResult>;
	reject(annotationId: string, note?: string, proposalId?: string): Promise<DocsKernelSessionActionResult>;
	undo(annotationId: string): Promise<DocsKernelSessionActionResult>;
	reply(annotationId: string, body: string): Promise<DocsKernelSessionActionResult>;
	subscribe(listener: () => void): () => void;
}

export interface DocsKernelSessionSource extends DocsKernelSessionHandle {
	applyQueue(annotationIds: readonly string[]): Promise<void>;
	endSession(): Promise<void>;
	getSnapshot(): DocsKernelSessionSnapshot;
	dispose(): void;
}

export interface CreateDocsKernelSessionSourceOptions {
	client: DocsKernelClient;
	path: string;
	corpus?: string;
	onSessionEnd: () => void | Promise<void>;
	onDocChanged?: (hash: string) => void | Promise<void>;
	onProposalStaged?: () => void | Promise<void>;
}

