import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { serializeDocDocument } from "@codecaine-ai/docs-model/doc-schema";
import {
	getBundleProposals,
	loadDocBundle,
} from "@codecaine-ai/docs-server";

import { createDocsEditSessionService } from "../service";
import {
	FIXTURE_PATH,
	OTHER_FIXTURE_PATH,
	fixtureAnnotation,
	fixtureAnnotations,
	fixtureDoc,
	readDiskAnnotations,
	readDiskDoc,
	updateTextOp,
	writeBundle,
} from "../test-fixtures";
import { toolProposeOps } from "../tools";

const tempRoots: string[] = [];

async function makeDocsRoot(): Promise<string> {
	const docsRoot = await mkdtemp(join(tmpdir(), "docs-kernel-accept-all-"));
	tempRoots.push(docsRoot);
	await writeBundle(docsRoot, FIXTURE_PATH, {
		annotations: fixtureAnnotations([
			fixtureAnnotation({
				id: "ann-origin",
				target: { kind: "block", blockId: "p1" },
			}),
			fixtureAnnotation({
				id: "ann-other",
				target: { kind: "block", blockId: "p2" },
			}),
		]),
	});
	await writeBundle(docsRoot, OTHER_FIXTURE_PATH, {
		doc: fixtureDoc({ id: "other-doc", title: "Other" }),
		annotations: null,
	});
	return docsRoot;
}

afterEach(async () => {
	await Promise.all(
		tempRoots.splice(0).map((root) =>
			rm(root, { recursive: true, force: true }),
		),
	);
});

async function createTwoDocBatch(docsRoot: string, sessionId: string) {
	const service = createDocsEditSessionService({ docsRoot });
	const created = await service.createSession({
		path: FIXTURE_PATH,
		requestIds: ["ann-origin", "ann-other"],
		sessionId,
		spawn: false,
	});
	if (!created.ok) throw new Error(`session create failed: ${created.reason}`);
	const session = service.getSession(created.state.sessionId);
	if (!session) throw new Error("created session was not retained");

	const origin = await toolProposeOps(session, {
		requestAlias: "R1",
		ops: [updateTextOp("p1", "Origin document, revised first.")],
		summary: "Revise the origin document",
	});
	const other = await toolProposeOps(session, {
		requestAlias: "R2",
		docPath: OTHER_FIXTURE_PATH,
		ops: [updateTextOp("p2", "Other document, revised second.")],
		summary: "Revise the other document",
	});
	if (origin.isError || other.isError) {
		throw new Error(`staging failed: ${origin.text}\n${other.text}`);
	}
	return { service, sessionId: created.state.sessionId };
}

