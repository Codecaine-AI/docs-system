import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	getBundleProposals,
	getBundleAnnotations,
} from "@codecaine-ai/docs-server";

import { createDocsEditSessionService } from "./service";
import {
	FIXTURE_PATH,
	fixtureAnnotation,
	fixtureAnnotations,
	readDiskDoc,
	updateTextOp,
	writeBundle,
} from "./test-fixtures";
import { toolProposeOps } from "./tools";

const tempRoots: string[] = [];

async function makeDocsRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "docs-kernel-review-"));
	tempRoots.push(root);
	return root;
}

afterEach(async () => {
	await Promise.all(
		tempRoots.splice(0).map((root) =>
			rm(root, { recursive: true, force: true }),
		),
	);
});

describe("docs-edit proposal/review integration", () => {
	test("propose_ops rejects malformed ops and persists valid proposal metadata without mutating the doc", async () => {
		const docsRoot = await makeDocsRoot();
		await writeBundle(docsRoot, FIXTURE_PATH, {
			annotations: fixtureAnnotations([
				fixtureAnnotation({ id: "ann-propose" }),
			]),
		});
		const before = await readDiskDoc(docsRoot);
		const service = createDocsEditSessionService({ docsRoot });
		const created = await service.createSession({
			path: FIXTURE_PATH,
			requestIds: ["ann-propose"],
			sessionId: "proposal-session",
			spawn: false,
		});
		expect(created.ok).toBe(true);
		if (!created.ok) throw new Error(`session create failed: ${created.reason}`);
		const session = service.getSession(created.state.sessionId);
		if (!session) throw new Error("created session was not retained");

		const invalid = await toolProposeOps(session, {
			requestAlias: "R1",
			ops: [{ type: "updateBlock", blockId: "p1", text: 42 }],
			summary: "Malformed nested text payload",
		});
		expect(invalid.isError).toBe(true);
		expect(invalid.text).toContain("malformed ops");
		const supportedTypes =
			"Supported op types: insertBlock, updateBlock, deleteBlock, moveBlock, splitBlock, mergeBlocks, componentAction.";
		const unsupported = await toolProposeOps(session, {
			requestAlias: "R1",
			ops: [{ type: "replace_block", blockId: "p1" }],
			summary: "Unsupported operation type",
		});
		expect(unsupported.isError).toBe(true);
		expect(unsupported.text).toContain(supportedTypes);
		const nonObject = await toolProposeOps(session, {
			requestAlias: "R1",
			ops: ["updateBlock"],
			summary: "Non-object operation",
		});
		expect(nonObject.isError).toBe(true);
		expect(nonObject.text).toContain(supportedTypes);
		expect(session.proposals()).toHaveLength(0);
		const afterInvalid = await getBundleProposals(docsRoot, FIXTURE_PATH);
		expect(afterInvalid.ok).toBe(true);
		if (!afterInvalid.ok) throw new Error(afterInvalid.detail);
		expect(afterInvalid.proposals).toHaveLength(0);

		const valid = await toolProposeOps(session, {
			requestAlias: "R1",
			ops: [updateTextOp("p1", "A clearer first paragraph.")],
			summary: "Clarify the first paragraph",
		});
		expect(valid.isError).not.toBe(true);
		expect(valid.text).toContain("STAGED");
		expect(session.proposals()).toHaveLength(1);

		const listed = await getBundleProposals(docsRoot, FIXTURE_PATH);
		expect(listed.ok).toBe(true);
		if (!listed.ok) throw new Error(listed.detail);
		expect(listed.proposals).toHaveLength(1);
		expect(listed.proposals[0]).toMatchObject({
			annotationId: "ann-propose",
			alias: "R1",
			sessionId: "proposal-session",
			status: "staged",
			summary: "Clarify the first paragraph",
			changedBlockIds: ["p1"],
		});
		expect(await readDiskDoc(docsRoot)).toEqual(before);
	});

	test("reviews in stage order, restages stale accepts, resolves annotations, and enforces reversible latest-only undo", async () => {
		const docsRoot = await makeDocsRoot();
		await writeBundle(docsRoot, FIXTURE_PATH, {
			annotations: fixtureAnnotations([
				fixtureAnnotation({ id: "ann-first", target: { kind: "block", blockId: "p1" } }),
				fixtureAnnotation({ id: "ann-second", target: { kind: "block", blockId: "p2" } }),
			]),
		});
		const original = await readDiskDoc(docsRoot);
		const service = createDocsEditSessionService({ docsRoot });
		const created = await service.createSession({
			path: FIXTURE_PATH,
			requestIds: ["ann-first", "ann-second"],
			sessionId: "review-session",
			spawn: false,
		});
		expect(created.ok).toBe(true);
		if (!created.ok) throw new Error(`session create failed: ${created.reason}`);
		const sessionId = created.state.sessionId;
		const session = service.getSession(sessionId);
		if (!session) throw new Error("created session was not retained");

		const stagedFirst = await toolProposeOps(session, {
			requestAlias: "R1",
			ops: [updateTextOp("p1", "First paragraph, revised.")],
			summary: "Revise the first paragraph",
		});
		const stagedSecond = await toolProposeOps(session, {
			requestAlias: "R2",
			ops: [updateTextOp("p2", "Second paragraph, revised.")],
			summary: "Revise the second paragraph",
		});
		expect(stagedFirst.isError).not.toBe(true);
		expect(stagedSecond.isError).not.toBe(true);
		const originalSecondProposalId = session.proposals()[1]?.proposalId;
		expect(originalSecondProposalId).toBeString();
		expect(service.getState(sessionId)?.nextAcceptAlias).toBe("R1");

		const outOfOrder = await service.acceptProposal(sessionId, "R2");
		expect(outOfOrder).toEqual({
			ok: false,
			failure: { kind: "out_of_order", alias: "R2", nextAlias: "R1" },
		});

		const acceptedFirst = await service.acceptProposal(sessionId, "R1");
		expect(acceptedFirst?.ok).toBe(true);
		if (!acceptedFirst?.ok) throw new Error("R1 accept failed");
		expect(acceptedFirst.annotation).toEqual({
			annotationId: "ann-first",
			attached: true,
			resolved: true,
		});
		let disk = await readDiskDoc(docsRoot);
		expect(disk.blocks.p1?.text).toEqual([{ insert: "First paragraph, revised." }]);
		expect(disk.blocks.p2?.text).toEqual(original.blocks.p2?.text);

		const annotationsAfterFirst = await getBundleAnnotations(docsRoot, FIXTURE_PATH);
		expect(annotationsAfterFirst.ok).toBe(true);
		if (!annotationsAfterFirst.ok) throw new Error(annotationsAfterFirst.detail);
		const firstAnnotation = annotationsAfterFirst.annotations.annotations.find(
			(annotation) => annotation.id === "ann-first",
		);
		expect(firstAnnotation).toMatchObject({
			status: "resolved",
			resolution: "Revise the first paragraph",
			agentRun: {
				sessionId,
				patchId: acceptedFirst.patchId,
				summary: "Revise the first paragraph",
				changedIds: ["p1"],
			},
		});

		const acceptedSecond = await service.acceptProposal(sessionId, "R2");
		expect(acceptedSecond?.ok).toBe(true);
		if (!acceptedSecond?.ok) throw new Error("R2 stale-restage accept failed");
		expect(acceptedSecond.proposalId).not.toBe(originalSecondProposalId);
		const secondState = service.getState(sessionId)?.proposals.find(
			(proposal) => proposal.requestAlias === "R2",
		);
		expect(secondState).toMatchObject({
			proposalId: acceptedSecond.proposalId,
			review: "applied",
			patchId: acceptedSecond.patchId,
		});
		expect(secondState?.supersededProposalIds).toContain(originalSecondProposalId!);
		disk = await readDiskDoc(docsRoot);
		expect(disk.blocks.p1?.text).toEqual([{ insert: "First paragraph, revised." }]);
		expect(disk.blocks.p2?.text).toEqual([{ insert: "Second paragraph, revised." }]);

		const notLatest = await service.undoAccepted(sessionId, "R1");
		expect(notLatest).toEqual({
			ok: false,
			failure: {
				kind: "not_latest_applied",
				alias: "R1",
				lastAppliedAlias: "R2",
			},
		});

		const undoneSecond = await service.undoAccepted(sessionId, "R2");
		expect(undoneSecond?.ok).toBe(true);
		disk = await readDiskDoc(docsRoot);
		expect(disk.blocks.p1?.text).toEqual([{ insert: "First paragraph, revised." }]);
		expect(disk.blocks.p2?.text).toEqual(original.blocks.p2?.text);
		expect(service.getState(sessionId)).toMatchObject({
			nextAcceptAlias: "R2",
			undoableAlias: "R1",
			requests: [
				{ alias: "R1", status: "applied", review: "applied" },
				{ alias: "R2", status: "ready", review: "undone" },
			],
		});

		const reacceptedSecond = await service.acceptProposal(sessionId, "R2");
		expect(reacceptedSecond?.ok).toBe(true);
		if (!reacceptedSecond?.ok) throw new Error("R2 reaccept after undo failed");
		expect(reacceptedSecond.proposalId).not.toBe(acceptedSecond.proposalId);
		disk = await readDiskDoc(docsRoot);
		expect(disk.blocks.p2?.text).toEqual([{ insert: "Second paragraph, revised." }]);

		expect((await service.undoAccepted(sessionId, "R2"))?.ok).toBe(true);
		expect((await service.undoAccepted(sessionId, "R1"))?.ok).toBe(true);
		expect(await readDiskDoc(docsRoot)).toEqual(original);
	});
});
