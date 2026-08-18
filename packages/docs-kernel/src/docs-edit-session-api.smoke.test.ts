import { describe, expect, test } from "bun:test";

import type { AgentConfig } from "@agent-kernel/kernel";
import type { DocChangeSetView } from "@codecaine-ai/docs-server";

import {
	createDocsEditSessionApi,
} from "./docs-edit-session-api";
import type {
	AcceptDocsEditProposalResult,
	CreateDocsEditSessionInput,
	CreateDocsEditSessionResult,
	DocsEditAcceptAllResult,
	DocsEditSessionService,
	DocsEditSessionState,
	DocsEditSessionStreamListener,
	LaunchedDocsEditSession,
	RejectDocsEditProposalResult,
	UndoAcceptedDocsProposalResult,
} from "./docs-edit-session";
import {
	DOCS_EDIT_TOOL_NAMES,
	DOCS_LAB_EDITOR_AGENT_NAME,
	docsEditSharedTools,
	enqueueDocsEditLaunch,
} from "./docs-edit";

const SESSION_ID = "docs-session-api-smoke";
const CHANGESET_ID = "changeset-api-smoke";
const NOW = "2026-08-14T12:00:00.000Z";

function changesetFixture(): DocChangeSetView {
	return {
		id: CHANGESET_ID,
		summary: "Work the queue.",
		status: "open",
		sessionId: SESSION_ID,
		entries: [
			{
				docPath: "10-guides/quickstart",
				proposalId: "proposal-1",
				status: "staged",
				stale: false,
				summary: "Tighten the quickstart.",
				addCount: 1,
				delCount: 1,
			},
		],
		treeOps: [],
		createdAt: NOW,
		progress: { accepted: 0, total: 1 },
	};
}

function stateFixture(): DocsEditSessionState {
	return {
		sessionId: SESSION_ID,
		corpus: "docs-system",
		path: "00-foundation/overview",
		touchedDocPaths: ["00-foundation/overview"],
		docId: "doc-root",
		baseHash: "hash-0",
		currentHash: "hash-0",
		status: "running",
		instruction: "Work the queue.",
		createdAt: NOW,
		scope: null,
		requests: [
			{
				alias: "R1",
				annotationId: "ann-1",
				target: { kind: "doc" },
				disposition: "global",
				body: "Shorten the overview.",
				author: "human",
				replies: [],
				status: "open",
				waitingOnHuman: false,
				review: "pending",
			},
		],
		proposals: [],
		nextAcceptAlias: null,
		undoableAlias: null,
		skipped: [],
		agent: {
			spawned: false,
			running: false,
			turns: 0,
			rerunPending: false,
		},
	};
}

interface FakeServiceControls {
	service: DocsEditSessionService;
	state: DocsEditSessionState;
	createdInputs: CreateDocsEditSessionInput[];
	setCreateResult(result: CreateDocsEditSessionResult): void;
	setAcceptResult(result: AcceptDocsEditProposalResult): void;
	setAcceptAllResult(result: DocsEditAcceptAllResult | null): void;
	setChangeSet(changeset: DocChangeSetView | null): void;
	setRejectResult(result: RejectDocsEditProposalResult): void;
	setUndoResult(result: UndoAcceptedDocsProposalResult): void;
}

