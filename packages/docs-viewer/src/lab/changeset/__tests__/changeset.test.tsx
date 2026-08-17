import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ChangeSetCard } from "../ChangeSetCard";
import {
	acceptDisabledReason,
	changesetDocRows,
	changesetProgressLabel,
	changesetTreeOpRows,
	rejectDisabledReason,
	undoAvailable,
	type DocChangeSetView,
} from "../changeset-model";

afterEach(cleanup);

function fixture(overrides: Partial<DocChangeSetView> = {}): DocChangeSetView {
	return {
		id: "changeset-1",
		summary: "Move architecture notes",
		status: "open",
		entries: [
			{
				docPath: "docs/10-architecture/20-north-star",
				proposalId: "proposal-north-star",
				status: "staged",
				stale: false,
				summary: "Add the north star",
				addCount: 4,
				delCount: 1,
			},
			{
				docPath: "docs/30-guides/10-quick-start",
				proposalId: "proposal-quick-start",
				status: "accepted",
				stale: false,
				summary: "Remove duplicate setup",
				addCount: 0,
				delCount: 2,
			},
		],
		treeOps: [
			{ kind: "create-doc", docPath: "docs/40-reference/10-api-guide", title: "API guide", position: 0 },
			{ kind: "move-doc", from: "docs/50-old/10-legacy", to: "docs/50-old/20-archive", position: 1 },
		],
		createdAt: "2026-08-16T12:00:00.000Z",
		progress: { accepted: 1, total: 2 },
		...overrides,
	};
}

describe("change-set model", () => {
	it("derives ordered document and tree-operation rows with readable labels", () => {
		const changeset = fixture();

		expect(changesetDocRows(changeset)).toEqual([
			{
				docPath: "docs/10-architecture/20-north-star",
				displayName: "north star",
				addCount: 4,
				delCount: 1,
				stale: false,
				status: "staged",
				proposalId: "proposal-north-star",
			},
			{
				docPath: "docs/30-guides/10-quick-start",
				displayName: "quick start",
				addCount: 0,
				delCount: 2,
				stale: false,
				status: "accepted",
				proposalId: "proposal-quick-start",
			},
		]);
		expect(changesetTreeOpRows(changeset).map((row) => row.label)).toEqual([
			"create api guide",
			"move legacy → archive",
		]);
	});

	it("shows partial application progress only while open", () => {
		expect(changesetProgressLabel(fixture())).toBe("1 of 2 applied");
		expect(changesetProgressLabel(fixture({ progress: { accepted: 0, total: 2 } }))).toBeNull();
		expect(changesetProgressLabel(fixture({ status: "applied" }))).toBeNull();
	});

	it("gates accept for stale or fully resolved entries and reject when nothing remains staged", () => {
		const stale = fixture({
			entries: [{ ...fixture().entries[0]!, stale: true }],
			progress: { accepted: 0, total: 1 },
		});
		const resolved = fixture({
			entries: [{ ...fixture().entries[1]!, status: "accepted" }],
			progress: { accepted: 1, total: 1 },
		});

		expect(acceptDisabledReason(fixture())).toBeNull();
		expect(rejectDisabledReason(fixture())).toBeNull();
		expect(acceptDisabledReason(stale)).toBe("stale entries — refresh");
		expect(rejectDisabledReason(stale)).toBeNull();
		expect(acceptDisabledReason(resolved)).not.toBeNull();
		expect(rejectDisabledReason(resolved)).not.toBeNull();
		expect(acceptDisabledReason(fixture({ status: "declined" }))).not.toBeNull();
		expect(rejectDisabledReason(fixture({ status: "applied" }))).not.toBeNull();
	});

	it("offers undo only for an applied change-set with a compound patch", () => {
		expect(undoAvailable(fixture({ status: "applied", compoundPatchId: "compound-1" }))).toBe(true);
		expect(undoAvailable(fixture({ status: "applied" }))).toBe(false);
		expect(undoAvailable(fixture({ compoundPatchId: "compound-1" }))).toBe(false);
	});
});

describe("ChangeSetCard", () => {
	it("renders document counts, stale state, and the current document row", () => {
		const changeset = fixture({
			entries: [
				{ ...fixture().entries[0]!, stale: true },
				fixture().entries[1]!,
			],
		});
		render(<ChangeSetCard changeset={changeset} openDocPath="docs/10-architecture/20-north-star" />);

		const openRow = document.querySelector<HTMLButtonElement>('[data-docs-lab-changeset-row="docs/10-architecture/20-north-star"]');
		expect(openRow).toBeTruthy();
		expect(openRow?.getAttribute("aria-current")).toBe("true");
		expect(openRow?.textContent).toContain("north star");
		expect(openRow?.textContent).toContain("+4");
		expect(openRow?.textContent).toContain("−1");
		expect(document.querySelector('[data-docs-lab-changeset-stale]')).toBeTruthy();
		expect(document.querySelectorAll('[data-docs-lab-changeset-treeop]')).toHaveLength(2);
	});

	it("sends the selected document path to the host", () => {
		const onOpenDoc = mock(() => {});
		render(<ChangeSetCard changeset={fixture()} onOpenDoc={onOpenDoc} />);

		fireEvent.click(document.querySelector('[data-docs-lab-changeset-row="docs/30-guides/10-quick-start"]')!);
		expect(onOpenDoc).toHaveBeenCalledWith("docs/30-guides/10-quick-start");
	});

	it("wires enabled accept and reject actions", () => {
		const onAccept = mock(() => {});
		const onReject = mock(() => {});
		render(<ChangeSetCard changeset={fixture()} onAccept={onAccept} onReject={onReject} />);

		fireEvent.click(screen.getByRole("button", { name: "Accept change-set" }));
		fireEvent.click(screen.getByRole("button", { name: "Reject change-set" }));
		expect(onAccept).toHaveBeenCalledTimes(1);
		expect(onReject).toHaveBeenCalledTimes(1);
	});

	it("exposes model disabled reasons and disables every action while busy", () => {
		const stale = fixture({
			entries: [{ ...fixture().entries[0]!, stale: true }],
			progress: { accepted: 0, total: 1 },
		});
		const { rerender } = render(<ChangeSetCard changeset={stale} />);

		const accept = screen.getByRole("button", { name: "Accept change-set" }) as HTMLButtonElement;
		expect(accept.disabled).toBe(true);
		expect(accept.getAttribute("title")).toBe(acceptDisabledReason(stale));

		rerender(<ChangeSetCard changeset={fixture()} busy="accepting" />);
		const busyAccept = screen.getByRole("button", { name: "Accept change-set" }) as HTMLButtonElement;
		expect(busyAccept.textContent).toBe("Accepting…");
		expect(busyAccept.disabled).toBe(true);
		expect((screen.getByRole("button", { name: "Reject change-set" }) as HTMLButtonElement).disabled).toBe(true);
	});

	it("shows an applied undo action and renders host errors", () => {
		const onUndo = mock(() => {});
		render(
			<ChangeSetCard
				changeset={fixture({ status: "applied", compoundPatchId: "compound-1" })}
				error="The change-set could not be applied"
				onUndo={onUndo}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Undo change-set" }));
		expect(onUndo).toHaveBeenCalledTimes(1);
		expect(document.querySelector('[data-docs-lab-changeset-error]')?.textContent).toBe("The change-set could not be applied");
	});
});
