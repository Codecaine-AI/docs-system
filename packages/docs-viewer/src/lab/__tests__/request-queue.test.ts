import { describe, expect, test } from "bun:test";

import {
	buildRequestQueue,
	pipelineSummary,
	queuePositionLabel,
	requestDisposition,
	requestBlockId,
} from "../session/request-queue";
import type {
	DocEditProposal,
	DocEditRequest,
	DocEditRequestStatus,
	DocRequestDisposition,
} from "../session/doc-edit-session";

function request(
	alias: string,
	status: DocEditRequestStatus,
	overrides: Partial<DocEditRequest> = {},
): DocEditRequest {
	return {
		id: `request-${alias}`,
		alias,
		status,
		body: `Request ${alias}`,
		disposition: "batch",
		target: { kind: "block", blockId: `block-${alias}` },
		thread: [],
		...overrides,
	};
}

function filed(
	alias: string,
	disposition: DocRequestDisposition,
	status: DocEditRequestStatus = "open",
): DocEditRequest {
	return request(alias, status, {
		disposition,
		annotationId: `ann-${alias}`,
		...(disposition === "global" ? { target: { kind: "doc" } } : {}),
	});
}

function proposal(alias: string): DocEditProposal {
	return {
		alias,
		transactionId: `txn-${alias}`,
		changedBlockIds: [`block-${alias}`],
		summary: `Change for ${alias}`,
		ops: [],
		baseHash: "base-hash",
	};
}

describe("requestDisposition", () => {
	test("uses the filed disposition", () => {
		expect(requestDisposition(filed("R2", "batch"))).toBe("batch");
		expect(requestDisposition(filed("R3", "global"))).toBe("global");
	});

	test("legacy target-only requests infer their document disposition", () => {
		expect(requestDisposition(request("R9", "open", { disposition: undefined }))).toBe("batch");
		expect(
		requestDisposition(request("R9", "open", {
			disposition: undefined,
			target: { kind: "doc" },
		})),
	).toBe("global");
	});
});

describe("buildRequestQueue populations", () => {
	test("every open request is a queue card", () => {
		const model = buildRequestQueue({
			requests: [filed("R1", "batch", "working"), filed("R2", "batch"), filed("R3", "global")],
			proposals: [],
			applying: false,
		});
		expect(model.queue.map((entry) => entry.request.alias)).toEqual(["R1", "R2", "R3"]);
		expect(model.records).toEqual([]);
	});

	test("accepted requests reappear as resolved records", () => {
		const model = buildRequestQueue({
			requests: [filed("R1", "batch", "applied")],
			proposals: [],
			applying: false,
		});
		expect(model.queue).toEqual([]);
		expect(model.records[0]).toMatchObject({ ok: true, stateLabel: "resolved", targetLabel: "block-R1" });
	});

	test("declined and document-level closed requests file distinct records", () => {
		const model = buildRequestQueue({
			requests: [filed("R1", "batch", "declined"), filed("R2", "global", "resolved")],
			proposals: [],
			applying: false,
		});
		expect(model.records.map((record) => record.stateLabel)).toEqual(["discarded", "resolved"]);
		expect(model.records[0]!.ok).toBe(false);
		expect(model.records[1]!.targetLabel).toBe("document");
	});

	test("failed requests close as failed records", () => {
		const model = buildRequestQueue({
			requests: [filed("R1", "batch", "failed")],
			proposals: [],
			applying: false,
		});
		expect(model.queue).toEqual([]);
		expect(model.records[0]).toMatchObject({ ok: false, stateLabel: "failed" });
	});
});

describe("buildRequestQueue narration", () => {
	const queued = [filed("R1", "batch"), filed("R2", "batch"), filed("R3", "global")];

	test("before Apply, requests have positions but none is processing", () => {
		const model = buildRequestQueue({ requests: queued, proposals: [], applying: false });
		expect(model.activeAlias).toBeNull();
		expect(model.queue.map((entry) => entry.stateLabel)).toEqual(["queued · next", "queued · #2", "queued · #3"]);
		expect(model.pipeline).toBe("3 queued");
		expect(model.canApply).toBe(true);
	});

	test("Apply advances as each proposal stages", () => {
		const first = buildRequestQueue({ requests: queued, proposals: [], applying: true });
		expect(first.activeAlias).toBe("R1");
		expect(first.queue.map((entry) => entry.stateLabel)).toEqual(["processing", "queued · next", "queued · #2"]);
		expect(first.pipeline).toBe("processing R1 · 2 queued");
		expect(first.canApply).toBe(false);

		const second = buildRequestQueue({ requests: queued, proposals: [proposal("R1")], applying: true });
		expect(second.activeAlias).toBe("R2");
		expect(second.queue.map((entry) => entry.stateLabel)).toEqual(["staged", "processing", "queued · next"]);
		expect(second.pipeline).toBe("processing R2 · 1 queued · 1 staged");

		const done = buildRequestQueue({
			requests: queued,
			proposals: [proposal("R1"), proposal("R2"), proposal("R3")],
			applying: true,
		});
		expect(done.activeAlias).toBeNull();
		expect(done.pipeline).toBe("3 staged");
	});

	test("empty queues idle and conflicted aliases mark only their card", () => {
		const idle = buildRequestQueue({ requests: [filed("R1", "batch", "resolved")], proposals: [], applying: false });
		expect(idle.pipeline).toBe("queue idle");
		expect(idle.canApply).toBe(false);

		const conflicted = buildRequestQueue({
			requests: queued,
			proposals: [],
			applying: false,
			conflictedAliases: new Set(["R2"]),
		});
		expect(conflicted.queue.map((entry) => entry.conflict)).toEqual([false, true, false]);
	});
});

describe("small vocabulary", () => {
	test("queuePositionLabel and pipelineSummary", () => {
		expect(queuePositionLabel(0)).toBe("queued · next");
		expect(queuePositionLabel(1)).toBe("queued · #2");
		expect(queuePositionLabel(-1)).toBe("queued");
		expect(pipelineSummary({ activeAlias: null, queued: 0, staged: 0 })).toBe("queue idle");
		expect(pipelineSummary({ activeAlias: "R4", queued: 0, staged: 2 })).toBe("processing R4 · 2 staged");
	});

	test("requestBlockId ignores document-level targets", () => {
		expect(requestBlockId(request("R1", "open"))).toBe("block-R1");
		expect(requestBlockId({ target: { kind: "doc" } })).toBeNull();
	});
});
