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

export function acceptDisabledReason(view: DocChangeSetView): string | null {
	if (view.status !== "open") return "change-set is not open";
	if (view.entries.every((entry) => entry.status !== "staged")) {
		return "no staged entries";
	}
	if (view.entries.some((entry) => entry.stale)) {
		return "stale entries — refresh";
	}
	return null;
}

export function rejectDisabledReason(view: DocChangeSetView): string | null {
	if (view.status !== "open") return "change-set is not open";
	return view.entries.some((entry) => entry.status === "staged")
		? null
		: "no staged entries";
}

export function undoAvailable(view: DocChangeSetView): boolean {
	return view.status === "applied" && Boolean(view.compoundPatchId);
}
