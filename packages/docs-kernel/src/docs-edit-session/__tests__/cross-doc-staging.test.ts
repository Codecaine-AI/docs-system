import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getBundleProposals } from "@codecaine-ai/docs-server";

import { createDocsEditSessionService } from "../service";
import {
	FIXTURE_PATH,
	OTHER_FIXTURE_PATH,
	fixtureDoc,
	updateTextOp,
	writeBundle,
} from "../test-fixtures";
import { toolProposeOps } from "../tools";

const THIRD_FIXTURE_PATH = "third";
const tempRoots: string[] = [];

async function makeDocsRoot(): Promise<string> {
	const container = await mkdtemp(join(tmpdir(), "docs-kernel-cross-doc-"));
	tempRoots.push(container);
	const docsRoot = join(container, "docs");
	await Promise.all([
		writeBundle(docsRoot, FIXTURE_PATH),
		writeBundle(docsRoot, OTHER_FIXTURE_PATH, {
			doc: fixtureDoc({ id: "other-doc", title: "Other" }),
		}),
		writeBundle(docsRoot, THIRD_FIXTURE_PATH, {
			doc: fixtureDoc({ id: "third-doc", title: "Third" }),
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

afterEach(async () => {
	await Promise.all(
		tempRoots.splice(0).map((root) =>
			rm(root, { recursive: true, force: true }),
		),
	);
});

describe("docs-edit cross-doc staging", () => {
	test("propose_ops stages into docPath and rejects a path escape without a sidecar write", async () => {
		const docsRoot = await makeDocsRoot();
		const service = createDocsEditSessionService({ docsRoot });
		const created = await service.createSession({
			path: FIXTURE_PATH,
			sessionId: "cross-doc-tool-session",
			spawn: false,
		});
		expect(created.ok).toBe(true);
		if (!created.ok) throw new Error(`session create failed: ${created.reason}`);
		const session = service.getSession(created.state.sessionId);
		if (!session) throw new Error("created session was not retained");

		const escaped = await toolProposeOps(session, {
			requestAlias: "R1",
			docPath: "../escape",
			ops: [updateTextOp("p1", "This must never be written.")],
			summary: "Attempt an escaping write",
		});
		expect(escaped.isError).toBe(true);
		expect(escaped.text).toContain("Invalid docs path: ../escape");
		expect(escaped.details).toMatchObject({
			failure: { kind: "stage_failed", status: 400 },
		});
		expect(
			await pathExists(join(docsRoot, "..", "escape", "proposals.json")),
		).toBe(false);
		expect(session.proposals()).toHaveLength(0);

		const staged = await toolProposeOps(session, {
			requestAlias: "R1",
			docPath: `${OTHER_FIXTURE_PATH}/doc.json`,
			ops: [updateTextOp("p1", "Updated in the other document.")],
			summary: "Update the other document",
		});
		expect(staged.isError).not.toBe(true);
		expect(staged.text).toContain("STAGED");

		const originProposals = await getBundleProposals(docsRoot, FIXTURE_PATH);
		expect(originProposals.ok).toBe(true);
		if (!originProposals.ok) throw new Error(originProposals.detail);
		expect(originProposals.proposals).toHaveLength(0);

		const otherProposals = await getBundleProposals(
			docsRoot,
			OTHER_FIXTURE_PATH,
		);
		expect(otherProposals.ok).toBe(true);
		if (!otherProposals.ok) throw new Error(otherProposals.detail);
		expect(otherProposals.proposals).toHaveLength(1);
		expect(otherProposals.proposals[0]).toMatchObject({
			alias: "R1",
			sessionId: created.state.sessionId,
			status: "staged",
			summary: "Update the other document",
		});
		expect(otherProposals.proposals[0]?.annotationId).toBeUndefined();
		expect(service.getState(created.state.sessionId)).toMatchObject({
			touchedDocPaths: [FIXTURE_PATH, OTHER_FIXTURE_PATH],
			proposals: [{ requestAlias: "R1", docPath: OTHER_FIXTURE_PATH }],
		});
	});

	test("a cross-doc touch blocks overlap while a disjoint session still starts", async () => {
		const docsRoot = await makeDocsRoot();
		const service = createDocsEditSessionService({ docsRoot });
		const first = await service.createSession({
			path: FIXTURE_PATH,
			sessionId: "touches-other",
			spawn: false,
		});
		expect(first.ok).toBe(true);
		if (!first.ok) throw new Error(`session create failed: ${first.reason}`);
		const session = service.getSession(first.state.sessionId);
		if (!session) throw new Error("created session was not retained");

		const staged = await toolProposeOps(session, {
			requestAlias: "R1",
			docPath: OTHER_FIXTURE_PATH,
			ops: [updateTextOp("p1", "Shared document update.")],
			summary: "Touch the shared document",
		});
		expect(staged.isError).not.toBe(true);

		const overlapping = await service.createSession({
			path: `${OTHER_FIXTURE_PATH}/doc.json`,
			sessionId: "overlapping-session",
			spawn: false,
		});
		expect(overlapping).toEqual({
			ok: false,
			reason: "agent-busy",
			path: OTHER_FIXTURE_PATH,
			sessionId: first.state.sessionId,
		});

		const disjoint = await service.createSession({
			path: THIRD_FIXTURE_PATH,
			sessionId: "disjoint-session",
			spawn: false,
		});
		expect(disjoint.ok).toBe(true);
		expect(service.list()).toHaveLength(2);
	});
});
