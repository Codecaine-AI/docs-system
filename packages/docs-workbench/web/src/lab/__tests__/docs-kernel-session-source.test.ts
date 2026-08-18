import { describe, expect, it } from "bun:test";

import type {
	DocsEditRequestState,
	DocsEditSessionState,
	DocsEditSessionStreamEvent,
	DocsKernelClient,
} from "../docs-kernel-client";
import {
	createDocsKernelSessionSource,
	docsKernelFailureMessage,
	docsKernelSessionApplying,
	reduceDocsEditSessionEvent,
} from "../docs-kernel-session-source";

const request = (
	status: DocsEditRequestState["status"] = "open",
): DocsEditRequestState => ({
	alias: "R1",
	annotationId: "ann-1",
	target: { kind: "block", blockId: "p1" },
	disposition: "batch",
	body: "Rewrite this",
	author: "human",
	replies: [],
	status,
	waitingOnHuman: false,
	review: "pending",
});

const session = (overrides: Partial<DocsEditSessionState> = {}): DocsEditSessionState => ({
	sessionId: "session-1",
	path: "guide",
	docId: "doc-1",
	baseHash: "hash-1",
	currentHash: "hash-1",
	status: "running",
	createdAt: "2026-01-01T00:00:00.000Z",
	scope: ["ann-1"],
	requests: [request()],
	proposals: [{
		proposalId: "proposal-1",
		requestAlias: "R1",
		baseHash: "hash-1",
		ops: [],
		changedBlockIds: ["p1"],
		summary: "Rewrite paragraph",
		createdAt: "2026-01-01T00:01:00.000Z",
		review: "pending",
	}],
	nextAcceptAlias: "R1",
	undoableAlias: null,
	skipped: [],
	agent: { spawned: true, running: true, turns: 1, rerunPending: false },
	...overrides,
});

