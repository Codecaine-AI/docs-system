import type { DocChangeSetView } from "@codecaine-ai/docs-viewer/lab";

function normalizedDocPath(path: string): string {
	return path.replace(/^\/+/, "").replace(/^docs\//i, "").replace(/\/+$/, "");
}

function touchesDoc(changeset: DocChangeSetView, openDocPath: string): boolean {
	const target = normalizedDocPath(openDocPath);
	if (changeset.entries.some((entry) => normalizedDocPath(entry.docPath) === target)) return true;
	return changeset.treeOps.some((operation) => {
		if (operation.kind === "move-doc") {
			return normalizedDocPath(operation.from) === target || normalizedDocPath(operation.to) === target;
		}
		return normalizedDocPath(operation.docPath) === target;
	});
}

function newestFirst(changesets: DocChangeSetView[]): DocChangeSetView[] {
	return changesets
		.map((changeset, index) => ({ changeset, index }))
		.sort((left, right) =>
			right.changeset.createdAt.localeCompare(left.changeset.createdAt) || left.index - right.index)
		.map(({ changeset }) => changeset);
}

export function selectChangesetsForDoc(
	changesets: DocChangeSetView[],
	openDocPath: string,
	sessionId?: string,
): DocChangeSetView[] {
	return newestFirst(changesets.filter((changeset) => {
		if (changeset.status === "declined") return false;
		const touchesOpenDoc = touchesDoc(changeset, openDocPath);
		if (changeset.status === "applied") {
			return Boolean(changeset.compoundPatchId) && touchesOpenDoc;
		}
		return touchesOpenDoc || (sessionId !== undefined && changeset.sessionId === sessionId);
	}));
}

/** Merge REST state with latest kernel event views; event state wins by id. */
export function overlayChangesets(
	fetched: DocChangeSetView[],
	updates: Iterable<DocChangeSetView>,
): DocChangeSetView[] {
	const byId = new Map(fetched.map((changeset) => [changeset.id, changeset]));
	for (const update of updates) byId.set(update.id, update);
	return newestFirst([...byId.values()]);
}

let aiModeHandoff = false;

export function markAiModeHandoff(): void {
	aiModeHandoff = true;
}

export function consumeAiModeHandoff(): boolean {
	const marked = aiModeHandoff;
	aiModeHandoff = false;
	return marked;
}

export function navigateToDoc(docPath: string): void {
	markAiModeHandoff();
	window.location.hash = `#/${docPath}`;
}
