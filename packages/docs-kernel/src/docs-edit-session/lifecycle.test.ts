import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	launchDocsEditSession,
	type LaunchedDocsEditSession,
} from "./launch";
import {
	createDocsEditSessionService,
	type DocsEditSessionService,
} from "./service";
import {
	FIXTURE_PATH,
	readDiskAnnotations,
	writeBundle,
} from "./test-fixtures";

async function waitUntil(
	predicate: () => boolean,
	message: string,
): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (predicate()) return;
		await Bun.sleep(2);
	}
	throw new Error(message);
}

describe("docs-edit launch and service lifecycle", () => {
	let docsRoot: string;
	const services: DocsEditSessionService[] = [];

	beforeEach(async () => {
		docsRoot = await mkdtemp(join(tmpdir(), "docs-kernel-lifecycle-"));
		await writeBundle(docsRoot);
	});

	afterEach(async () => {
		for (const service of services.splice(0)) service.disposeAll();
		await rm(docsRoot, { recursive: true, force: true });
	});

	test("launch scopes the request queue but preserves sidecar order for aliases", async () => {
		const launched = await launchDocsEditSession({
			docsRoot,
			path: FIXTURE_PATH,
			requestIds: ["ann-doc", "ann-block"],
			instruction: "Keep the examples.",
		});

		expect(launched.ok).toBe(true);
		if (!launched.ok) return;
		expect(launched.scope).toEqual(["ann-doc", "ann-block"]);
		expect(
			launched.session.requests().map(({ alias, annotationId }) => ({
				alias,
				annotationId,
			})),
		).toEqual([
			{ alias: "R1", annotationId: "ann-block" },
			{ alias: "R2", annotationId: "ann-doc" },
		]);
		expect(launched.spawn.agentName).toBe("docs-writer");
		expect(launched.spawn.prompt).toContain("Keep the examples.");
	});

	test("launch returns empty-scope with per-id skip evidence", async () => {
		const launched = await launchDocsEditSession({
			docsRoot,
			path: FIXTURE_PATH,
			requestIds: ["not-on-the-sidecar"],
		});

		expect(launched.ok).toBe(false);
		if (launched.ok) return;
		expect(launched.reason).toBe("empty-scope");
		if (launched.reason !== "empty-scope") return;
		expect(launched.requestIds).toEqual(["not-on-the-sidecar"]);
		expect(launched.skipped).toEqual(
			expect.arrayContaining([
				{
					annotationId: "not-on-the-sidecar",
					reason: "scope-unmatched",
					detail: "no annotation with this id on the sidecar",
				},
			]),
		);
	});

	test("one live session per normalized doc path reports the holder", async () => {
		const service = createDocsEditSessionService({ docsRoot });
		services.push(service);
		const first = await service.createSession({
			path: `${FIXTURE_PATH}/doc.json`,
			spawn: false,
		});
		expect(first.ok).toBe(true);
		if (!first.ok) return;

		const busy = await service.createSession({
			path: `${FIXTURE_PATH}/`,
			spawn: false,
		});
		expect(busy).toEqual({
			ok: false,
			reason: "agent-busy",
			path: FIXTURE_PATH,
			sessionId: first.state.sessionId,
		});
		expect(service.list()).toHaveLength(1);
	});

	test("agent reply waits for a human; human reply clears waiting in a headless session", async () => {
		const service = createDocsEditSessionService({ docsRoot });
		services.push(service);
		const created = await service.createSession({
			path: FIXTURE_PATH,
			spawn: false,
		});
		if (!created.ok) throw new Error(`create failed: ${created.reason}`);
		const sessionId = created.state.sessionId;
		const session = service.getSession(sessionId);
		if (!session) throw new Error("missing session");

		const asked = await session.reply("R1", "Should I keep the first example?");
		expect(asked.ok).toBe(true);
		expect(service.getState(sessionId)?.requests[0]).toMatchObject({
			status: "waiting",
			waitingOnHuman: true,
		});
		expect(
			(await readDiskAnnotations(docsRoot)).annotations[0]?.replies?.at(-1),
		).toMatchObject({ author: "agent", body: "Should I keep the first example?" });

		const answered = await service.replyToRequest(
			sessionId,
			"R1",
			"Yes, keep it.",
		);
		expect(answered?.ok).toBe(true);
		expect(service.getState(sessionId)?.requests[0]).toMatchObject({
			status: "open",
			waitingOnHuman: false,
		});
		expect(service.getState(sessionId)?.agent).toMatchObject({
			spawned: false,
			turns: 0,
			rerunPending: false,
		});
		expect(
			(await readDiskAnnotations(docsRoot)).annotations[0]?.replies?.at(-1),
		).toMatchObject({ author: "human", body: "Yes, keep it." });
	});

	test("declined and done-without-ops requests resolve their sidecar annotations", async () => {
		const service = createDocsEditSessionService({ docsRoot });
		services.push(service);
		const created = await service.createSession({ path: FIXTURE_PATH, spawn: false });
		if (!created.ok) throw new Error(`create failed: ${created.reason}`);
		const session = service.getSession(created.state.sessionId);
		if (!session) throw new Error("missing session");

		expect((await session.resolve("R1", "declined", "The current wording is intentional.")).ok).toBe(true);
		expect((await session.resolve("R2", "done", "No document operation is needed.")).ok).toBe(true);

		const annotations = await readDiskAnnotations(docsRoot);
		expect(annotations.annotations[0]).toMatchObject({
			id: "ann-block",
			status: "resolved",
			resolution: "The current wording is intentional.",
		});
		expect(annotations.annotations[1]).toMatchObject({
			id: "ann-range",
			status: "resolved",
			resolution: "No document operation is needed.",
		});
		expect(service.getState(created.state.sessionId)?.requests.slice(0, 2)).toMatchObject([
			{ alias: "R1", status: "declined" },
			{ alias: "R2", status: "resolved" },
		]);
	});

	test("replies during a live turn coalesce into exactly one follow-up turn", async () => {
		const launches: LaunchedDocsEditSession[] = [];
		let releaseFirst: (() => void) | undefined;
		const firstTurn = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const service = createDocsEditSessionService({
			docsRoot,
			spawnAgent: async (launch) => {
				launches.push(launch);
				if (launches.length === 1) await firstTurn;
			},
		});
		services.push(service);
		const created = await service.createSession({ path: FIXTURE_PATH });
		if (!created.ok) throw new Error(`create failed: ${created.reason}`);
		const sessionId = created.state.sessionId;
		await waitUntil(
			() => launches.length === 1 && service.getState(sessionId)?.agent.running === true,
			"initial agent turn did not start",
		);

		expect((await service.replyToRequest(sessionId, "R1", "First reply."))?.ok).toBe(
			true,
		);
		expect((await service.replyToRequest(sessionId, "R2", "Second reply."))?.ok).toBe(
			true,
		);
		expect(launches).toHaveLength(1);
		expect(service.getState(sessionId)?.agent.rerunPending).toBe(true);

		releaseFirst?.();
		await waitUntil(
			() =>
				launches.length === 2 &&
				service.getState(sessionId)?.agent.running === false &&
				service.getState(sessionId)?.agent.turns === 2,
			"coalesced follow-up turn did not settle",
		);

		expect(launches).toHaveLength(2);
		expect(launches[1]?.spawn.prompt).toContain("R1, R2");
		expect(service.getState(sessionId)?.agent).toMatchObject({
			spawned: true,
			running: false,
			turns: 2,
			rerunPending: false,
		});
	});
});
