import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type {
	DocEditProposal,
	DocEditRequest,
	DocEditSession,
	DocChangeSetView,
} from "@codecaine-ai/docs-viewer/lab";

import { DocLab } from "../DocLab";
import type { DocLabSessionResult } from "../doc-lab-controller";
import { labelForTarget } from "../target-label";
import { consumeAiModeHandoff } from "../doc-lab-changesets";

afterEach(cleanup);

const DOC: DocDocument = {
	schemaVersion: 1,
	id: "doc-lab",
	title: "Lab",
	root: "root",
	blocks: {
		root: {
			id: "root",
			type: "paragraph",
			props: {},
			children: ["intro", "heading-1", "heading-2"],
		},
		intro: {
			id: "intro",
			type: "paragraph",
			props: {},
			text: [
				{
					insert:
						"1234567890123456789012345678901234567890123",
				},
			],
			children: [],
		},
		"heading-1": {
			id: "heading-1",
			type: "heading",
			props: { level: 1 },
			text: [{ insert: "Overview" }],
			children: ["body-1"],
		},
		"body-1": {
			id: "body-1",
			type: "paragraph",
			props: {},
			text: [{ insert: "Overview body" }],
			children: [],
		},
		"heading-2": {
			id: "heading-2",
			type: "heading",
			props: { level: 2 },
			text: [{ insert: "Details" }],
			children: ["body-2"],
		},
		"body-2": {
			id: "body-2",
			type: "quote",
			props: {},
			text: [{ insert: "Detail body" }],
			children: [],
		},
	},
};

function request(
	alias: string,
	status: DocEditRequest["status"] = "open",
): DocEditRequest {
	return {
		id: `request-${alias}`,
		annotationId: `annotation-${alias}`,
		alias,
		target: { kind: "block", blockId: "body-1" },
		body: `Change ${alias}`,
		status,
		disposition: "batch",
		thread: [],
	};
}

function proposal(alias: string): DocEditProposal {
	return {
		transactionId: `proposal-${alias}`,
		alias,
		summary: `Proposal ${alias}`,
		ops: [],
		changedBlockIds: ["body-1"],
		baseHash: "hash",
	};
}

function lab(
	session: DocEditSession,
	overrides: Partial<DocLabSessionResult> = {},
): DocLabSessionResult {
	return {
		session,
		staleProposals: [],
		requestErrors: {},
		proposalsError: null,
		changesets: [],
		changesetBusy: {},
		changesetErrors: {},
		agentConnected: Boolean(session.onApplyQueue),
		applying: false,
		sessionError: null,
		agentStatus: session.onApplyQueue ? "connected" : "offline",
		refetchProposals: mock(async () => {}),
		refetchChangesets: mock(async () => {}),
		acceptChangeset: mock(async () => {}),
		rejectChangeset: mock(async () => {}),
		undoChangeset: mock(async () => {}),
		...overrides,
	};
}

describe("labelForTarget", () => {
	it("labels document targets and inherits the closest outline heading", () => {
		expect(labelForTarget(DOC, { kind: "doc" })).toBe("document");
		expect(
			labelForTarget(DOC, { kind: "block", blockId: "body-1" }),
		).toBe("Overview");
		expect(
			labelForTarget(DOC, {
				kind: "text-range",
				blockId: "body-2",
				start: 0,
				end: 6,
				quote: "Detail",
			}),
		).toBe("Details");
	});

	it("falls back to the block descriptor and a truncated text preview", () => {
		expect(
			labelForTarget(DOC, { kind: "block", blockId: "intro" }),
		).toBe(
			"Paragraph: 123456789012345678901234567890123456789012...",
		);
	});

	it("prefixes only cross-document targets without changing legacy labels", () => {
		const target = { kind: "block", blockId: "body-1" } as const;
		const legacyLabel = labelForTarget(DOC, target);

		expect(labelForTarget(DOC, target, "docs/10-architecture/10-overview/")).toBe(
			legacyLabel,
		);
		expect(
			labelForTarget(
				DOC,
				{ ...target, docPath: "10-architecture/20-north-star" },
				"docs/10-architecture/10-overview/",
			),
		).toBe("north star → Paragraph: Overview body");
		expect(
			labelForTarget(
				DOC,
				{
					kind: "block",
					blockId: "other-doc-block",
					docPath: "docs/20-guides/30-api-reference/",
				},
				"10-architecture/10-overview",
			),
		).toBe("api reference → block");
	});
});

