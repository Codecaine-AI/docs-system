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
import { createDocsEditToolset } from "./tools";

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
	test("edit tools reject malformed calls and persist valid edit metadata without mutating the doc", async () => {
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

		const tools = createDocsEditToolset(session);
		const invalid = await tools.call("write_text", {
			requestAlias: "R1",
			blockId: "p1",
			markdown: 42,
		});
		expect(invalid.isError).toBe(true);
		expect(invalid.text).toContain("markdown must be a string");
		const unknown = await tools.call("replace_block", {
			requestAlias: "R1",
			blockId: "p1",
		});
		expect(unknown.isError).toBe(true);
		expect(unknown.text).toContain("unknown docs-edit tool");
		const badAlias = await tools.call("write_text", {
			requestAlias: "R99",
			blockId: "p1",
			markdown: "text",
		});
		expect(badAlias.isError).toBe(true);
		expect(badAlias.text).toContain('No request "R99"');
		const invalidBlockType = await tools.call("insert_block", {
			requestAlias: "R1",
			type: "bogus-block-type",
			parentId: "root",
			index: 0,
		});
		expect(invalidBlockType.isError).toBe(true);
		expect(invalidBlockType.text).toContain("process-outline");
		expect(session.proposals()).toHaveLength(0);
		const afterInvalid = await getBundleProposals(docsRoot, FIXTURE_PATH);
		expect(afterInvalid.ok).toBe(true);
		if (!afterInvalid.ok) throw new Error(afterInvalid.detail);
		expect(afterInvalid.proposals).toHaveLength(0);

		const valid = await tools.call("write_text", {
			requestAlias: "R1",
			blockId: "p1",
			markdown: "A clearer first paragraph.",
			summary: "Clarify the first paragraph",
		});
		expect(valid.isError).not.toBe(true);
		expect(valid.text).toContain("EDITED");
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

	test("restaging the same request supersedes every proposal in the replaced set", async () => {
		const docsRoot = await makeDocsRoot();
		await writeBundle(docsRoot, FIXTURE_PATH, {
			annotations: fixtureAnnotations([
				fixtureAnnotation({ id: "ann-restage" }),
			]),
		});
		const service = createDocsEditSessionService({ docsRoot });
		const created = await service.createSession({
			path: FIXTURE_PATH,
			requestIds: ["ann-restage"],
			sessionId: "restage-session",
			spawn: false,
		});
		expect(created.ok).toBe(true);
		if (!created.ok) throw new Error(`session create failed: ${created.reason}`);
		const session = service.getSession(created.state.sessionId);
		if (!session) throw new Error("created session was not retained");

		const first = await session.propose(
			"R1",
			[
				updateTextOp("p2", "First revision of the last section."),
				updateTextOp("h1", "First revision of the first section."),
			],
			"Stage the first revision set",
		);
		expect(first.ok).toBe(true);
		const firstProposalIds = session
			.proposals()
			.map((proposal) => proposal.proposalId);
		expect(firstProposalIds).toHaveLength(2);

		const second = await session.propose(
			"R1",
			[updateTextOp("p1", "Second staged revision.")],
			"Stage the second revision",
		);
		expect(second.ok).toBe(true);
		const active = session.proposals();
		expect(active).toHaveLength(1);
		expect(firstProposalIds).not.toContain(active[0]?.proposalId);

		const listed = await getBundleProposals(docsRoot, FIXTURE_PATH);
		expect(listed.ok).toBe(true);
		if (!listed.ok) throw new Error(listed.detail);
		expect(listed.proposals.filter((proposal) => proposal.status === "staged"))
			.toEqual([
				expect.objectContaining({
					id: active[0]?.proposalId,
					summary: "Stage the second revision",
				}),
			]);
		expect(
			firstProposalIds.map(
				(proposalId) =>
					listed.proposals.find((proposal) => proposal.id === proposalId)?.status,
			),
		).toEqual(["rejected", "rejected"]);
	});

	test("split section proposals accept independently and stale-restage the remaining section", async () => {
		const docsRoot = await makeDocsRoot();
		await writeBundle(docsRoot, FIXTURE_PATH, {
			annotations: fixtureAnnotations([
				fixtureAnnotation({ id: "ann-split" }),
			]),
		});
		const original = await readDiskDoc(docsRoot);
		const service = createDocsEditSessionService({ docsRoot });
		const created = await service.createSession({
			path: FIXTURE_PATH,
			requestIds: ["ann-split"],
			sessionId: "split-review-session",
			spawn: false,
		});
		expect(created.ok).toBe(true);
		if (!created.ok) throw new Error(`session create failed: ${created.reason}`);
		const sessionId = created.state.sessionId;
		const session = service.getSession(sessionId);
		if (!session) throw new Error("created session was not retained");

		const staged = await session.propose(
			"R1",
			[
				updateTextOp("p2", "Last section, revised."),
				updateTextOp("h1", "First section, revised."),
			],
			"Revise two separated sections",
		);
		expect(staged.ok).toBe(true);
		const proposals = session.proposals();
		expect(proposals.map((proposal) => proposal.changedBlockIds)).toEqual([
			["h1"],
			["p2"],
		]);
		const [firstProposal, secondProposal] = proposals;
		if (!firstProposal || !secondProposal) {
			throw new Error("expected two section proposals");
		}

		let ledger = await getBundleProposals(docsRoot, FIXTURE_PATH);
		expect(ledger.ok).toBe(true);
		if (!ledger.ok) throw new Error(ledger.detail);
		expect(
			ledger.proposals
				.filter((proposal) => proposal.status === "staged")
				.map((proposal) => ({
					id: proposal.id,
					changedBlockIds: proposal.changedBlockIds,
				})),
		).toEqual([
			{ id: firstProposal.proposalId, changedBlockIds: ["h1"] },
			{ id: secondProposal.proposalId, changedBlockIds: ["p2"] },
		]);

		const acceptedFirst = await service.acceptProposal(
			sessionId,
			"R1",
			firstProposal.proposalId,
		);
		expect(acceptedFirst?.ok).toBe(true);
		let disk = await readDiskDoc(docsRoot);
		expect(disk.blocks.h1?.text).toEqual([{ insert: "First section, revised." }]);
		expect(disk.blocks.p2?.text).toEqual(original.blocks.p2?.text);
		expect(service.getState(sessionId)?.requests[0]).toMatchObject({
			alias: "R1",
			status: "ready",
		});
		ledger = await getBundleProposals(docsRoot, FIXTURE_PATH);
		expect(ledger.ok).toBe(true);
		if (!ledger.ok) throw new Error(ledger.detail);
		expect(
			ledger.proposals.find(
				(proposal) => proposal.id === secondProposal.proposalId,
			),
		).toMatchObject({ status: "staged" });

		const acceptedSecond = await service.acceptProposal(
			sessionId,
			"R1",
			secondProposal.proposalId,
		);
		expect(acceptedSecond?.ok).toBe(true);
		if (!acceptedSecond?.ok) throw new Error("second section accept failed");
		expect(acceptedSecond.proposalId).not.toBe(secondProposal.proposalId);
		disk = await readDiskDoc(docsRoot);
		expect(disk.blocks.h1?.text).toEqual([{ insert: "First section, revised." }]);
		expect(disk.blocks.p2?.text).toEqual([{ insert: "Last section, revised." }]);
		expect(service.getState(sessionId)?.requests[0]).toMatchObject({
			alias: "R1",
			status: "applied",
		});
	});

	test("rejecting one section and accepting another leaves a mixed request applied", async () => {
		const docsRoot = await makeDocsRoot();
		await writeBundle(docsRoot, FIXTURE_PATH, {
			annotations: fixtureAnnotations([
				fixtureAnnotation({ id: "ann-mixed" }),
			]),
		});
		const original = await readDiskDoc(docsRoot);
		const service = createDocsEditSessionService({ docsRoot });
		const created = await service.createSession({
			path: FIXTURE_PATH,
			requestIds: ["ann-mixed"],
			sessionId: "mixed-review-session",
			spawn: false,
		});
		expect(created.ok).toBe(true);
		if (!created.ok) throw new Error(`session create failed: ${created.reason}`);
		const sessionId = created.state.sessionId;
		const session = service.getSession(sessionId);
		if (!session) throw new Error("created session was not retained");

		const staged = await session.propose(
			"R1",
			[
				updateTextOp("h1", "Rejected first section."),
				updateTextOp("p2", "Accepted last section."),
			],
			"Review two separated sections",
		);
		expect(staged.ok).toBe(true);
		const [rejectedProposal, acceptedProposal] = session.proposals();
		if (!rejectedProposal || !acceptedProposal) {
			throw new Error("expected two section proposals");
		}

		const rejected = await service.rejectProposal(
			sessionId,
			"R1",
			"Keep the first section unchanged.",
			rejectedProposal.proposalId,
		);
		expect(rejected?.ok).toBe(true);
		expect(service.getState(sessionId)?.requests[0]?.status).toBe("ready");

		const accepted = await service.acceptProposal(
			sessionId,
			"R1",
			acceptedProposal.proposalId,
		);
		expect(accepted?.ok).toBe(true);
		expect(service.getState(sessionId)?.requests[0]?.status).toBe("applied");
		const disk = await readDiskDoc(docsRoot);
		expect(disk.blocks.h1?.text).toEqual(original.blocks.h1?.text);
		expect(disk.blocks.p2?.text).toEqual([{ insert: "Accepted last section." }]);

		const ledger = await getBundleProposals(docsRoot, FIXTURE_PATH);
		expect(ledger.ok).toBe(true);
		if (!ledger.ok) throw new Error(ledger.detail);
		expect(
			ledger.proposals.find(
				(proposal) => proposal.id === rejectedProposal.proposalId,
			),
		).toMatchObject({ status: "rejected" });
		expect(
			ledger.proposals.find(
				(proposal) => proposal.id === acceptedProposal.proposalId,
			),
		).toMatchObject({ status: "accepted" });
	});

	test("rejectProposal resolves the driving sidecar annotation with explicit and default notes", async () => {
		const docsRoot = await makeDocsRoot();
		await writeBundle(docsRoot, FIXTURE_PATH, {
			annotations: fixtureAnnotations([
				fixtureAnnotation({ id: "ann-x" }),
				fixtureAnnotation({ id: "ann-default" }),
			]),
		});
		const service = createDocsEditSessionService({ docsRoot });
		const created = await service.createSession({
			path: FIXTURE_PATH,
			requestIds: ["ann-x", "ann-default"],
			sessionId: "reject-session",
			spawn: false,
		});
		expect(created.ok).toBe(true);
		if (!created.ok) throw new Error(`session create failed: ${created.reason}`);
		const sessionId = created.state.sessionId;
		const session = service.getSession(sessionId);
		if (!session) throw new Error("created session was not retained");

		const tools = createDocsEditToolset(session);
		const stagedExplicit = await tools.call("write_text", {
			requestAlias: "R1",
			blockId: "p1",
			markdown: "A rejected first paragraph.",
			summary: "Reject the first proposal",
		});
		const stagedDefault = await tools.call("write_text", {
			requestAlias: "R2",
			blockId: "p2",
			markdown: "A rejected second paragraph.",
			summary: "Reject the second proposal",
		});
		expect(stagedExplicit.isError).not.toBe(true);
		expect(stagedDefault.isError).not.toBe(true);

		const explicit = await service.rejectProposal(
			sessionId,
			"R1",
			"not what I wanted",
		);
		expect(explicit?.ok).toBe(true);
		if (!explicit?.ok) throw new Error("R1 reject failed");
		expect(explicit.annotation.resolved).toBe(true);

		const fallback = await service.rejectProposal(sessionId, "R2");
		expect(fallback?.ok).toBe(true);
		if (!fallback?.ok) throw new Error("R2 reject failed");
		expect(fallback.annotation.resolved).toBe(true);

		const listed = await getBundleAnnotations(docsRoot, FIXTURE_PATH);
		expect(listed.ok).toBe(true);
		if (!listed.ok) throw new Error(listed.detail);
		expect(
			listed.annotations.annotations.find((annotation) => annotation.id === "ann-x"),
		).toMatchObject({
			status: "resolved",
			resolution: "not what I wanted",
		});
		expect(
			listed.annotations.annotations.find(
				(annotation) => annotation.id === "ann-default",
			),
		).toMatchObject({
			status: "resolved",
			resolution: "Rejected in review.",
		});
	});

	test("reviews in any order, restages stale accepts, resolves annotations, and enforces reversible latest-only undo", async () => {
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

		const tools = createDocsEditToolset(session);
		const stagedFirst = await tools.call("write_text", {
			requestAlias: "R1",
			blockId: "p1",
			markdown: "First paragraph, revised.",
			summary: "Revise the first paragraph",
		});
		const stagedSecond = await tools.call("write_text", {
			requestAlias: "R2",
			blockId: "p2",
			markdown: "Second paragraph, revised.",
			summary: "Revise the second paragraph",
		});
		expect(stagedFirst.isError).not.toBe(true);
		expect(stagedSecond.isError).not.toBe(true);
		const originalSecondProposalId = session.proposals()[1]?.proposalId;
		expect(originalSecondProposalId).toBeString();
		expect(service.getState(sessionId)?.nextAcceptAlias).toBe("R1");

		const outOfOrder = await service.acceptProposal(sessionId, "R2");
		expect(outOfOrder?.ok).toBe(true);
		let disk = await readDiskDoc(docsRoot);
		expect(disk.blocks.p1?.text).toEqual(original.blocks.p1?.text);
		expect(disk.blocks.p2?.text).toEqual([{ insert: "Second paragraph, revised." }]);
		expect((await service.undoAccepted(sessionId, "R2"))?.ok).toBe(true);
		expect(await readDiskDoc(docsRoot)).toEqual(original);

		const acceptedFirst = await service.acceptProposal(sessionId, "R1");
		expect(acceptedFirst?.ok).toBe(true);
		if (!acceptedFirst?.ok) throw new Error("R1 accept failed");
		expect(acceptedFirst.annotation).toEqual({
			annotationId: "ann-first",
			attached: true,
			resolved: true,
		});
		disk = await readDiskDoc(docsRoot);
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