function mockClient(createResult: Awaited<ReturnType<DocsKernelClient["createSession"]>>) {
	let onEvent: ((event: DocsEditSessionStreamEvent) => void) | undefined;
	let onError: ((error: Error) => void) | undefined;
	let subscriptions = 0;
	let disposals = 0;
	const client = {
		health: async () => true,
		createSession: async () => createResult,
		subscribeSessionEvents: (
			_id: string,
			next: (event: DocsEditSessionStreamEvent) => void,
			error?: (error: Error) => void,
		) => {
			subscriptions += 1;
			onEvent = next;
			onError = error;
			return () => {};
		},
		acceptProposal: async () => ({
			ok: true as const,
			alias: "R1",
			proposalId: "proposal-1",
			patchId: "patch-1",
			hash: "hash-2",
		}),
		disposeSession: async () => {
			disposals += 1;
			return { ok: true as const };
		},
	} as unknown as DocsKernelClient;
	return {
		client,
		emit: (event: DocsEditSessionStreamEvent) => onEvent?.(event),
		failStream: () => onError?.(new Error("docs edit session stream dropped")),
		subscriptions: () => subscriptions,
		disposals: () => disposals,
	};
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const wait = (milliseconds: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const changeset = (summary: string) => ({
	id: "changeset-1",
	summary,
	status: "open" as const,
	sessionId: "session-1",
	entries: [],
	treeOps: [],
	createdAt: "2026-01-01T00:02:00.000Z",
	progress: { accepted: 0, total: 0 },
});

describe("docs kernel session source", () => {
	it("derives applying across session creation, a running turn, and settlement", async () => {
		let resolveCreate!: (result: { state: DocsEditSessionState }) => void;
		const creating = new Promise<{ state: DocsEditSessionState }>((resolve) => {
			resolveCreate = resolve;
		});
		const mock = mockClient({ state: session() });
		mock.client.createSession = () => creating;
		const source = createDocsKernelSessionSource({
			client: mock.client,
			path: "guide",
			onSessionEnd() {},
		});

		const applying = source.applyQueue(["ann-1"]);
		expect(docsKernelSessionApplying(source.getSnapshot())).toBe(true);
		expect(source.getSnapshot().starting).toBe(true);
		expect(source.statusOverlay().get("ann-1")).toBe("working");

		resolveCreate({ state: session() });
		await applying;
		expect(docsKernelSessionApplying(source.getSnapshot())).toBe(true);

		mock.emit({
			type: "agent-turn",
			sessionId: "session-1",
			phase: "finished",
			turn: 1,
			aliases: ["R1"],
		});
		expect(docsKernelSessionApplying(source.getSnapshot())).toBe(false);
	});

	it("preserves cross-document proposal paths from staged events", () => {
		const next = reduceDocsEditSessionEvent(session(), {
			type: "proposal-staged",
			sessionId: "session-1",
			proposal: {
				proposalId: "proposal-2",
				requestAlias: "R1",
				baseHash: "hash-1",
				ops: [],
				changedBlockIds: ["p2"],
				summary: "Rewrite another document",
				createdAt: "2026-01-01T00:02:00.000Z",
				docPath: "10-architecture/20-north-star",
			},
		});

		expect(next.proposals.at(-1)?.docPath).toBe(
			"10-architecture/20-north-star",
		);
	});

	it("mirrors stream request statuses into the live annotation overlay", async () => {
		const mock = mockClient({ state: session() });
		const source = createDocsKernelSessionSource({ client: mock.client, path: "guide", onSessionEnd() {} });

		await source.applyQueue(["ann-1"]);
		expect(source.sessionId()).toBe("session-1");
		mock.emit({ type: "session-state", sessionId: "session-1", state: session() });
		mock.emit({ type: "request-updated", sessionId: "session-1", request: request("working") });
		expect(source.statusOverlay().get("ann-1")).toBe("working");
		mock.emit({ type: "request-updated", sessionId: "session-1", request: request("waiting") });
		expect(source.statusOverlay().get("ann-1")).toBe("waiting");
		expect(source.statusOverlay().has("ann-outside")).toBe(false);
	});

	it("stores the latest changeset view from matching session events", async () => {
		const mock = mockClient({ state: session() });
		const source = createDocsKernelSessionSource({ client: mock.client, path: "guide", onSessionEnd() {} });
		await source.applyQueue(["ann-1"]);

		mock.emit({ type: "changeset-updated", sessionId: "other-session", changeset: changeset("ignored") });
		expect(source.changesets().size).toBe(0);

		mock.emit({ type: "changeset-updated", sessionId: "session-1", changeset: changeset("first") });
		mock.emit({ type: "changeset-updated", sessionId: "session-1", changeset: changeset("latest") });
		expect(source.changesets().get("changeset-1")?.summary).toBe("latest");
		expect(source.getSnapshot().changesets.get("changeset-1")?.summary).toBe("latest");
	});

	it("clears a disposed session and announces its end once", async () => {
		let ends = 0;
		const mock = mockClient({ state: session() });
		const source = createDocsKernelSessionSource({ client: mock.client, path: "guide", onSessionEnd: () => { ends += 1; } });
		await source.applyQueue(["ann-1"]);

		mock.emit({ type: "session-disposed", sessionId: "session-1" });
		mock.emit({ type: "session-disposed", sessionId: "session-1" });

		expect(source.getSnapshot().live).toBe(false);
		expect(source.statusOverlay().size).toBe(0);
		expect(ends).toBe(1);
	});

	it("resyncs session state and resubscribes after a stream error", async () => {
		const mock = mockClient({ state: session() });
		mock.client.getSession = async () => ({
			state: session({ agent: { spawned: true, running: false, turns: 1, rerunPending: false } }),
		});
		const source = createDocsKernelSessionSource({ client: mock.client, path: "guide", onSessionEnd() {} });
		await source.applyQueue(["ann-1"]);

		mock.failStream();
		await wait(350);

		expect(source.getSnapshot().state?.agent.running).toBe(false);
		expect(source.getSnapshot().streamError).toBeUndefined();
		expect(mock.subscriptions()).toBe(2);
	});

	it("treats a recovery 404 like a session-disposed event", async () => {
		let ends = 0;
		const mock = mockClient({ state: session() });
		mock.client.getSession = async () => ({ ok: false, status: 404, errors: ["gone"] });
		const source = createDocsKernelSessionSource({ client: mock.client, path: "guide", onSessionEnd: () => { ends += 1; } });
		await source.applyQueue(["ann-1"]);

		mock.failStream();
		await wait(350);

		expect(source.getSnapshot().live).toBe(false);
		expect(source.getSnapshot().streamError).toBeUndefined();
		expect(ends).toBe(1);
	});

	it("surfaces a fallback error after recovery retries fail", async () => {
		let attempts = 0;
		const mock = mockClient({ state: session() });
		mock.client.getSession = async () => {
			attempts += 1;
			return { ok: false, status: 0, errors: [], offline: true };
		};
		const source = createDocsKernelSessionSource({ client: mock.client, path: "guide", onSessionEnd() {} });
		await source.applyQueue(["ann-1"]);

		mock.failStream();
		await wait(3_100);

		expect(attempts).toBe(3);
		expect(source.getSnapshot().streamError).toBe(
			"Lost the agent session stream — showing the last known state; reload to re-sync.",
		);
	});

	it("cancels stream recovery when disposed", async () => {
		let attempts = 0;
		const mock = mockClient({ state: session() });
		mock.client.getSession = async () => {
			attempts += 1;
			return { state: session() };
		};
		const source = createDocsKernelSessionSource({ client: mock.client, path: "guide", onSessionEnd() {} });
		let notifications = 0;
		source.subscribe(() => { notifications += 1; });
		await source.applyQueue(["ann-1"]);

		mock.failStream();
		source.dispose();
		const notificationsAtDispose = notifications;
		await wait(350);

		expect(attempts).toBe(0);
		expect(mock.subscriptions()).toBe(1);
		expect(notifications).toBe(notificationsAtDispose);
	});

	it("maps agent-busy and offline create failures without opening a stream", async () => {
		const busy = mockClient({ ok: false, status: 409, errors: ["busy"], failure: { reason: "agent-busy" } });
		const busySource = createDocsKernelSessionSource({ client: busy.client, path: "guide", onSessionEnd() {} });
		await busySource.applyQueue(["ann-1"]);
		expect(busySource.getSnapshot().sessionError).toBe("agent is busy with another document");
		expect(busySource.getSnapshot().live).toBe(false);
		expect(busy.subscriptions()).toBe(0);

		const offline = mockClient({ ok: false, status: 0, errors: [], offline: true });
		const offlineSource = createDocsKernelSessionSource({ client: offline.client, path: "guide", onSessionEnd() {} });
		await offlineSource.applyQueue([]);
		expect(offlineSource.getSnapshot().sessionError).toBe("docs agent not connected");
		expect(docsKernelFailureMessage({ ok: false, status: 0, errors: [], offline: true })).toBe("docs agent not connected");
	});

	it("maps a kernel rooted at different docs and preserves generic failure text", async () => {
		const wrongRoot = {
			ok: false as const,
			status: 404,
			errors: ["Doc path guide not found"],
			failure: { reason: "unknown-doc" },
		};
		const source = createDocsKernelSessionSource({
			client: mockClient(wrongRoot).client,
			path: "guide",
			onSessionEnd() {},
		});
		await source.applyQueue(["ann-1"]);

		expect(source.getSnapshot().sessionError).toBe(
			"The docs agent is running against a different docs root — it doesn't know this document.",
		);
		expect(
			docsKernelFailureMessage({
				ok: false,
				status: 500,
				errors: ["kernel launch exploded"],
			}),
		).toBe("kernel launch exploded");
	});

	it("maps an unknown corpus to the kernel registration guard", () => {
		expect(docsKernelFailureMessage({
			ok: false,
			status: 400,
			errors: ["corpus: unknown corpus product-docs"],
		})).toBe(
			"The docs kernel doesn't serve this corpus — restart it with this corpus registered.",
		);
	});

	it("applies through the live route and deduplicates the stream hash refresh", async () => {
		const hashes: string[] = [];
		const mock = mockClient({ state: session() });
		const source = createDocsKernelSessionSource({
			client: mock.client,
			path: "guide",
			onSessionEnd() {},
			onDocChanged: (hash) => { hashes.push(hash); },
		});
		await source.applyQueue(["ann-1"]);

		expect(await source.accept("ann-1")).toEqual({ ok: true });
		expect(source.getSnapshot().state?.proposals[0]?.review).toBe("applied");
		expect(source.statusOverlay().get("ann-1")).toBe("applied");
		mock.emit({ type: "proposal-applied", sessionId: "session-1", alias: "R1", proposalId: "proposal-1", patchId: "patch-1", hash: "hash-2" });
		expect(hashes).toEqual(["hash-2"]);
	});

	it("auto-disposes a completed settled session and announces its end once", async () => {
		let ends = 0;
		const settled = session({
			status: "completed",
			requests: [request("applied")],
			proposals: [{ ...session().proposals[0]!, review: "applied" }],
			agent: { spawned: true, running: false, turns: 1, rerunPending: false },
		});
		const mock = mockClient({ state: settled });
		const source = createDocsKernelSessionSource({ client: mock.client, path: "guide", onSessionEnd: () => { ends += 1; } });

		await source.applyQueue(["ann-1"]);
		await flush();

		expect(mock.disposals()).toBe(1);
		expect(source.getSnapshot().live).toBe(false);
		expect(ends).toBe(1);
	});
});
