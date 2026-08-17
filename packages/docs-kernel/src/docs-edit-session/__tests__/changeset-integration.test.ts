import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { serializeDocDocument } from "@codecaine-ai/docs-model/doc-schema";
import {
	getChangeSet,
	listChangeSetRecords,
	loadDocBundle,
	type DocChangeSetView,
} from "@codecaine-ai/docs-server";

import {
	createDocsEditSessionService,
	type DocsEditSessionService,
} from "../service";
import {
	FIXTURE_PATH,
	OTHER_FIXTURE_PATH,
	fixtureAnnotation,
	fixtureAnnotations,
	fixtureDoc,
	readDiskDoc,
	updateTextOp,
	writeBundle,
} from "../test-fixtures";
import { toolProposeOps } from "../tools";

const tempRoots: string[] = [];

async function makeDocsRoot(): Promise<string> {
	const docsRoot = await mkdtemp(join(tmpdir(), "docs-kernel-changeset-"));
	tempRoots.push(docsRoot);
	await Promise.all([
		writeBundle(docsRoot, FIXTURE_PATH, {
			annotations: fixtureAnnotations([
				fixtureAnnotation({
					id: "ann-first",
					body: "Update the first requested section.",
					target: { kind: "block", blockId: "p1" },
				}),
				fixtureAnnotation({
					id: "ann-second",
					body: "Update the second requested section.",
					target: { kind: "block", blockId: "p2" },
				}),
			]),
		}),
		writeBundle(docsRoot, OTHER_FIXTURE_PATH, {
			doc: fixtureDoc({ id: "other-doc", title: "Other" }),
			annotations: null,
		}),
	]);
	return docsRoot;
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function waitFor(
	predicate: () => boolean | Promise<boolean>,
	detail: string,
	timeoutMs = 2_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!(await predicate())) {
		if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${detail}`);
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

async function waitForChangeSetId(
	service: DocsEditSessionService,
	sessionId: string,
): Promise<string> {
	let changesetId: string | undefined;
	await waitFor(() => {
		changesetId = service.getState(sessionId)?.changesetId;
		return changesetId !== undefined;
	}, `session ${sessionId} to retain a change-set id`);
	return changesetId as string;
}

async function waitForChangeSet(
	docsRoot: string,
	changesetId: string,
	predicate: (changeset: DocChangeSetView) => boolean,
): Promise<DocChangeSetView> {
	let latest: DocChangeSetView | undefined;
	await waitFor(async () => {
		const loaded = await getChangeSet(docsRoot, changesetId);
		if (!loaded.ok) return false;
		latest = loaded.changeset;
		return predicate(loaded.changeset);
	}, `change-set ${changesetId} to reach the expected state`);
	return latest as DocChangeSetView;
}

async function createSession(
	docsRoot: string,
	sessionId: string,
	options: { instruction?: string } = {},
) {
	const service = createDocsEditSessionService({ docsRoot });
	const created = await service.createSession({
		path: FIXTURE_PATH,
		requestIds: ["ann-first", "ann-second"],
		sessionId,
		spawn: false,
		...(options.instruction === undefined
			? {}
			: { instruction: options.instruction }),
	});
	if (!created.ok) throw new Error(`session create failed: ${created.reason}`);
	const session = service.getSession(created.state.sessionId);
	if (!session) throw new Error("created session was not retained");
	return { service, session, sessionId: created.state.sessionId };
}

async function createRecordedTwoDocBatch(
	docsRoot: string,
	sessionId: string,
) {
	const created = await createSession(docsRoot, sessionId);
	const origin = await toolProposeOps(created.session, {
		requestAlias: "R1",
		ops: [updateTextOp("p1", "Origin document, revised first.")],
		summary: "Revise the origin document",
	});
	const other = await toolProposeOps(created.session, {
		requestAlias: "R2",
		docPath: OTHER_FIXTURE_PATH,
		ops: [updateTextOp("p2", "Other document, revised second.")],
		summary: "Revise the other document",
	});
	if (origin.isError || other.isError) {
		throw new Error(`staging failed: ${origin.text}\n${other.text}`);
	}
	const changesetId = await waitForChangeSetId(created.service, sessionId);
	await waitForChangeSet(
		docsRoot,
		changesetId,
		(changeset) => changeset.entries.length === 2,
	);
	return { ...created, changesetId };
}

afterEach(async () => {
	await Promise.all(
		tempRoots.splice(0).map((root) =>
			rm(root, { recursive: true, force: true }),
		),
	);
});

describe("docs-edit change-set integration", () => {
	test("single-doc staging remains recordless", async () => {
		const docsRoot = await makeDocsRoot();
		const { service, session, sessionId } = await createSession(
			docsRoot,
			"single-doc-recordless",
		);

		const staged = await toolProposeOps(session, {
			requestAlias: "R1",
			ops: [updateTextOp("p1", "Only the origin document changes.")],
			summary: "Revise only the origin document",
		});
		expect(staged.isError).not.toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 25));

		expect(service.getState(sessionId)?.changesetId).toBeUndefined();
		expect(await listChangeSetRecords(docsRoot)).toEqual({
			ok: true,
			changesets: [],
		});
		expect(await pathExists(join(docsRoot, ".changesets"))).toBe(false);
	});

	test("first cross-doc staging persists a record and later staging updates it and emits views", async () => {
		const docsRoot = await makeDocsRoot();
		const { service, session, sessionId } = await createSession(
			docsRoot,
			"changeset-persistence",
			{ instruction: "  Coordinate both documents.  " },
		);
		const updates: DocChangeSetView[] = [];
		const unsubscribe = service.subscribe(sessionId, (event) => {
			if (event.type === "changeset-updated") updates.push(event.changeset);
		});
		if (!unsubscribe) throw new Error("created session was not subscribable");

		const first = await toolProposeOps(session, {
			requestAlias: "R2",
			docPath: OTHER_FIXTURE_PATH,
			ops: [updateTextOp("p2", "The first cross-document edit.")],
			summary: "Revise the other document first",
		});
		expect(first.isError).not.toBe(true);
		const firstProposalId = session.proposals().find(
			(proposal) => proposal.requestAlias === "R2",
		)?.proposalId;
		if (!firstProposalId) throw new Error("first proposal was not retained");
		const changesetId = await waitForChangeSetId(service, sessionId);
		await waitFor(() => updates.length >= 1, "the record-create event");

		const createdRecord = await waitForChangeSet(
			docsRoot,
			changesetId,
			(changeset) => changeset.entries.length === 1,
		);
		expect(await pathExists(join(docsRoot, ".changesets", `${changesetId}.json`))).toBe(true);
		expect(createdRecord).toMatchObject({
			id: changesetId,
			summary: "Coordinate both documents.",
			status: "open",
			sessionId,
			annotationId: "ann-second",
			annotationDocPath: FIXTURE_PATH,
			entries: [
				{ docPath: OTHER_FIXTURE_PATH, proposalId: firstProposalId },
			],
		});

		const second = await toolProposeOps(session, {
			requestAlias: "R1",
			ops: [updateTextOp("p1", "The later origin-document edit.")],
			summary: "Revise the origin document second",
		});
		expect(second.isError).not.toBe(true);
		const secondProposalId = session.proposals().find(
			(proposal) => proposal.requestAlias === "R1",
		)?.proposalId;
		if (!secondProposalId) throw new Error("second proposal was not retained");
		await waitFor(() => updates.length >= 2, "the record-update event");
		const updatedRecord = await waitForChangeSet(
			docsRoot,
			changesetId,
			(changeset) => changeset.entries.length === 2,
		);
		unsubscribe();

		expect(updatedRecord.entries.map(({ docPath, proposalId }) => ({
			docPath,
			proposalId,
		}))).toEqual([
			{ docPath: OTHER_FIXTURE_PATH, proposalId: firstProposalId },
			{ docPath: FIXTURE_PATH, proposalId: secondProposalId },
		]);
		expect(updates).toHaveLength(2);
		expect(updates.map((changeset) => changeset.entries.length)).toEqual([1, 2]);
		expect(updates.every((changeset) => changeset.id === changesetId)).toBe(true);
	});

	test("stale accept restaging swaps the proposal id in the persisted record", async () => {
		const docsRoot = await makeDocsRoot();
		const { service, session, sessionId } = await createSession(
			docsRoot,
			"changeset-restage",
		);

		const first = await toolProposeOps(session, {
			requestAlias: "R1",
			docPath: OTHER_FIXTURE_PATH,
			ops: [updateTextOp("p1", "First edit in the shared target.")],
			summary: "Revise the first target block",
		});
		const second = await toolProposeOps(session, {
			requestAlias: "R2",
			docPath: OTHER_FIXTURE_PATH,
			ops: [updateTextOp("p2", "Second edit in the shared target.")],
			summary: "Revise the second target block",
		});
		if (first.isError || second.isError) {
			throw new Error(`staging failed: ${first.text}\n${second.text}`);
		}
		const firstProposalId = session.proposals().find(
			(proposal) => proposal.requestAlias === "R1",
		)?.proposalId;
		const originalSecondProposalId = session.proposals().find(
			(proposal) => proposal.requestAlias === "R2",
		)?.proposalId;
		if (!firstProposalId || !originalSecondProposalId) {
			throw new Error("staged proposals were not retained");
		}
		const changesetId = await waitForChangeSetId(service, sessionId);
		const initialRecord = await waitForChangeSet(
			docsRoot,
			changesetId,
			(changeset) => changeset.entries.length === 2,
		);
		expect(initialRecord.summary).toBe("Update the first requested section.");

		const acceptedFirst = await service.acceptProposal(sessionId, "R1");
		expect(acceptedFirst?.ok).toBe(true);
		const acceptedSecond = await service.acceptProposal(sessionId, "R2");
		expect(acceptedSecond?.ok).toBe(true);
		if (!acceptedSecond?.ok) throw new Error("stale proposal was not restaged");
		expect(acceptedSecond.proposalId).not.toBe(originalSecondProposalId);

		const record = await waitForChangeSet(
			docsRoot,
			changesetId,
			(changeset) => changeset.entries[1]?.proposalId === acceptedSecond.proposalId,
		);
		expect(record.entries.map(({ proposalId }) => proposalId)).toEqual([
			firstProposalId,
			acceptedSecond.proposalId,
		]);
		expect(record.entries.map(({ status }) => status)).toEqual([
			"accepted",
			"accepted",
		]);
	});

	test("acceptAll applies a recorded session as one compound change-set", async () => {
		const docsRoot = await makeDocsRoot();
		const { service, sessionId, changesetId } = await createRecordedTwoDocBatch(
			docsRoot,
			"changeset-accept-all",
		);

		const accepted = await service.acceptAll(sessionId);
		expect(accepted?.ok).toBe(true);
		if (!accepted?.ok) throw new Error("acceptAll failed");
		expect(accepted.results.map((result) => result.alias)).toEqual(["R1", "R2"]);

		const confirmed = await getChangeSet(docsRoot, changesetId);
		expect(confirmed.ok).toBe(true);
		if (!confirmed.ok) throw new Error(confirmed.detail);
		expect(confirmed.changeset).toMatchObject({
			id: changesetId,
			status: "applied",
			annotationId: "ann-second",
			annotationDocPath: FIXTURE_PATH,
			progress: { accepted: 2, total: 2 },
		});
		expect(confirmed.changeset.compoundPatchId).toBeString();
	});

	test("acceptAll rollback leaves the persisted record open", async () => {
		const docsRoot = await makeDocsRoot();
		const { service, sessionId, changesetId } = await createRecordedTwoDocBatch(
			docsRoot,
			"changeset-accept-all-rollback",
		);
		const originBefore = await readFile(
			join(docsRoot, FIXTURE_PATH, "doc.json"),
			"utf8",
		);
		const otherDocPath = join(docsRoot, OTHER_FIXTURE_PATH, "doc.json");
		const poisonedOther = await readDiskDoc(docsRoot, OTHER_FIXTURE_PATH);
		const poisonedBlock = poisonedOther.blocks.p2;
		if (!poisonedBlock) throw new Error("fixture is missing p2");
		poisonedBlock.text = [{ insert: "External edit that makes the proposal stale." }];
		await writeFile(otherDocPath, serializeDocDocument(poisonedOther), "utf8");

		const accepted = await service.acceptAll(sessionId);
		expect(accepted).toMatchObject({
			ok: false,
			failure: { status: 409, detail: "stale-proposal" },
			rolledBack: true,
		});
		expect(
			await readFile(join(docsRoot, FIXTURE_PATH, "doc.json"), "utf8"),
		).toBe(originBefore);

		const loadedOrigin = await loadDocBundle(docsRoot, FIXTURE_PATH);
		if ("error" in loadedOrigin) throw new Error(loadedOrigin.error.detail);
		const record = await getChangeSet(docsRoot, changesetId);
		expect(record.ok).toBe(true);
		if (!record.ok) throw new Error(record.detail);
		expect(record.changeset.status).toBe("open");
		expect(record.changeset.compoundPatchId).toBeUndefined();
		expect(record.changeset.progress).toEqual({ accepted: 0, total: 2 });
		expect(service.getState(sessionId)).toMatchObject({
			currentHash: loadedOrigin.docHash,
			changesetId,
			nextAcceptAlias: "R1",
		});
	});

	test("acceptAll falls back after individual progress and reconciles the record", async () => {
		const docsRoot = await makeDocsRoot();
		const { service, sessionId, changesetId } = await createRecordedTwoDocBatch(
			docsRoot,
			"changeset-accept-all-fallback",
		);

		expect((await service.acceptProposal(sessionId, "R1"))?.ok).toBe(true);
		const accepted = await service.acceptAll(sessionId);
		expect(accepted?.ok).toBe(true);
		if (!accepted?.ok) throw new Error("fallback acceptAll failed");
		expect(accepted.results.map((result) => result.alias)).toEqual(["R2"]);

		const record = await getChangeSet(docsRoot, changesetId);
		expect(record.ok).toBe(true);
		if (!record.ok) throw new Error(record.detail);
		expect(record.changeset.status).toBe("applied");
		expect(record.changeset.compoundPatchId).toBeString();
		expect(record.changeset.progress).toEqual({ accepted: 2, total: 2 });
	});

	test("rejecting every session proposal declines the persisted record", async () => {
		const docsRoot = await makeDocsRoot();
		const { service, sessionId, changesetId } = await createRecordedTwoDocBatch(
			docsRoot,
			"changeset-reject-all",
		);
		const updates: DocChangeSetView[] = [];
		const unsubscribe = service.subscribe(sessionId, (event) => {
			if (event.type === "changeset-updated") updates.push(event.changeset);
		});

		expect((await service.rejectProposal(sessionId, "R1"))?.ok).toBe(true);
		expect((await service.rejectProposal(sessionId, "R2"))?.ok).toBe(true);
		unsubscribe?.();

		const record = await getChangeSet(docsRoot, changesetId);
		expect(record.ok).toBe(true);
		if (!record.ok) throw new Error(record.detail);
		expect(record.changeset.status).toBe("declined");
		expect(record.changeset.entries.map((entry) => entry.status)).toEqual([
			"rejected",
			"rejected",
		]);
		expect(updates.at(-1)?.status).toBe("declined");
	});

	test("session undo reverses a recorded compound accept and emits the reopened view", async () => {
		const docsRoot = await makeDocsRoot();
		const originBefore = await readDiskDoc(docsRoot, FIXTURE_PATH);
		const otherBefore = await readDiskDoc(docsRoot, OTHER_FIXTURE_PATH);
		const { service, sessionId, changesetId } = await createRecordedTwoDocBatch(
			docsRoot,
			"changeset-compound-undo",
		);
		expect((await service.acceptAll(sessionId))?.ok).toBe(true);
		const updates: DocChangeSetView[] = [];
		const unsubscribe = service.subscribe(sessionId, (event) => {
			if (event.type === "changeset-updated") updates.push(event.changeset);
		});

		const undone = await service.undoAccepted(sessionId, "R2");
		unsubscribe?.();
		expect(undone?.ok).toBe(true);
		expect(await readDiskDoc(docsRoot, FIXTURE_PATH)).toEqual(originBefore);
		expect(await readDiskDoc(docsRoot, OTHER_FIXTURE_PATH)).toEqual(otherBefore);

		const record = await getChangeSet(docsRoot, changesetId);
		expect(record.ok).toBe(true);
		if (!record.ok) throw new Error(record.detail);
		expect(record.changeset.status).toBe("open");
		expect(record.changeset.entries.map((entry) => entry.status)).toEqual([
			"staged",
			"staged",
		]);
		expect(updates.at(-1)?.status).toBe("open");
	});
});
