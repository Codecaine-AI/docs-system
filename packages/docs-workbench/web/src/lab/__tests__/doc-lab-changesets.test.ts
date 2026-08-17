import { describe, expect, it } from "bun:test";
import type { DocChangeSetView } from "@codecaine-ai/docs-viewer/lab";
import {
	consumeAiModeHandoff,
	markAiModeHandoff,
	overlayChangesets,
	selectChangesetsForDoc,
} from "../doc-lab-changesets";

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
			fixture("session", { createdAt: "2026-08-17T12:04:00.000Z", sessionId: "live" }),
			fixture("tree", { createdAt: "2026-08-17T12:02:00.000Z", treeOps: [{ kind: "move-doc", from: "old", to: "guide", position: 0 }] }),
			fixture("undoable", { createdAt: "2026-08-17T12:03:00.000Z", status: "applied", compoundPatchId: "patch", entries: [{ docPath: "guide", proposalId: "p", status: "accepted", stale: false, summary: "edit", addCount: 1, delCount: 0 }] }),
			fixture("applied-no-undo", { status: "applied", entries: [{ docPath: "guide", proposalId: "p", status: "accepted", stale: false, summary: "edit", addCount: 1, delCount: 0 }] }),
			fixture("declined", { status: "declined", sessionId: "live" }),
			fixture("unrelated"),
		], "guide", "live");

		expect(selected.map(({ id }) => id)).toEqual(["session", "undoable", "tree", "touching"]);
	});
});

describe("overlayChangesets", () => {
	it("uses event views by id and retains fetched and event-only records", () => {
		const fetched = fixture("same", { status: "open" });
		const event = fixture("same", { status: "applied", compoundPatchId: "patch" });
		expect(overlayChangesets([fetched, fixture("rest")], [event, fixture("event")]))
			.toEqual([event, fixture("rest"), fixture("event")]);
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
