import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { PanelQueue } from "../annotate/PanelQueue";
import { GlassPanel } from "../glass/GlassPanel";
import type { DocEditSession } from "../session/doc-edit-session";
import { buildRequestQueue } from "../session/request-queue";

afterEach(cleanup);

const session: DocEditSession = {
	requests: [{
		id: "request-1",
		alias: "R1",
		annotationId: "annotation-1",
		target: { kind: "block", blockId: "block-1" },
		body: "Clarify this paragraph",
		status: "open",
		disposition: "batch",
		thread: [],
	}],
	proposals: [],
};

describe("PanelQueue", () => {
	it("filters open requests and completed records with accurate counts", () => {
		const completedRequest = {
			...session.requests[0]!,
			id: "request-2",
			alias: "R2",
			status: "resolved" as const,
		};
		const mixedSession: DocEditSession = {
			requests: [...session.requests, completedRequest],
			proposals: [],
		};

		render(
			<PanelQueue
				session={mixedSession}
				queue={buildRequestQueue({ requests: mixedSession.requests, proposals: [], applying: false })}
				applying={false}
				agentStatus="connected"
				onApply={() => {}}
				labelForTarget={() => "Paragraph"}
			/>,
		);

		const open = document.querySelector<HTMLButtonElement>('[data-docs-lab-filter="open"]')!;
		const done = document.querySelector<HTMLButtonElement>('[data-docs-lab-filter="done"]')!;
		expect(open.textContent).toBe("Open (1)");
		expect(done.textContent).toBe("Done (1)");
		expect(open.getAttribute("aria-pressed")).toBe("true");
		expect(done.getAttribute("aria-pressed")).toBe("false");
		expect(document.querySelector('[data-docs-lab-session-card="R1"]')).toBeTruthy();
		expect(document.querySelector('[data-docs-lab-session-card="R1"] [data-docs-lab-msg="user"]')?.textContent).toContain("Clarify this paragraph");
		expect(document.querySelector('[data-docs-lab-session-record="R2"]')).toBeNull();

		fireEvent.click(done);
		expect(open.getAttribute("aria-pressed")).toBe("false");
		expect(done.getAttribute("aria-pressed")).toBe("true");
		expect(document.querySelector('[data-docs-lab-session-card="R1"]')).toBeNull();
		expect(document.querySelector('[data-docs-lab-session-record="R2"]')).toBeTruthy();
		expect(screen.getByText("Clarify this paragraph")).toBeTruthy();
	});

	it("switches from done to open when the dock files a document note", () => {
		const onFileGlobal = mock(() => {});
		const completedSession: DocEditSession = {
			requests: [{ ...session.requests[0]!, status: "resolved" }],
			proposals: [],
		};
		render(
			<PanelQueue
				session={completedSession}
				queue={buildRequestQueue({ requests: completedSession.requests, proposals: [], applying: false })}
				applying={false}
				agentStatus="connected"
				onApply={() => {}}
				onFileGlobal={onFileGlobal}
				labelForTarget={() => "Paragraph"}
			/>,
		);

		fireEvent.click(document.querySelector<HTMLButtonElement>('[data-docs-lab-filter="done"]')!);
		expect(document.querySelector('[data-docs-lab-session-record="R1"]')).toBeTruthy();
		const input = screen.getByRole("textbox", { name: "Message the whole document" });
		fireEvent.change(input, { target: { value: "Tighten the introduction" } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(onFileGlobal).toHaveBeenCalledWith("Tighten the introduction");
		expect(document.querySelector('[data-docs-lab-filter="open"]')?.getAttribute("aria-pressed")).toBe("true");
		expect(screen.getByText("Targets")).toBeTruthy();
		expect(screen.getByText("Document")).toBeTruthy();
		expect(screen.getAllByText("empty")).toHaveLength(2);
		expect(document.querySelector('[data-docs-lab-session-record="R1"]')).toBeNull();
	});

	it("always shows grouped headers with minimal empty states in both views", () => {
		const emptySession: DocEditSession = { requests: [], proposals: [] };
		render(
			<PanelQueue
				session={emptySession}
				queue={buildRequestQueue({ requests: [], proposals: [], applying: false })}
				applying={false}
				agentStatus="offline"
				onApply={() => {}}
				labelForTarget={() => "Paragraph"}
			/>,
		);

		expect(screen.getByText("Targets")).toBeTruthy();
		expect(screen.getByText("Document")).toBeTruthy();
		expect(screen.getAllByText("empty")).toHaveLength(2);
		fireEvent.click(document.querySelector<HTMLButtonElement>('[data-docs-lab-filter="done"]')!);
		expect(screen.getByText("Targets")).toBeTruthy();
		expect(screen.getByText("Document")).toBeTruthy();
		expect(screen.getAllByText("empty")).toHaveLength(2);
	});

	it("puts filters and status in the top bar and splits the dock into filing and run rows", () => {
		render(
			<PanelQueue session={session} queue={buildRequestQueue({ requests: session.requests, proposals: [], applying: false })} applying={false} agentStatus="connected" onApply={() => {}} onFileGlobal={() => {}} labelForTarget={() => "Paragraph"} />,
		);

		const topBar = document.querySelector('[data-docs-lab-queue-top-bar]')!;
		const dock = document.querySelector('[data-docs-lab-queue-dock]')!;
		expect(topBar.querySelector('[data-docs-lab-filter="open"]')).toBeTruthy();
		expect(topBar.querySelector('[data-docs-lab-filter="done"]')).toBeTruthy();
		expect(topBar.querySelector('[data-docs-lab-agent-status="connected"]')).toBeTruthy();
		expect(dock.querySelector('[data-docs-lab-agent-status]')).toBeNull();
		expect(document.querySelector('[data-docs-lab-queue-dock-input] input[aria-label="Message the whole document"]')).toBeTruthy();
		expect(document.querySelector('[data-docs-lab-queue-dock-run] [data-docs-lab-queue-apply]')).toBeTruthy();
	});

	it("groups done records, shows bodies and collapsed replies, focuses targets, and undoes applied work", () => {
		const onUndo = mock(() => {});
		const onFocusTarget = mock(() => {});
		const doneSession: DocEditSession = {
			requests: [
				{ ...session.requests[0]!, status: "applied", thread: [{ id: "reply-1", author: "agent", body: "Applied reply", at: "t1" }] },
				{ ...session.requests[0]!, id: "request-2", alias: "R2", target: { kind: "doc" }, body: "Fix the whole document", status: "resolved", disposition: "global" },
			],
			proposals: [],
			undoableAlias: "R1",
			onUndo,
		};
		render(
			<PanelQueue session={doneSession} queue={buildRequestQueue({ requests: doneSession.requests, proposals: [], applying: false })} applying={false} agentStatus="connected" onApply={() => {}} onFocusTarget={onFocusTarget} labelForTarget={() => "Paragraph"} />,
		);

		fireEvent.click(document.querySelector<HTMLButtonElement>('[data-docs-lab-filter="done"]')!);
		expect(screen.getByText("Targets")).toBeTruthy();
		expect(screen.getByText("Document")).toBeTruthy();
		expect(screen.getByText("Clarify this paragraph")).toBeTruthy();
		expect(screen.getByText("Fix the whole document")).toBeTruthy();
		const record = document.querySelector<HTMLElement>('[data-docs-lab-session-record="R1"]')!;
		expect(record.getAttribute("data-docs-lab-record-state")).toBe("resolved");
		const toggle = record.querySelector<HTMLButtonElement>('[data-docs-lab-thread-toggle="R1"]')!;
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByText("Applied reply")).toBeNull();
		fireEvent.click(toggle);
		expect(screen.getByText("Applied reply")).toBeTruthy();
		expect(record.querySelector('[data-docs-lab-msg="user"]')?.textContent).toContain("Clarify this paragraph");
		expect(record.querySelector('[data-docs-lab-msg="agent"]')?.textContent).toContain("agentApplied reply");
		fireEvent.click(record);
		expect(onFocusTarget).toHaveBeenCalledWith(session.requests[0]!.target);
		fireEvent.click(record.querySelector<HTMLButtonElement>('[data-docs-lab-record-undo="request-1"]')!);
		expect(onUndo).toHaveBeenCalledWith("R1");
	});

	it("collapses non-waiting threads and toggles their readable replies", () => {
		const threadedSession: DocEditSession = {
			...session,
			requests: [{
				...session.requests[0]!,
				thread: [{ id: "reply-1", author: "user", body: "Human reply", at: "t1" }],
			}],
		};
		render(
			<PanelQueue
				session={threadedSession}
				queue={buildRequestQueue({ requests: threadedSession.requests, proposals: [], applying: false })}
				applying={false}
				agentStatus="connected"
				onApply={() => {}}
				labelForTarget={() => "Paragraph"}
			/>,
		);

		expect(screen.getByText("Targets")).toBeTruthy();
		const toggle = document.querySelector<HTMLButtonElement>('[data-docs-lab-thread-toggle="R1"]')!;
		expect(toggle.textContent).toBe("▸ 1 reply");
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByText("Human reply")).toBeNull();

		fireEvent.click(toggle);
		expect(toggle.textContent).toBe("▾ 1 reply");
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		expect(document.querySelectorAll('[data-docs-lab-msg="user"]')).toHaveLength(2);
		expect(screen.getByText("Human reply")).toBeTruthy();

		fireEvent.click(toggle);
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByText("Human reply")).toBeNull();
	});

	it("starts waiting threads expanded without status copy and keeps the reply affordance", () => {
		const waitingSession: DocEditSession = {
			requests: [{
				...session.requests[0]!,
				status: "waiting",
				thread: [
					{ id: "reply-1", author: "agent", body: "Which audience?", at: "t1" },
					{ id: "reply-2", author: "user", body: "Developers", at: "t2" },
				],
			}],
			proposals: [],
			onReplyToRequest: mock(() => {}),
		};
		render(
			<PanelQueue
				session={waitingSession}
				queue={buildRequestQueue({ requests: waitingSession.requests, proposals: [], applying: false })}
				applying={false}
				agentStatus="connected"
				onApply={() => {}}
				labelForTarget={() => "Paragraph"}
			/>,
		);

		const toggle = document.querySelector<HTMLButtonElement>('[data-docs-lab-thread-toggle="R1"]')!;
		expect(toggle.textContent).toBe("▾ 2 replies");
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		expect(screen.getByText("Which audience?")).toBeTruthy();
		expect(document.querySelector('[data-docs-lab-msg="agent"]')?.textContent).toContain("agentWhich audience?");
		expect(document.querySelectorAll('[data-docs-lab-msg="user"]')).toHaveLength(2);
		expect(screen.queryByText("waiting on you")).toBeNull();
		expect(document.querySelector('[data-docs-lab-card-state="R1"]')?.textContent).toBe("");
		expect(screen.getByRole("textbox", { name: "Reply to unblock R1" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Rail reply to R1" })).toBeTruthy();

		fireEvent.click(toggle);
		expect(toggle.textContent).toBe("▸ 2 replies");
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByText("Which audience?")).toBeNull();
	});

	it("expands a collapsed thread when its request transitions to waiting", () => {
		const openSession: DocEditSession = {
			...session,
			requests: [{
				...session.requests[0]!,
				thread: [{ id: "reply-1", author: "user", body: "Initial context", at: "t1" }],
			}],
		};
		const { rerender } = render(
			<PanelQueue
				session={openSession}
				queue={buildRequestQueue({ requests: openSession.requests, proposals: [], applying: false })}
				applying={false}
				agentStatus="connected"
				onApply={() => {}}
				labelForTarget={() => "Paragraph"}
			/>,
		);

		const toggle = document.querySelector<HTMLButtonElement>('[data-docs-lab-thread-toggle="R1"]')!;
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		const waitingSession: DocEditSession = {
			...openSession,
			requests: [{
				...openSession.requests[0]!,
				status: "waiting",
				thread: [...openSession.requests[0]!.thread, { id: "reply-2", author: "agent", body: "Which audience?", at: "t2" }],
			}],
		};
		rerender(
			<PanelQueue
				session={waitingSession}
				queue={buildRequestQueue({ requests: waitingSession.requests, proposals: [], applying: false })}
				applying={false}
				agentStatus="connected"
				onApply={() => {}}
				labelForTarget={() => "Paragraph"}
			/>,
		);

		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		expect(screen.getByText("Which audience?")).toBeTruthy();
	});

	it("gives an external Apply disabled reason precedence over an applicable queue", () => {
		render(
			<PanelQueue
				session={session}
				queue={buildRequestQueue({ requests: session.requests, proposals: [], applying: false })}
				applying={false}
				agentStatus="offline"
				applyDisabledReason="docs agent not connected"
				onApply={() => {}}
				labelForTarget={() => "Paragraph"}
			/>,
		);

		const apply = screen.getByRole("button", { name: "Apply queue" }) as HTMLButtonElement;
		expect(apply.disabled).toBe(true);
		expect(apply.getAttribute("title")).toBe("docs agent not connected");
		expect(apply.textContent).toBe("Run queue (1)");
	});

	it("preserves the queue model behavior when no external reason is present", () => {
		render(
			<PanelQueue
				session={session}
				queue={buildRequestQueue({ requests: session.requests, proposals: [], applying: false })}
				applying={false}
				agentStatus="connected"
				applyDisabledReason={null}
				onApply={() => {}}
				labelForTarget={() => "Paragraph"}
			/>,
		);

		const apply = screen.getByRole("button", { name: "Apply queue" }) as HTMLButtonElement;
		expect(apply.disabled).toBe(false);
		expect(apply.getAttribute("title")).toBe("Run the queued notes");
		expect(apply.textContent).toBe("Run queue (1)");
		expect(document.querySelector('[data-docs-lab-agent-status="connected"]')?.textContent).toContain("connected");
	});

	it("renders a disabled running state while applying", () => {
		render(
			<PanelQueue
				session={session}
				queue={buildRequestQueue({ requests: session.requests, proposals: [], applying: true })}
				applying
				agentStatus="running"
				onApply={() => {}}
				labelForTarget={() => "Paragraph"}
			/>,
		);

		const apply = screen.getByRole("button", { name: "Apply queue" }) as HTMLButtonElement;
		expect(apply.disabled).toBe(true);
		expect(apply.textContent).toBe("running…");
		expect(apply.getAttribute("title")).toBe("The queue is running");
		expect(document.querySelector('[data-docs-lab-agent-status="running"]')?.textContent).toContain("session running");
	});

	it("renders a session failure in the queue transcript", () => {
		render(
			<PanelQueue
				session={session}
				queue={buildRequestQueue({ requests: session.requests, proposals: [], applying: false })}
				applying={false}
				agentStatus="offline"
				sessionError="The docs agent is running against a different docs root — it doesn't know this document."
				onApply={() => {}}
				labelForTarget={() => "Paragraph"}
			/>,
		);

		const error = document.querySelector('[data-docs-lab-session-error]');
		expect(error?.getAttribute("role")).toBe("alert");
		expect(error?.textContent).toContain("different docs root");
		expect(document.querySelector('[data-docs-lab-agent-status="offline"]')?.getAttribute("title")).toBe("Docs agent not connected");
	});

	it("renders labels from mixed-document targets without inspecting them", () => {
		const mixedSession: DocEditSession = {
			requests: [
				{
					...session.requests[0]!,
					id: "request-cross-doc",
					alias: "R1",
					target: { kind: "block", blockId: "block-1", docPath: "docs/10-architecture/20-north-star" },
				},
				{
					...session.requests[0]!,
					id: "request-same-doc",
					alias: "R2",
					target: { kind: "block", blockId: "block-2", docPath: "docs/10-architecture/10-overview" },
				},
			],
			proposals: [],
		};

		render(
			<PanelQueue
				session={mixedSession}
				queue={buildRequestQueue({ requests: mixedSession.requests, proposals: [], applying: false })}
				applying={false}
				agentStatus="connected"
				onApply={() => {}}
				labelForTarget={(target) => target.docPath?.endsWith("20-north-star") ? "north star → block" : "Overview"}
			/>,
		);

		expect(document.querySelector('[data-docs-lab-card-target="R1"]')?.textContent).toBe("north star → block");
		expect(document.querySelector('[data-docs-lab-card-target="R2"]')?.textContent).toBe("Overview");
	});
});

describe("GlassPanel", () => {
	it("exposes stable workbench mode hooks on both tabs", () => {
		const onTabSelect = mock(() => {});
		const { container } = render(
			<div>
				<GlassPanel tab="edit" onTabSelect={onTabSelect}>Outline</GlassPanel>
			</div>,
		);

		const edit = container.querySelector<HTMLButtonElement>('[data-docs-mode="edit"]');
		const ai = container.querySelector<HTMLButtonElement>('[data-docs-mode="ai"]');
		expect(edit).toBeTruthy();
		expect(ai).toBeTruthy();

		fireEvent.click(ai!);
		expect(onTabSelect).toHaveBeenCalledWith("ai");
	});
});
