// Slice: pure change-set view derivations for the lab PR-card UI.

export type DocChangeSetStatus = "open" | "applied" | "declined";

export type DocChangeSetTreeOp =
	| { kind: "create-doc"; docPath: string; title: string }
	| { kind: "delete-doc"; docPath: string }
	| { kind: "move-doc"; from: string; to: string };

export type DocChangeSetEntryView = {
	docPath: string;
	proposalId: string;
	status: "staged" | "accepted" | "rejected" | "missing";
	stale: boolean;
	summary: string;
	addCount: number;
	delCount: number;
};

export type DocChangeSetView = {
	id: string;
	summary: string;
	status: DocChangeSetStatus;
	sessionId?: string;
	annotationId?: string;
	annotationDocPath?: string;
	alias?: string;
	entries: DocChangeSetEntryView[];
	treeOps: Array<DocChangeSetTreeOp & { position: number }>;
	createdAt: string;
	resolvedAt?: string;
	compoundPatchId?: string;
	progress: { accepted: number; total: number };
};

export type ChangeSetDocRow = Pick<
	DocChangeSetEntryView,
	"docPath" | "addCount" | "delCount" | "stale" | "status" | "proposalId"
> & {
	displayName: string;
};

export type ChangeSetTreeOpRow = { key: string; label: string };

export type ChangeSetEntryChip = {
	state: "stale" | "missing" | "rejected" | "accepted";
	label: string;
	title: string;
};

/** The compact document naming rule shared by change-set rows and tree ops. */
function displayNameForPath(docPath: string): string {
	const normalized = docPath
		.replace(/^\/+/, "")
		.replace(/^docs\//, "")
		.replace(/\/+$/, "");
	const segment = normalized.split("/").at(-1) ?? normalized;
	return segment.replace(/^\d+-/, "").replace(/-/g, " ");
}

/** One display row per entry, preserving the server's staging order. */
export function changesetDocRows(view: DocChangeSetView): ChangeSetDocRow[] {
	return view.entries.map((entry) => ({
		docPath: entry.docPath,
		displayName: displayNameForPath(entry.docPath),
		addCount: entry.addCount,
		delCount: entry.delCount,
		stale: entry.stale,
		status: entry.status,
		proposalId: entry.proposalId,
	}));
}

/** Human-readable, non-interactive rows for document-tree operations. */
export function changesetTreeOpRows(
	view: DocChangeSetView,
): ChangeSetTreeOpRow[] {
	return view.treeOps.map((operation) => {
		switch (operation.kind) {
			case "create-doc":
				return {
					key: `${operation.position}:create-doc:${operation.docPath}`,
					label: `create ${displayNameForPath(operation.docPath)}`,
				};
			case "delete-doc":
				return {
					key: `${operation.position}:delete-doc:${operation.docPath}`,
					label: `delete ${displayNameForPath(operation.docPath)}`,
				};
			case "move-doc":
				return {
					key: `${operation.position}:move-doc:${operation.from}:${operation.to}`,
					label: `move ${displayNameForPath(operation.from)} → ${displayNameForPath(operation.to)}`,
				};
		}
	});
}

export function changesetProgressLabel(view: DocChangeSetView): string | null {
	if (view.status !== "open" || view.progress.accepted === 0) return null;
	return `${view.progress.accepted} of ${view.progress.total} applied`;
}

/** The single visible state chip for an entry, ordered by actionability. */
export function changesetEntryChip(
	entry: Pick<DocChangeSetEntryView, "stale" | "status">,
): ChangeSetEntryChip | null {
	if (entry.stale) {
		return {
			state: "stale",
			label: "stale",
			title: "This document changed since staging and needs to be refreshed.",
		};
	}
	if (entry.status === "missing") {
		return {
			state: "missing",
			label: "missing",
			title: "This staged document is no longer available.",
		};
	}
	if (entry.status === "rejected") {
		return {
			state: "rejected",
			label: "rejected",
			title: "This document change was rejected.",
		};
	}
	if (entry.status === "accepted") {
		return {
			state: "accepted",
			label: "done",
			title: "This document change was applied.",
		};
	}
	return null;
}

export function acceptDisabledReason(view: DocChangeSetView): string | null {
	if (view.status !== "open") return "This change-set has already been resolved.";
	if (view.entries.every((entry) => entry.status !== "staged")) {
		return "There are no staged documents to accept.";
	}
	if (view.entries.some((entry) => entry.stale)) {
		const count = view.entries.filter((entry) => entry.stale).length;
		return count === 1
			? "One document changed since staging — refresh to restage."
			: `${count} documents changed since staging — refresh to restage.`;
	}
	return null;
}

export function rejectDisabledReason(view: DocChangeSetView): string | null {
	if (view.status !== "open") return "This change-set has already been resolved.";
	return view.entries.some((entry) => entry.status === "staged")
		? null
		: "There are no staged documents to reject.";
}

export function undoAvailable(view: DocChangeSetView): boolean {
	return view.status === "applied" && Boolean(view.compoundPatchId);
}
