import { describe, expect, test } from "bun:test";

import {
	acceptDisabledReason,
	rejectDisabledReason,
	undoDisabledReason,
	type DocEditProposal,
	type DocEditSession,
} from "../session/doc-edit-session";

function proposal(alias: string): DocEditProposal {
	return {
		alias,
		transactionId: `txn-${alias}`,
		summary: `Change for ${alias}`,
		ops: [],
		changedBlockIds: [`block-${alias}`],
		baseHash: "base-hash",
	};
}

describe("doc-edit-session ordering discipline", () => {
	test("only the head of staging order can accept", () => {
		const proposals = [proposal("R1"), proposal("R2")];
		expect(acceptDisabledReason(proposals, "R1")).toBeNull();
		expect(acceptDisabledReason(proposals, "R2")).toContain("R1");
	});

	test("only the tail of staging order can reject", () => {
		const proposals = [proposal("R1"), proposal("R2")];
		expect(rejectDisabledReason(proposals, "R2")).toBeNull();
		expect(rejectDisabledReason(proposals, "R1")).toContain("R2");
	});

	test("only the latest applied request can undo", () => {
		const session: Pick<DocEditSession, "undoableAlias"> = { undoableAlias: "R1" };
		expect(undoDisabledReason(session, "R1")).toBeNull();
		expect(undoDisabledReason(session, "R2")).toContain("R1");
		expect(undoDisabledReason({}, "R2")).toBe("Nothing to undo.");
	});
});
