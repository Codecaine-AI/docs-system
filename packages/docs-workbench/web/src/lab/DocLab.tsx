"use client";

import { useCallback, useMemo } from "react";
import { Sparkles } from "lucide-react";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import {
	GlassPanel,
	ChangeSetCard,
	PanelQueue,
	buildRequestQueue,
	requestRunId,
	type DocEditTarget,
} from "@codecaine-ai/docs-viewer/lab";

import type { DocLabSessionResult } from "./doc-lab-controller";
import { navigateToDoc } from "./doc-lab-changesets";
import { labelForTarget } from "./target-label";

export interface DocLabProps {
	hidden?: boolean;
	doc: DocDocument;
	/** Normalized bundle path for the document currently open in the workbench. */
	openDocPath?: string;
	lab: DocLabSessionResult;
	annotationsError?: string | null;
	/** Focuses a queue target in the document surface. */
	onFocusTarget: (target: DocEditTarget) => void;
	/** Reports the panel's rendered width so the host rail can reserve it. */
	onPanelWidthChange?: (width: number) => void;
}

/**
 * Dumb workbench composition for the floating docs lab. All persistence and
 * refresh behavior remains owned by DocPage/useDocLabSession.
 */
export function DocLab({
	hidden = false,
	doc,
	openDocPath,
	lab,
	annotationsError,
	onFocusTarget,
	onPanelWidthChange,
}: DocLabProps) {
	const conflictedAliases = useMemo(
		() =>
			new Set(
				lab.session.requests
					.filter((request) => request.targetChanged)
					.map((request) => request.alias),
			),
		[lab.session.requests],
	);
	const queue = useMemo(
		() =>
			buildRequestQueue({
				requests: lab.session.requests,
				proposals: lab.session.proposals,
				applying: lab.applying,
				conflictedAliases,
			}),
		[conflictedAliases, lab.applying, lab.session.proposals, lab.session.requests],
	);
	const targetLabel = useCallback(
		(target: DocEditTarget) => labelForTarget(doc, target, openDocPath),
		[doc, openDocPath],
	);
	const applyQueue = useCallback(() => {
		const annotationIds = queue.queue
			.filter((entry) => !entry.staged)
			.map((entry) => requestRunId(entry.request));
		if (annotationIds.length === 0) return;
		void lab.session.onApplyQueue?.(annotationIds);
	}, [lab.session, queue.queue]);
	const requestErrors = Object.entries(lab.requestErrors);

	return (
		<GlassPanel hidden={hidden} tab="ai" onTabSelect={() => {}} onWidthChange={onPanelWidthChange}
			header={<div className="flex items-center gap-2 px-3 py-2 text-xs font-medium"><Sparkles size={14} aria-hidden />AI</div>}
		>
			<div className="flex h-full min-h-0 flex-col">
				{/* Chat shape (mirrors prompt-kit's AI tab): PanelQueue owns the
				    whole tab — threads and errors ride INSIDE its scrolling
				    transcript so the composer dock stays bottommost. */}
				<PanelQueue
					session={lab.session}
					queue={queue}
					applying={lab.applying}
					sessionError={lab.sessionError}
					agentStatus={lab.agentStatus}
					onApply={applyQueue}
					applyDisabledReason={
						lab.agentConnected ? null : "docs agent not connected"
					}
					onFocusTarget={onFocusTarget}
					labelForTarget={targetLabel}
				>
					{lab.changesets.map((changeset) => (
						<ChangeSetCard
							key={changeset.id}
							changeset={changeset}
							openDocPath={openDocPath}
							busy={lab.changesetBusy[changeset.id] ?? null}
							error={lab.changesetErrors[changeset.id] ?? null}
							onAccept={() => lab.acceptChangeset(changeset.id)}
							onReject={() => lab.rejectChangeset(changeset.id)}
							onUndo={() => lab.undoChangeset(changeset.id)}
							onOpenDoc={navigateToDoc}
						/>
					))}
					{lab.proposalsError ? (
						<p
							data-docs-lab-proposals-error=""
							className="px-1.5 py-1 text-xs text-destructive"
						>
							{lab.proposalsError}
						</p>
					) : null}
					{annotationsError ? (
						<p
							data-docs-lab-annotations-error=""
							className="px-1.5 py-1 text-xs text-destructive"
						>
							{annotationsError}
						</p>
					) : null}
					{requestErrors.map(([alias, message]) => (
						<p
							key={alias}
							data-docs-lab-request-error={alias}
							className="px-1.5 py-1 text-xs text-destructive"
						>
							{alias}: {message}
						</p>
					))}
				</PanelQueue>
			</div>
		</GlassPanel>
	);
}

export { labelForTarget } from "./target-label";
