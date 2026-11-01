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
): DocChangeSetView[] {
	let appliedHistoryIncluded = false;
	return newestFirst(changesets.filter((changeset) => {
		if (changeset.status === "declined") return false;
		const touchesOpenDoc = touchesDoc(changeset, openDocPath);
		if (changeset.status === "applied") {
			return Boolean(changeset.compoundPatchId) && touchesOpenDoc;
		}
		return touchesOpenDoc;
	})).filter((changeset) => {
		if (changeset.status !== "applied") return true;
		if (appliedHistoryIncluded) return false;
		appliedHistoryIncluded = true;
		return true;
	});
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
