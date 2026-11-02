import { describe, expect, it } from "bun:test";
import type { DocChangeSetView } from "@codecaine-ai/docs-viewer/lab";
import {
	consumeAiModeHandoff,
	markAiModeHandoff,
	selectChangesetsForDoc,
} from "./doc-lab-changesets";

function fixture(id: string, overrides: Partial<DocChangeSetView> = {}): DocChangeSetView {
	return {
		id,
		summary: id,
		status: "open",
		entries: [],
		treeOps: [],
		createdAt: "2026-08-17T12:00:00.000Z",
		progress: { accepted: 0, total: 0 },
		...overrides,
	};
}

describe("selectChangesetsForDoc", () => {
	it("keeps relevant open and undoable applied sets, excludes declined and unrelated sets, newest first", () => {
		const selected = selectChangesetsForDoc([
			fixture("touching", { createdAt: "2026-08-17T12:01:00.000Z", entries: [{ docPath: "docs/guide", proposalId: "p", status: "staged", stale: false, summary: "edit", addCount: 1, delCount: 0 }] }),
			fixture("tree", { createdAt: "2026-08-17T12:02:00.000Z", treeOps: [{ kind: "move-doc", from: "old", to: "guide", position: 0 }] }),
			fixture("undoable", { createdAt: "2026-08-17T12:03:00.000Z", status: "applied", compoundPatchId: "patch", entries: [{ docPath: "guide", proposalId: "p", status: "accepted", stale: false, summary: "edit", addCount: 1, delCount: 0 }] }),
			fixture("applied-no-undo", { status: "applied", entries: [{ docPath: "guide", proposalId: "p", status: "accepted", stale: false, summary: "edit", addCount: 1, delCount: 0 }] }),
			fixture("declined", { status: "declined", entries: [{ docPath: "guide", proposalId: "p", status: "staged", stale: false, summary: "edit", addCount: 1, delCount: 0 }] }),
			fixture("unrelated"),
		], "guide");

		expect(selected.map(({ id }) => id)).toEqual(["undoable", "tree", "touching"]);
	});

	it("shows only the most recent undoable applied set for the open document", () => {
		const entry = { docPath: "guide", proposalId: "p", status: "accepted" as const, stale: false, summary: "edit", addCount: 1, delCount: 0 };
		const selected = selectChangesetsForDoc([
			fixture("older", { createdAt: "2026-08-17T12:01:00.000Z", status: "applied", compoundPatchId: "patch-1", entries: [entry] }),
			fixture("newer", { createdAt: "2026-08-17T12:03:00.000Z", status: "applied", compoundPatchId: "patch-2", entries: [entry] }),
			fixture("open", { createdAt: "2026-08-17T12:02:00.000Z", entries: [{ ...entry, status: "staged" }] }),
			fixture("declined-newest", { createdAt: "2026-08-17T12:04:00.000Z", status: "declined", entries: [entry] }),
		], "guide");

		expect(selected.map(({ id }) => id)).toEqual(["newer", "open"]);
	});
});

describe("AI mode handoff", () => {
	it("is a one-shot flag", () => {
		consumeAiModeHandoff();
		markAiModeHandoff();
		expect(consumeAiModeHandoff()).toBe(true);
		expect(consumeAiModeHandoff()).toBe(false);
	});
});
