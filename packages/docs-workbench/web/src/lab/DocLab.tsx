"use client";

import { useCallback, useMemo, type ComponentProps } from "react";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import {
	GlassPanel,
	OutlineList,
	PanelQueue,
	PanelZone,
	buildRequestQueue,
	deriveDocOutline,
	requestRunId,
	useOutlineSpy,
	type DocEditTarget,
	type LabPanelTab,
} from "@codecaine-ai/docs-viewer/lab";

import { ActionPane } from "../pages/ActionPane";
import type { DocLabSessionResult } from "./doc-lab-controller";
import { labelForTarget } from "./target-label";

export interface DocLabProps {
	tab: LabPanelTab;
	onTabSelect: (tab: LabPanelTab) => void;
	doc: DocDocument;
	outlineScrollerSelector: string;
	lab: DocLabSessionResult;
	threads: ComponentProps<typeof ActionPane>;
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
	tab,
	onTabSelect,
	doc,
	outlineScrollerSelector,
	lab,
	threads,
	onFocusTarget,
	onPanelWidthChange,
}: DocLabProps) {
	const sections = useMemo(() => deriveDocOutline(doc), [doc]);
	const outline = useOutlineSpy({
		sections,
		scrollerSelector: outlineScrollerSelector,
	});
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
				applying: false,
				conflictedAliases,
			}),
		[conflictedAliases, lab.session.proposals, lab.session.requests],
	);
	const targetLabel = useCallback(
		(target: DocEditTarget) => labelForTarget(doc, target),
		[doc],
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
		<GlassPanel tab={tab} onTabSelect={onTabSelect} onWidthChange={onPanelWidthChange}>
			{tab === "edit" ? (
				<PanelZone id="outline" label="Outline">
					<OutlineList
						sections={sections}
						activeBlockId={outline.activeBlockId}
						scrollToSection={outline.scrollToSection}
					/>
				</PanelZone>
			) : (
				<div className="flex h-full min-h-0 flex-col">
					{/* Chat shape (mirrors prompt-kit's AI tab): PanelQueue owns the
					    whole tab — threads and errors ride INSIDE its scrolling
					    transcript so the composer dock stays bottommost. */}
					<PanelQueue
						session={lab.session}
						queue={queue}
						applying={false}
						onApply={applyQueue}
						applyDisabledReason={
							lab.agentConnected ? null : "docs agent not connected"
						}
						onFocusTarget={onFocusTarget}
						labelForTarget={targetLabel}
					>
						{lab.proposalsError ? (
							<p
								data-docs-lab-proposals-error=""
								className="px-1.5 py-1 text-xs text-destructive"
							>
								{lab.proposalsError}
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
						<PanelZone id="threads" label="Threads">
							<ActionPane {...threads} />
						</PanelZone>
					</PanelQueue>
				</div>
			)}
		</GlassPanel>
	);
}

export { labelForTarget } from "./target-label";
