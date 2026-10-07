import { useCallback, useEffect, useRef, useState } from "react";
import type { DocChangeSetView } from "@codecaine-ai/docs-viewer/lab";
import { listChangesets, listProposals, subscribeDocsEvents, type DocProposal } from "../../../data/api";
import type { UndoableAccept, UseDocLabSessionOptions } from "./types";
import { errorMessage } from "./error-message";

export function useDocLabRemoteState(options: UseDocLabSessionOptions, enabled: boolean) {
	const { path, docHash, annotationsHash } = options;
	const [proposals, setProposals] = useState<(DocProposal & { stale: boolean })[]>([]);
	const proposalsRef = useRef(proposals);
	proposalsRef.current = proposals;
	const proposalsHashRef = useRef<string | null>(null);
	const [proposalsError, setProposalsError] = useState<string | null>(null);
	const [fetchedChangesets, setFetchedChangesets] = useState<DocChangeSetView[]>([]);
	const [changesetBusy, setChangesetBusy] = useState<Record<string, "accepting" | "rejecting" | "undoing">>({});
	const [changesetErrors, setChangesetErrors] = useState<Record<string, string>>({});
	const [requestErrors, setRequestErrors] = useState<Record<string, string>>({});
	const [undoable, setUndoable] = useState<UndoableAccept | null>(null);
	const fetchSequenceRef = useRef(0);
	const changesetFetchSequenceRef = useRef(0);
	const pathRef = useRef(path);
	const annotationsHashRef = useRef(annotationsHash);
	const docHashRef = useRef(docHash);
	const refreshBundleRef = useRef(options.refreshBundle);
	const onDocAppliedRef = useRef(options.onDocApplied);
	const onApplyQueueRef = useRef(options.onApplyQueue);

	pathRef.current = path;
	annotationsHashRef.current = annotationsHash;
	docHashRef.current = docHash;
	refreshBundleRef.current = options.refreshBundle;
	onDocAppliedRef.current = options.onDocApplied;
	onApplyQueueRef.current = options.onApplyQueue;

	const refetchProposals = useCallback(async () => {
		if (!enabled) return;
		const requestedPath = path;
		const sequence = ++fetchSequenceRef.current;
		try {
			const response = await listProposals(requestedPath);
			if (sequence !== fetchSequenceRef.current || pathRef.current !== requestedPath) return;
			setProposals(response.proposals);
			proposalsHashRef.current = response.hash;
			setProposalsError(null);
		} catch (error) {
			if (sequence !== fetchSequenceRef.current || pathRef.current !== requestedPath) return;
			setProposalsError(errorMessage(error));
		}
	}, [enabled, path]);

	const refetchChangesets = useCallback(async () => {
		if (!enabled) return;
		const requestedPath = path;
		const sequence = ++changesetFetchSequenceRef.current;
		try {
			const next = await listChangesets();
			if (sequence !== changesetFetchSequenceRef.current || pathRef.current !== requestedPath) return;
			setFetchedChangesets(next);
		} catch (error) {
			if (sequence !== changesetFetchSequenceRef.current || pathRef.current !== requestedPath) return;
			setChangesetErrors((current) => ({ ...current, _list: errorMessage(error) }));
		}
	}, [enabled, path]);

	useEffect(() => {
		fetchSequenceRef.current += 1;
		changesetFetchSequenceRef.current += 1;
		setProposals([]);
		proposalsHashRef.current = null;
		setUndoable(null);
		setRequestErrors({});
		setProposalsError(null);
		setFetchedChangesets([]);
		setChangesetBusy({});
		setChangesetErrors({});
		if (enabled) {
			void refetchProposals();
			void refetchChangesets();
		}
	}, [enabled, path, refetchProposals, refetchChangesets]);

	const refetchProposalsRef = useRef(refetchProposals);
	refetchProposalsRef.current = refetchProposals;
	const refetchChangesetsRef = useRef(refetchChangesets);
	refetchChangesetsRef.current = refetchChangesets;
	useEffect(() => {
		if (!enabled) return;
		return subscribeDocsEvents((event) => {
			if (event.path === pathRef.current || event.path === "") {
				void refetchProposalsRef.current();
				void refetchChangesetsRef.current();
			}
		});
	}, [enabled]);

	return { proposalsRef, proposalsHashRef, fetchSequenceRef, changesetFetchSequenceRef, pathRef, annotationsHashRef, docHashRef, refreshBundleRef, onDocAppliedRef, onApplyQueueRef, refetchProposals, refetchChangesets, refetchProposalsRef, refetchChangesetsRef, proposals, setProposals, proposalsError, setProposalsError, fetchedChangesets, setFetchedChangesets, changesetBusy, setChangesetBusy, changesetErrors, setChangesetErrors, requestErrors, setRequestErrors, undoable, setUndoable };
}