describe("docs-edit acceptAll", () => {
	test("accepts a staged cross-doc batch in order and resolves origin annotations", async () => {
		const docsRoot = await makeDocsRoot();
		const { service, sessionId } = await createTwoDocBatch(
			docsRoot,
			"accept-all-success",
		);
		const appliedAliases: string[] = [];
		const unsubscribe = service.subscribe(sessionId, (event) => {
			if (event.type === "proposal-applied") appliedAliases.push(event.alias);
		});
		if (!unsubscribe) throw new Error("created session was not subscribable");

		const accepted = await service.acceptAll(sessionId);
		unsubscribe();
		expect(accepted?.ok).toBe(true);
		if (!accepted?.ok) throw new Error("acceptAll failed");
		expect(accepted.results.map((result) => result.alias)).toEqual(["R1", "R2"]);
		for (const result of accepted.results) expect(result.ok).toBe(true);
		const [originResult, otherResult] = accepted.results;
		if (!originResult?.ok || !otherResult?.ok) {
			throw new Error("acceptAll returned a failed per-alias result");
		}
		expect(originResult.patchId).toBeString();
		expect(otherResult.patchId).toBeString();
		expect(originResult.annotation).toMatchObject({
			annotationId: "ann-origin",
			attached: true,
			resolved: true,
		});
		expect(otherResult.annotation).toMatchObject({
			annotationId: "ann-other",
			attached: false,
			resolved: true,
		});
		expect(appliedAliases).toEqual(["R1", "R2"]);

		const origin = await readDiskDoc(docsRoot, FIXTURE_PATH);
		const other = await readDiskDoc(docsRoot, OTHER_FIXTURE_PATH);
		expect(origin.blocks.p1?.text).toEqual([
			{ insert: "Origin document, revised first." },
		]);
		expect(other.blocks.p2?.text).toEqual([
			{ insert: "Other document, revised second." },
		]);

		const annotations = await readDiskAnnotations(docsRoot, FIXTURE_PATH);
		const originAnnotation = annotations.annotations.find(
			(annotation) => annotation.id === "ann-origin",
		);
		const otherAnnotation = annotations.annotations.find(
			(annotation) => annotation.id === "ann-other",
		);
		expect(originAnnotation).toMatchObject({
			status: "resolved",
			resolution: "Revise the origin document",
			agentRun: {
				sessionId,
				patchId: originResult.patchId,
			},
		});
		expect(otherAnnotation).toMatchObject({
			status: "resolved",
			resolution: "Revise the other document",
		});
		expect(otherAnnotation?.agentRun).toBeUndefined();

		const otherProposals = await getBundleProposals(
			docsRoot,
			OTHER_FIXTURE_PATH,
		);
		expect(otherProposals.ok).toBe(true);
		if (!otherProposals.ok) throw new Error(otherProposals.detail);
		expect(otherProposals.proposals[0]?.annotationId).toBeUndefined();
		const loadedOrigin = await loadDocBundle(docsRoot, FIXTURE_PATH);
		if ("error" in loadedOrigin) throw new Error(loadedOrigin.error.detail);
		expect(service.getState(sessionId)).toMatchObject({
			currentHash: loadedOrigin.docHash,
			nextAcceptAlias: null,
			undoableAlias: "R2",
			requests: [
				{ alias: "R1", review: "applied" },
				{ alias: "R2", review: "applied" },
			],
		});
	});

	test("rolls back an applied prefix byte-for-byte when a later doc is stale", async () => {
		const docsRoot = await makeDocsRoot();
		const { service, sessionId } = await createTwoDocBatch(
			docsRoot,
			"accept-all-rollback",
		);
		const originDocPath = join(docsRoot, FIXTURE_PATH, "doc.json");
		const otherDocPath = join(docsRoot, OTHER_FIXTURE_PATH, "doc.json");
		const originBytesBefore = await readFile(originDocPath, "utf8");
		const originLoadedBefore = await loadDocBundle(docsRoot, FIXTURE_PATH);
		if ("error" in originLoadedBefore) throw new Error(originLoadedBefore.error.detail);

		const poisonedOther = await readDiskDoc(docsRoot, OTHER_FIXTURE_PATH);
		const poisonedBlock = poisonedOther.blocks.p2;
		if (!poisonedBlock) throw new Error("fixture is missing p2");
		poisonedBlock.text = [{ insert: "External edit that poisons the staged hash." }];
		await writeFile(otherDocPath, serializeDocDocument(poisonedOther), "utf8");

		const accepted = await service.acceptAll(sessionId);
		expect(accepted).toMatchObject({
			ok: false,
			failure: { alias: "R2", status: 409, detail: "stale-proposal" },
			rolledBack: true,
		});
		if (!accepted || accepted.ok) throw new Error("acceptAll unexpectedly succeeded");
		expect(accepted.results.map((result) => result.alias)).toEqual(["R1", "R2"]);

		const originBytesAfter = await readFile(originDocPath, "utf8");
		expect(originBytesAfter).toBe(originBytesBefore);
		const originLoadedAfter = await loadDocBundle(docsRoot, FIXTURE_PATH);
		if ("error" in originLoadedAfter) throw new Error(originLoadedAfter.error.detail);
		expect(originLoadedAfter.docHash).toBe(originLoadedBefore.docHash);

		const state = service.getState(sessionId);
		expect(state).toMatchObject({
			nextAcceptAlias: "R1",
			undoableAlias: null,
			requests: [
				{ alias: "R1", review: "pending" },
				{ alias: "R2", review: "pending" },
			],
			proposals: [
				{ requestAlias: "R1", docPath: FIXTURE_PATH, review: "pending" },
				{ requestAlias: "R2", docPath: OTHER_FIXTURE_PATH, review: "pending" },
			],
		});
		if (!state) throw new Error("session disappeared after rollback");

		const [originProposals, otherProposals] = await Promise.all([
			getBundleProposals(docsRoot, FIXTURE_PATH),
			getBundleProposals(docsRoot, OTHER_FIXTURE_PATH),
		]);
		expect(originProposals.ok).toBe(true);
		expect(otherProposals.ok).toBe(true);
		if (!originProposals.ok) throw new Error(originProposals.detail);
		if (!otherProposals.ok) throw new Error(otherProposals.detail);
		const activeOrigin = originProposals.proposals.find(
			(proposal) => proposal.id === state.proposals[0]?.proposalId,
		);
		const activeOther = otherProposals.proposals.find(
			(proposal) => proposal.id === state.proposals[1]?.proposalId,
		);
		expect(activeOrigin).toMatchObject({
			alias: "R1",
			status: "staged",
			stale: false,
		});
		expect(activeOther).toMatchObject({
			alias: "R2",
			status: "staged",
			stale: true,
		});
	});
});
