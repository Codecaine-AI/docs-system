import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type {
	DocEditProposal,
	DocEditRequest,
	DocEditSession,
} from "@codecaine-ai/docs-viewer/lab";

import { DocLab, type DocLabProps } from "../DocLab";
import type { DocLabSessionResult } from "../doc-lab-controller";
import { labelForTarget } from "../target-label";

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

function threads(): DocLabProps["threads"] {
	return {
		annotations: [],
		document: DOC,
		canvases: null,
		selection: null,
		onClearSelection: mock(() => {}),
		onAddAnnotation: mock(async () => {}),
		onAddReply: mock(async () => {}),
		onResolveAnnotation: mock(async () => {}),
		onFocusTarget: mock(() => {}),
		isSubmitting: false,
		error: null,
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
		agentConnected: Boolean(session.onApplyQueue),
		refetchProposals: mock(async () => {}),
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
});

describe("DocLab", () => {
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
					threads={threads()}
					onFocusTarget={mock(() => {})}
				/>
			</div>,
		);

		expect(screen.getByRole("navigation", { name: "Document outline" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Overview" })).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "AI" }));
		expect(onTabSelect).toHaveBeenCalledWith("ai");
	});

	it("disables Apply without an agent and surfaces session errors", () => {
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
					threads={threads()}
					onFocusTarget={mock(() => {})}
				/>
			</div>,
		);

		const apply = screen.getByRole("button", { name: "Apply queue" });
		expect(apply.hasAttribute("disabled")).toBe(true);
		expect(apply.getAttribute("title")).toBe("docs agent not connected");
		expect(document.querySelector('[data-docs-lab-card-conflict="R1"]')).toBeTruthy();
		expect(screen.getByText("Could not load proposals")).toBeTruthy();
		expect(screen.getByText("R1: Request failed")).toBeTruthy();
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
					threads={threads()}
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
