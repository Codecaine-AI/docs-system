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
	it("gives an external Apply disabled reason precedence over an applicable queue", () => {
		render(
			<PanelQueue
				session={session}
				queue={buildRequestQueue({ requests: session.requests, proposals: [], applying: false })}
				applying={false}
				applyDisabledReason="docs agent not connected"
				onApply={() => {}}
				labelForTarget={() => "Paragraph"}
			/>,
		);

		const apply = screen.getByRole("button", { name: "Apply queue" }) as HTMLButtonElement;
		expect(apply.disabled).toBe(true);
		expect(apply.getAttribute("title")).toBe("docs agent not connected");
	});

	it("preserves the queue model behavior when no external reason is present", () => {
		render(
			<PanelQueue
				session={session}
				queue={buildRequestQueue({ requests: session.requests, proposals: [], applying: false })}
				applying={false}
				applyDisabledReason={null}
				onApply={() => {}}
				labelForTarget={() => "Paragraph"}
			/>,
		);

		const apply = screen.getByRole("button", { name: "Apply queue" }) as HTMLButtonElement;
		expect(apply.disabled).toBe(false);
		expect(apply.getAttribute("title")).toBe("Run the queued notes");
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
