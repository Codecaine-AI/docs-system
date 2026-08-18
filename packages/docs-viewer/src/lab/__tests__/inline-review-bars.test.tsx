import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
	ProposalActionBar,
	type ProposalActionBarProps,
} from "../annotate/InlineReviewBars";

afterEach(cleanup);

function renderBar(overrides: Partial<ProposalActionBarProps> = {}) {
	const props: ProposalActionBarProps = {
		alias: "R2",
		summary: "Clarify the setup instructions",
		acceptDisabledReason: null,
		rejectDisabledReason: null,
		onAccept: () => {},
		onReject: () => {},
		...overrides,
	};
	return render(<ProposalActionBar {...props} />);
}

describe("ProposalActionBar reject modes", () => {
	it("rejects directly when feedback is unavailable", () => {
		const onReject = mock(() => {});
		renderBar({ onReject });

		fireEvent.click(screen.getByRole("button", { name: "Reject R2" }));

		expect(onReject).toHaveBeenCalledTimes(1);
		expect(document.querySelector('[data-docs-lab-reject-strip="R2"]')).toBeNull();
	});

	it("expands feedback choices without rejecting immediately", () => {
		const onReject = mock(() => {});
		renderBar({ onReject, onRejectWithFeedback: () => {} });

		fireEvent.click(screen.getByRole("button", { name: "Reject R2" }));

		expect(onReject).not.toHaveBeenCalled();
		expect(document.querySelector('[data-docs-lab-reject-strip="R2"]')).toBeTruthy();
	});

	it("discards the proposal outright from the feedback strip", () => {
		const onReject = mock(() => {});
		renderBar({ onReject, onRejectWithFeedback: () => {} });
		fireEvent.click(screen.getByRole("button", { name: "Reject R2" }));

		fireEvent.click(screen.getByRole("button", { name: "Discard" }));

		expect(onReject).toHaveBeenCalledTimes(1);
	});

	it("requires a note and sends trimmed revision feedback", () => {
		const onRejectWithFeedback = mock((_note: string) => {});
		renderBar({ onRejectWithFeedback });
		fireEvent.click(screen.getByRole("button", { name: "Reject R2" }));
		const requestChanges = screen.getByRole("button", { name: "Request changes" }) as HTMLButtonElement;

		expect(requestChanges.disabled).toBe(true);
		fireEvent.change(screen.getByRole("textbox", { name: "Feedback for R2" }), {
			target: { value: "  Add a concrete example  " },
		});
		fireEvent.click(requestChanges);

		expect(requestChanges.disabled).toBe(false);
		expect(onRejectWithFeedback).toHaveBeenCalledWith("Add a concrete example");
	});

	it("collapses feedback on Escape", () => {
		renderBar({ onRejectWithFeedback: () => {} });
		fireEvent.click(screen.getByRole("button", { name: "Reject R2" }));

		fireEvent.keyDown(screen.getByRole("textbox", { name: "Feedback for R2" }), {
			key: "Escape",
		});

		expect(document.querySelector('[data-docs-lab-reject-strip="R2"]')).toBeNull();
	});
});