describe("DocLab", () => {
	it("mounts change-set cards without a threads list and preserves AI mode on row navigation", () => {
		consumeAiModeHandoff();
		window.location.hash = "#/guide";
		const changeset: DocChangeSetView = {
			id: "cs-1",
			summary: "Move a section",
			status: "open",
			entries: [{
				docPath: "reference/api",
				proposalId: "proposal-cs-1",
				status: "staged",
				stale: false,
				summary: "Add section",
				addCount: 2,
				delCount: 0,
			}],
			treeOps: [],
			createdAt: "2026-01-01T00:00:00.000Z",
			progress: { accepted: 0, total: 1 },
		};
		render(
			<div className="relative h-[800px]">
				<DocLab tab="ai" onTabSelect={mock(() => {})} doc={DOC}
					openDocPath="guide" outlineScrollerSelector="[data-test-scroller]"
					lab={lab({ requests: [], proposals: [] }, { changesets: [changeset] })}
					onFocusTarget={mock(() => {})} />
			</div>,
		);
		const card = document.querySelector('[data-docs-lab-changeset="cs-1"]');
		expect(card).toBeTruthy();
		expect(document.querySelector('[data-lab-zone="threads"]')).toBeNull();

		fireEvent.click(document.querySelector('[data-docs-lab-changeset-row="reference/api"]')!);
		expect(window.location.hash).toBe("#/reference/api");
		expect(consumeAiModeHandoff()).toBe(true);
		expect(consumeAiModeHandoff()).toBe(false);
	});

	it("renders the edit outline and delegates tab selection", () => {
		const onTabSelect = mock(() => {});
		render(
			<div className="relative h-[800px]">
				<DocLab
					tab="edit"
					onTabSelect={onTabSelect}
					doc={DOC}
					outlineScrollerSelector="[data-test-scroller]"
					lab={lab({ requests: [], proposals: [] })}
					onFocusTarget={mock(() => {})}
				/>
			</div>,
		);

		expect(screen.getByRole("navigation", { name: "Document outline" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Overview" })).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "AI" }));
		expect(onTabSelect).toHaveBeenCalledWith("ai");
	});

	it("disables Run queue without an agent and surfaces session errors", () => {
		const session: DocEditSession = {
			requests: [{ ...request("R1"), targetChanged: true }],
			proposals: [],
		};
		render(
			<div className="relative h-[800px]">
				<DocLab
					tab="ai"
					onTabSelect={mock(() => {})}
					doc={DOC}
					outlineScrollerSelector="[data-test-scroller]"
					lab={lab(session, {
						proposalsError: "Could not load proposals",
						requestErrors: { R1: "Request failed" },
					})}
					annotationsError="Could not load annotations"
					onFocusTarget={mock(() => {})}
				/>
			</div>,
		);

		const apply = screen.getByRole("button", { name: "Apply queue" });
		expect(apply.hasAttribute("disabled")).toBe(true);
		expect(apply.getAttribute("title")).toBe("docs agent not connected");
		expect(document.querySelector('[data-docs-lab-card-conflict="R1"]')).toBeTruthy();
		expect(screen.getByText("Could not load proposals")).toBeTruthy();
		expect(
			document.querySelector("[data-docs-lab-annotations-error]")?.textContent,
		).toBe("Could not load annotations");
		expect(screen.getByText("R1: Request failed")).toBeTruthy();
	});

	it("renders session failures and connectivity transitions in the queue dock", () => {
		const session: DocEditSession = {
			requests: [request("R1")],
			proposals: [],
			onApplyQueue: mock(async () => {}),
		};
		const props = {
			tab: "ai" as const,
			onTabSelect: mock(() => {}),
			doc: DOC,
			outlineScrollerSelector: "[data-test-scroller]",
			onFocusTarget: mock(() => {}),
		};
		const view = render(
			<div className="relative h-[800px]">
				<DocLab
					{...props}
					lab={lab(session, {
						agentConnected: false,
						agentStatus: "offline",
						sessionError:
							"The docs agent is running against a different docs root — it doesn't know this document.",
					})}
				/>
			</div>,
		);

		expect(
			document.querySelector('[data-docs-lab-agent-status="offline"]'),
		).toBeTruthy();
		expect(document.querySelector("[data-docs-lab-session-error]")?.textContent).toContain(
			"different docs root",
		);

		view.rerender(
			<div className="relative h-[800px]">
				<DocLab {...props} lab={lab(session, { agentStatus: "connected" })} />
			</div>,
		);
		expect(
			document.querySelector('[data-docs-lab-agent-status="connected"]'),
		).toBeTruthy();

		view.rerender(
			<div className="relative h-[800px]">
				<DocLab
					{...props}
					lab={lab(session, { applying: true, agentStatus: "running" })}
				/>
			</div>,
		);
		expect(
			document.querySelector('[data-docs-lab-agent-status="running"]'),
		).toBeTruthy();
		expect(screen.getByRole("button", { name: "Apply queue" }).textContent).toBe(
			"running…",
		);
	});

	it("moves the first submitted card from queued to processing immediately", () => {
		const session: DocEditSession = {
			requests: [request("R1"), request("R2")],
			proposals: [],
			onApplyQueue: mock(async () => {}),
		};
		const props = {
			tab: "ai" as const,
			onTabSelect: mock(() => {}),
			doc: DOC,
			outlineScrollerSelector: "[data-test-scroller]",
			onFocusTarget: mock(() => {}),
		};
		const view = render(
			<div className="relative h-[800px]">
				<DocLab {...props} lab={lab(session)} />
			</div>,
		);
		const firstState = () =>
			document.querySelector('[data-docs-lab-card-state="R1"]');
		expect(firstState()?.textContent).toBe("");

		view.rerender(
			<div className="relative h-[800px]">
				<DocLab
					{...props}
					lab={lab(
						{
							...session,
							requests: [request("R1", "working"), request("R2")],
						},
						{ applying: true, agentStatus: "running" },
					)}
				/>
			</div>,
		);
		expect(firstState()?.textContent).toBe("processing");
	});

	it("applies unstaged request annotation ids in queue order", () => {
		const onApplyQueue = mock(async (_ids: string[]) => {});
		const session: DocEditSession = {
			requests: [request("R1"), request("R2", "ready"), request("R3")],
			proposals: [proposal("R2")],
			onApplyQueue,
		};
		render(
			<div className="relative h-[800px]">
				<DocLab
					tab="ai"
					onTabSelect={mock(() => {})}
					doc={DOC}
					outlineScrollerSelector="[data-test-scroller]"
					lab={lab(session)}
					onFocusTarget={mock(() => {})}
				/>
			</div>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Apply queue" }));
		expect(onApplyQueue).toHaveBeenCalledWith([
			"annotation-R1",
			"annotation-R3",
		]);
	});
});
