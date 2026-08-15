import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { applyOps } from "@codecaine-ai/docs-model/doc-ops";
import type { DocEditProposal } from "@codecaine-ai/docs-viewer/lab";

export type DocLabStagedRegion = {
	key: string;
	proposal: DocEditProposal;
	afterDoc: DocDocument;
	beforeIds: string[];
	afterIds: string[];
	startIndex: number;
	endIndex: number;
};

/** A renderer-only document whose root exposes exactly one top-level run. */
export function narrowDocToRootChildren(
	doc: DocDocument,
	children: readonly string[],
): DocDocument {
	const root = doc.blocks[doc.root];
	if (!root) return doc;
	return {
		...doc,
		blocks: {
			...doc.blocks,
			[doc.root]: { ...root, children: [...children] },
		},
	};
}

function parentMap(doc: DocDocument): Map<string, string> {
	const parents = new Map<string, string>();
	for (const block of Object.values(doc.blocks)) {
		for (const childId of block.children) parents.set(childId, block.id);
	}
	return parents;
}

/** The direct child of root containing `blockId`, or null for root/missing ids. */
export function topLevelAncestor(
	doc: DocDocument,
	blockId: string,
): string | null {
	if (blockId === doc.root || !doc.blocks[blockId]) return null;
	const parents = parentMap(doc);
	let current = blockId;
	let parent = parents.get(current);
	while (parent && parent !== doc.root) {
		current = parent;
		parent = parents.get(current);
	}
	return parent === doc.root ? current : null;
}

function contiguousRuns(ids: readonly string[], included: ReadonlySet<string>): string[][] {
	const runs: string[][] = [];
	let current: string[] = [];
	for (const id of ids) {
		if (included.has(id)) {
			current.push(id);
			continue;
		}
		if (current.length > 0) runs.push(current);
		current = [];
	}
	if (current.length > 0) runs.push(current);
	return runs;
}

function afterIdsForBeforeRun(
	beforeDoc: DocDocument,
	afterDoc: DocDocument,
	beforeRun: readonly string[],
): string[] {
	const beforeRoot = beforeDoc.blocks[beforeDoc.root];
	const afterRoot = afterDoc.blocks[afterDoc.root];
	if (!beforeRoot || !afterRoot || beforeRun.length === 0) return [];
	const start = beforeRoot.children.indexOf(beforeRun[0]!);
	const end = beforeRoot.children.indexOf(beforeRun[beforeRun.length - 1]!);
	if (start < 0 || end < start) return [];
	const previousBoundary = beforeRoot.children[start - 1];
	const nextBoundary = beforeRoot.children[end + 1];
	const afterStart = previousBoundary
		? Math.max(0, afterRoot.children.indexOf(previousBoundary) + 1)
		: 0;
	const nextIndex = nextBoundary
		? afterRoot.children.indexOf(nextBoundary)
		: afterRoot.children.length;
	const afterEnd = nextIndex < 0 ? afterRoot.children.length : nextIndex;
	return afterRoot.children.slice(afterStart, Math.max(afterStart, afterEnd));
}

/**
 * Staged proposal regions in current-document order. Changed descendants are
 * promoted to their direct child of root and split into contiguous runs.
 */
export function buildDocLabStagedRegions(
	doc: DocDocument,
	proposals: readonly DocEditProposal[],
): DocLabStagedRegion[] {
	const rootChildren = doc.blocks[doc.root]?.children ?? [];
	const regions: DocLabStagedRegion[] = [];

	for (const proposal of proposals) {
		let reviewId = 0;
		const applied = applyOps(
			doc,
			proposal.ops,
			() => `docs-review-${proposal.transactionId}-${++reviewId}`,
		);
		if (!applied.ok) continue;
		const afterDoc = applied.doc;
		const affectedBefore = new Set<string>();
		const affectedAfter = new Set<string>();
		for (const changedId of proposal.changedBlockIds) {
			const beforeTop = topLevelAncestor(doc, changedId);
			const afterTop = topLevelAncestor(afterDoc, changedId);
			if (beforeTop) affectedBefore.add(beforeTop);
			if (afterTop) affectedAfter.add(afterTop);
		}

		const beforeRuns = contiguousRuns(rootChildren, affectedBefore);
		for (const [runIndex, beforeIds] of beforeRuns.entries()) {
			const startIndex = rootChildren.indexOf(beforeIds[0]!);
			regions.push({
				key: `${proposal.transactionId}:${runIndex}`,
				proposal,
				afterDoc,
				beforeIds,
				afterIds: afterIdsForBeforeRun(doc, afterDoc, beforeIds),
				startIndex,
				endIndex: startIndex + beforeIds.length - 1,
			});
		}

		// A top-level insertion can have no corresponding id in the current
		// document. Anchor it immediately before the next surviving sibling.
		if (beforeRuns.length === 0 && affectedAfter.size > 0) {
			const afterChildren = afterDoc.blocks[afterDoc.root]?.children ?? [];
			const afterIds = afterChildren.filter((id) => affectedAfter.has(id));
			if (afterIds.length === 0) continue;
			const firstAfterIndex = afterChildren.indexOf(afterIds[0]!);
			const nextExisting = afterChildren
				.slice(firstAfterIndex + 1)
				.find((id) => rootChildren.includes(id));
			const startIndex = nextExisting
				? rootChildren.indexOf(nextExisting)
				: rootChildren.length;
			regions.push({
				key: `${proposal.transactionId}:insert`,
				proposal,
				afterDoc,
				beforeIds: [],
				afterIds,
				startIndex,
				endIndex: startIndex - 1,
			});
		}
	}

	return regions.sort(
		(a, b) => a.startIndex - b.startIndex || a.key.localeCompare(b.key),
	);
}

export function blocksInStagedRegions(
	doc: DocDocument,
	regions: readonly DocLabStagedRegion[],
): Set<string> {
	const ids = new Set<string>();
	const addSubtrees = (source: DocDocument, roots: readonly string[]) => {
		const stack = [...roots];
		const visited = new Set<string>();
		while (stack.length > 0) {
			const id = stack.pop()!;
			if (visited.has(id)) continue;
			visited.add(id);
			ids.add(id);
			stack.push(...(source.blocks[id]?.children ?? []));
		}
	};
	for (const region of regions) {
		addSubtrees(doc, region.beforeIds);
		addSubtrees(region.afterDoc, region.afterIds);
	}
	return ids;
}