function fakeService(): FakeServiceControls {
	const state = stateFixture();
	const createdInputs: CreateDocsEditSessionInput[] = [];
	const listeners = new Set<DocsEditSessionStreamListener>();
	let disposed = false;
	let createResult: CreateDocsEditSessionResult = { ok: true, state };
	let acceptResult: AcceptDocsEditProposalResult = {
		ok: false,
		failure: { kind: "no_staged_proposal", alias: "R1" },
	};
	let acceptAllResult: DocsEditAcceptAllResult | null = {
		ok: true,
		results: [],
	};
	let changeset: DocChangeSetView | null = null;
	let rejectResult: RejectDocsEditProposalResult = {
		ok: false,
		failure: { kind: "no_staged_proposal", alias: "R1" },
	};
	let undoResult: UndoAcceptedDocsProposalResult = {
		ok: false,
		failure: { kind: "not_applied", alias: "R1" },
	};

	const request = {
		alias: "R1",
		annotationId: "ann-1",
		target: { kind: "doc" as const },
		disposition: "global" as const,
		body: "Shorten the overview.",
		author: "human" as const,
		replies: [],
		sidecarBacked: true,
		status: "open" as const,
		waitingOnHuman: false,
	};

	const service: DocsEditSessionService = {
		allowWrites: true,
		async createSession(input) {
			createdInputs.push(input);
			return createResult;
		},
		getState(sessionId) {
			return !disposed && sessionId === SESSION_ID ? state : null;
		},
		list() {
			return disposed
				? []
				: [
						{
							sessionId: state.sessionId,
							corpus: state.corpus,
							path: state.path,
							docId: state.docId,
							status: state.status,
							createdAt: state.createdAt,
							baseHash: state.baseHash,
							currentHash: state.currentHash,
							requestCount: 1,
							proposalCount: 0,
							appliedCount: 0,
							scope: null,
						},
					];
		},
		getSession: () => null,
		getLaunch: () => null,
		async getChangeSet(sessionId) {
			return !disposed && sessionId === SESSION_ID ? changeset : null;
		},
		subscribe(sessionId, listener) {
			if (disposed || sessionId !== SESSION_ID) return null;
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		async acceptProposal() {
			return acceptResult;
		},
		async acceptAll() {
			return acceptAllResult;
		},
		async rejectProposal() {
			return rejectResult;
		},
		async undoAccepted() {
			return undoResult;
		},
		async replyToRequest(sessionId) {
			return sessionId === SESSION_ID ? { ok: true, request } : null;
		},
		async addHumanRequest(sessionId) {
			return sessionId === SESSION_ID ? { ok: true, request } : null;
		},
		dispose(sessionId) {
			if (disposed || sessionId !== SESSION_ID) return false;
			for (const listener of [...listeners]) {
				listener({ type: "session-disposed", sessionId });
			}
			disposed = true;
			listeners.clear();
			return true;
		},
		disposeAll() {
			disposed = true;
			listeners.clear();
		},
	};

	return {
		service,
		state,
		createdInputs,
		setCreateResult(result) {
			createResult = result;
		},
		setAcceptResult(result) {
			acceptResult = result;
		},
		setAcceptAllResult(result) {
			acceptAllResult = result;
		},
		setChangeSet(result) {
			changeset = result;
			state.changesetId = result?.id;
		},
		setRejectResult(result) {
			rejectResult = result;
		},
		setUndoResult(result) {
			undoResult = result;
		},
	};
}

function url(path: string): string {
	return `http://localhost${path}`;
}

function post(app: ReturnType<typeof createDocsEditSessionApi>, path: string, body: unknown = {}) {
	return app.handle(
		new Request(url(path), {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

describe("docs-edit session HTTP smoke", () => {
	test("create validates input and maps success plus typed create failures", async () => {
		const fake = fakeService();
		const app = createDocsEditSessionApi(fake.service);

		const invalid = await post(app, "/kernel/docs-edit-sessions", {
			path: "",
			corpus: 42,
			requestIds: [],
		});
		expect(invalid.status).toBe(400);
		expect((await invalid.json()) as unknown).toEqual({
			errors: [
				"path: expected a non-empty string",
				"corpus: expected a string",
				"requestIds: expected at least one id",
			],
		});

		const created = await post(app, "/kernel/docs-edit-sessions", {
			path: fake.state.path,
			instruction: "Work the queue.",
			spawn: false,
		});
		expect(created.status).toBe(201);
		expect(
			((await created.json()) as {
				state: { sessionId: string; corpus: string };
			}).state,
		).toEqual(expect.objectContaining({
			sessionId: SESSION_ID,
			corpus: "docs-system",
		}));
		expect(fake.createdInputs).toEqual([
			expect.objectContaining({
				path: fake.state.path,
				corpus: undefined,
				spawn: false,
			}),
		]);

		const selected = await post(app, "/kernel/docs-edit-sessions", {
			path: fake.state.path,
			corpus: "gamecube-decomp-harness",
			spawn: false,
		});
		expect(selected.status).toBe(201);
		expect(fake.createdInputs.at(-1)).toEqual(
			expect.objectContaining({ corpus: "gamecube-decomp-harness" }),
		);

		fake.setCreateResult({
			ok: false,
			reason: "unknown-corpus",
			corpus: "missing-corpus",
			known: ["docs-system", "gamecube-decomp-harness"],
		});
		const unknownCorpus = await post(app, "/kernel/docs-edit-sessions", {
			path: fake.state.path,
			corpus: "missing-corpus",
		});
		expect(unknownCorpus.status).toBe(400);
		expect(await unknownCorpus.json()).toEqual({
			errors: [
				"corpus: unknown corpus missing-corpus; known: docs-system, gamecube-decomp-harness",
			],
		});

		fake.setCreateResult({
			ok: false,
			reason: "agent-busy",
			path: fake.state.path,
			sessionId: SESSION_ID,
		});
		const busy = await post(app, "/kernel/docs-edit-sessions", {
			path: fake.state.path,
		});
		expect(busy.status).toBe(409);
		expect(((await busy.json()) as { failure: { reason: string } }).failure.reason).toBe(
			"agent-busy",
		);

		fake.setCreateResult({ ok: false, reason: "unknown-doc", path: "missing" });
		const missing = await post(app, "/kernel/docs-edit-sessions", { path: "missing" });
		expect(missing.status).toBe(404);
	});

	test("list, detail, request, reply, and unknown-session route shapes answer", async () => {
		const fake = fakeService();
		const app = createDocsEditSessionApi(fake.service);

		const listing = await app.handle(new Request(url("/kernel/docs-edit-sessions")));
		expect(listing.status).toBe(200);
		expect(
			((await listing.json()) as { sessions: Array<{ corpus: string }> }).sessions,
		).toEqual([expect.objectContaining({ corpus: "docs-system" })]);

		const detail = await app.handle(
			new Request(url(`/kernel/docs-edit-sessions/${SESSION_ID}`)),
		);
		expect(detail.status).toBe(200);
		expect(
			((await detail.json()) as { state: { path: string; corpus: string } }).state,
		).toEqual(expect.objectContaining({
			path: fake.state.path,
			corpus: "docs-system",
		}));

		const added = await post(app, `/kernel/docs-edit-sessions/${SESSION_ID}/requests`, {
			target: { kind: "doc" },
			body: "Tighten everything.",
		});
		expect(added.status).toBe(200);

		const replied = await post(
			app,
			`/kernel/docs-edit-sessions/${SESSION_ID}/requests/R1/replies`,
			{ body: "Keep the example." },
		);
		expect(replied.status).toBe(200);

		const missing = await app.handle(
			new Request(url("/kernel/docs-edit-sessions/no-such-session")),
		);
		expect(missing.status).toBe(404);
	});

	test("change-set passthrough returns the enriched view or 404 when absent", async () => {
		const fake = fakeService();
		const app = createDocsEditSessionApi(fake.service);
		const changeset = changesetFixture();
		fake.setChangeSet(changeset);

		const found = await app.handle(
			new Request(url(`/kernel/docs-edit-sessions/${SESSION_ID}/changeset`)),
		);
		expect(found.status).toBe(200);
		expect(await found.json()).toEqual({ changeset });

		fake.setChangeSet(null);
		const missing = await app.handle(
			new Request(url(`/kernel/docs-edit-sessions/${SESSION_ID}/changeset`)),
		);
		expect(missing.status).toBe(404);
		expect(await missing.json()).toEqual({
			error: `No change-set for docs-edit session ${SESSION_ID}`,
		});
	});

	test("review routes preserve 404/409/400 mappings and typed failures", async () => {
		const fake = fakeService();
		const app = createDocsEditSessionApi(fake.service);

		const early = await post(
			app,
			`/kernel/docs-edit-sessions/${SESSION_ID}/requests/R1/accept`,
		);
		expect(early.status).toBe(409);
		expect(((await early.json()) as { failure: { kind: string } }).failure.kind).toBe(
			"no_staged_proposal",
		);

		fake.setAcceptResult({
			ok: false,
			failure: { kind: "unknown_request", alias: "R9" },
		});
		const unknown = await post(
			app,
			`/kernel/docs-edit-sessions/${SESSION_ID}/requests/R9/accept`,
		);
		expect(unknown.status).toBe(404);

		fake.setRejectResult({
			ok: false,
			failure: { kind: "reject_failed", status: 422, detail: "invalid proposal" },
		});
		const invalid = await post(
			app,
			`/kernel/docs-edit-sessions/${SESSION_ID}/requests/R1/reject`,
			{ note: "No." },
		);
		expect(invalid.status).toBe(400);
		expect(await invalid.json()).toEqual({
			errors: ["invalid proposal"],
			failure: { kind: "reject_failed", status: 422, detail: "invalid proposal" },
		});

		fake.setUndoResult({
			ok: false,
			failure: {
				kind: "undo_failed",
				status: 409,
				detail: "document moved",
				currentHash: "hash-live",
			},
		});
		const stale = await post(
			app,
			`/kernel/docs-edit-sessions/${SESSION_ID}/requests/R1/undo`,
		);
		expect(stale.status).toBe(409);
		expect((await stale.json()) as unknown).toEqual({
			currentHash: "hash-live",
			failure: {
				kind: "undo_failed",
				status: 409,
				detail: "document moved",
				currentHash: "hash-live",
			},
		});
	});

	test("accept-all maps success, rollback conflict, unknown session, and write gate", async () => {
		const fake = fakeService();
		const app = createDocsEditSessionApi(fake.service);

		const accepted = await post(
			app,
			`/kernel/docs-edit-sessions/${SESSION_ID}/accept-all`,
		);
		expect(accepted.status).toBe(200);
		expect(await accepted.json()).toEqual({ ok: true, results: [] });

		fake.setAcceptAllResult({
			ok: false,
			failure: { alias: "R2", status: 409, detail: "stale-proposal" },
			rolledBack: true,
			results: [],
		});
		const rolledBack = await post(
			app,
			`/kernel/docs-edit-sessions/${SESSION_ID}/accept-all`,
		);
		expect(rolledBack.status).toBe(409);
		expect(await rolledBack.json()).toEqual({
			ok: false,
			failure: { alias: "R2", status: 409, detail: "stale-proposal" },
			rolledBack: true,
			results: [],
		});

		fake.setAcceptAllResult(null);
		const missing = await post(
			app,
			`/kernel/docs-edit-sessions/no-such-session/accept-all`,
		);
		expect(missing.status).toBe(404);
		expect(await missing.json()).toEqual({
			error: "Docs-edit session no-such-session not found",
		});

		const readOnlyApp = createDocsEditSessionApi(fake.service, {
			allowWrites: false,
		});
		const forbidden = await post(
			readOnlyApp,
			`/kernel/docs-edit-sessions/${SESSION_ID}/accept-all`,
		);
		expect(forbidden.status).toBe(403);
		expect(await forbidden.json()).toEqual({
			error: "Docs writes are disabled — the kernel is not running in dev mode",
		});
	});

	test("SSE sends the snapshot first and closes after session disposal", async () => {
		const fake = fakeService();
		const app = createDocsEditSessionApi(fake.service);
		const response = await app.handle(
			new Request(url(`/kernel/docs-edit-sessions/${SESSION_ID}/events`)),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("text/event-stream");

		const reader = response.body!.getReader();
		const decoder = new TextDecoder();
		const first = await reader.read();
		expect(decoder.decode(first.value)).toContain(
			`\"type\":\"session-state\",\"sessionId\":\"${SESSION_ID}\"`,
		);

		const disposed = await app.handle(
			new Request(url(`/kernel/docs-edit-sessions/${SESSION_ID}`), {
				method: "DELETE",
			}),
		);
		expect(disposed.status).toBe(200);
		const terminal = await reader.read();
		expect(decoder.decode(terminal.value)).toContain(`\"type\":\"session-disposed\"`);
		expect((await reader.read()).done).toBe(true);
	});
});

describe("docs-edit session tool policy smoke", () => {
	test("docs-lab-editor gets exactly the editing tool surface and docs_write is blocked", () => {
		const binder = () => undefined;
		const launch = { tools: binder } as unknown as LaunchedDocsEditSession;
		enqueueDocsEditLaunch(launch);

		const unrelated = { name: "some-other-agent" } as AgentConfig;
		expect(docsEditSharedTools(unrelated)).toEqual([]);

		const config = {
			name: DOCS_LAB_EDITOR_AGENT_NAME,
			tools: ["docs_write", "docs_check"],
			disallowedTools: ["write"],
		} as AgentConfig;
		expect(docsEditSharedTools(config)).toEqual([binder]);
		expect(config.tools).toEqual([...DOCS_EDIT_TOOL_NAMES]);
		expect(config.tools).toContain("insert_block");
		expect(config.tools).toContain("write_text");
		expect(config.tools).toContain("outline_insert_step");
		expect(config.tools).not.toContain("propose_ops");
		expect(config.tools).not.toContain("docs_write");
		expect(config.disallowedTools).toEqual(["write", "docs_write"]);

		// The launch is single-use: a second docs-lab-editor spawn gets nothing.
		expect(docsEditSharedTools(config)).toEqual([]);
	});
});
