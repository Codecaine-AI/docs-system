import { describe, expect, it } from "bun:test";

import { ApiError } from "../../data/api";
import { changesetFailureMessage } from "../doc-lab-changeset-messages";

describe("changesetFailureMessage", () => {
	it("maps stale, lock, non-open, rollback, and expired undo failures", () => {
		expect(changesetFailureMessage(new ApiError("stale-proposal", 409), "accept"))
			.toBe("One document changed since staging — refresh to restage.");
		expect(changesetFailureMessage(
			new ApiError("stale-proposal", 409, { rolled_back: true }),
			"accept",
		)).toBe("One document changed since staging — refresh to restage. No documents were changed.");
		expect(changesetFailureMessage(new ApiError("draft-lock", 423), "accept"))
			.toBe("A document is locked by another editing session — wait for it to finish, then try again.");
		expect(changesetFailureMessage(new ApiError("Change-set is already applied.", 409), "accept"))
			.toBe("This change-set is no longer open — refresh to see its current status.");
		expect(changesetFailureMessage(new ApiError("missing patch", 404), "undo"))
			.toBe("This change-set can no longer be undone — refresh to update its status.");
	});

	it("uses action-specific safe fallbacks instead of raw transport details", () => {
		expect(changesetFailureMessage(new Error("socket exploded"), "accept"))
			.toBe("The change-set could not be accepted — try again.");
		expect(changesetFailureMessage(new ApiError("internal-token", 500), "undo"))
			.toBe("The change-set could not be undone — refresh, then try again.");
	});
});
