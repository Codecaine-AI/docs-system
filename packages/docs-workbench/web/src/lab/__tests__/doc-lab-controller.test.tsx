import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { AnnotationsDocument } from "@codecaine-ai/docs-model/annotations-schema";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";

import { useDocLabSession } from "../doc-lab-controller";
import type { DocsKernelSessionSnapshot } from "../docs-kernel-session-source";

const DOC: DocDocument = {
  schemaVersion: 1,
  id: "doc-1",
  title: "Test",
  root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["p1"] },
    p1: { id: "p1", type: "paragraph", props: {}, text: [{ insert: "Hello" }], children: [] },
  },
};

const ANNOTATIONS: AnnotationsDocument = {
  schemaVersion: 1,
  annotations: [
    {
      id: "ann-1",
      target: { kind: "block", blockId: "p1" },
      body: "Rewrite this",
      intent: "agent-request",
      author: "you",
      status: "open",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

type WireProposal = {
  id: string;
  ops: unknown[];
  changedBlockIds: string[];
  summary: string;
  baseHash: string;
  annotationId?: string;
  alias?: string;
  status: "staged" | "accepted" | "rejected";
  createdAt: string;
  stale: boolean;
};

const stagedProposal = (overrides: Partial<WireProposal> = {}): WireProposal => ({
  id: "proposal-1",
  ops: [],
  changedBlockIds: ["p1"],
  summary: "Rewrite paragraph",
  baseHash: "doc-hash",
  annotationId: "ann-1",
  status: "staged",
  createdAt: "2026-01-01T00:01:00.000Z",
  stale: false,
  ...overrides,
});

type RequestCall = { url: string; method: string; body: Record<string, unknown> | null };
let calls: RequestCall[];
let proposals: WireProposal[];
let changesets: Array<Record<string, unknown>>;
let routeOverrides: Array<(call: RequestCall) => Response | undefined>;
let realFetch: typeof fetch;
let realEventSource: typeof EventSource | undefined;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function proposalList() {
  return { proposals, hash: "proposals-hash" };
}

class QuietEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  constructor(_url: string | URL) {}
  close() {}
}

beforeEach(() => {
  calls = [];
  proposals = [];
  changesets = [];
  routeOverrides = [];
  realFetch = globalThis.fetch;
  realEventSource = globalThis.EventSource;
  globalThis.EventSource = QuietEventSource as unknown as typeof EventSource;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    const call = { url, method: init?.method ?? "GET", body };
    calls.push(call);
    for (const override of routeOverrides) {
      const response = override(call);
      if (response) return response;
    }
    if (url.startsWith("api/proposals?") && call.method === "GET") return json(proposalList());
    if (url === "api/changesets" && call.method === "GET") return json({ changesets });
    if (url.endsWith("/reject")) {
      proposals = proposals.map((proposal) =>
        proposal.id === "proposal-1" ? { ...proposal, status: "rejected", stale: false } : proposal,
      );
      return json(proposalList());
    }
    if (url === "api/undo") return json({ ok: true });
    if (url.includes("/replies")) {
      return json({ annotations: ANNOTATIONS, hash: "annotations-hash-2" });
    }
    throw new Error(`Unhandled test request: ${call.method} ${url}`);
  }) as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  if (realEventSource === undefined) delete (globalThis as { EventSource?: typeof EventSource }).EventSource;
  else globalThis.EventSource = realEventSource;
});

function renderSession(overrides: Partial<Parameters<typeof useDocLabSession>[0]> = {}) {
  const refreshBundle = overrides.refreshBundle ?? (() => {});
  return renderHook(() =>
    useDocLabSession({
      path: "guide",
      doc: DOC,
      docHash: "doc-hash",
      annotations: ANNOTATIONS,
      annotationsHash: "annotations-hash",
      refreshBundle,
      ...overrides,
    }),
  );
}

describe("useDocLabSession", () => {
	it("fetches change-sets and overlays the latest kernel event view", async () => {
		changesets = [{
			id: "cs-1", summary: "Move content", status: "open", session_id: "session-1",
			entries: [{ doc_path: "guide", proposal_id: "p-cs", status: "staged", stale: false, summary: "Remove", add_count: 0, del_count: 1 }],
			tree_ops: [], created_at: "2026-01-01T00:00:00.000Z", progress: { accepted: 0, total: 1 },
		}];
		let liveViews = new Map();
		const kernelSession = {
			live: () => true,
			statusOverlay: () => new Map(),
			changesets: () => liveViews,
			sessionId: () => "session-1",
		} as never;
		const { result, rerender } = renderSession({ kernelSession });
		await waitFor(() => expect(result.current.changesets[0]?.summary).toBe("Move content"));
		liveViews = new Map([["cs-1", { ...result.current.changesets[0]!, summary: "Move content now", entries: [{ ...result.current.changesets[0]!.entries[0]!, addCount: 2 }] }]]);
		rerender();
		expect(result.current.changesets[0]?.summary).toBe("Move content now");
		expect(result.current.changesets[0]?.entries[0]?.addCount).toBe(2);
	});

	it("tracks accept busy state through the applied refetch and records failures", async () => {
		changesets = [{
			id: "cs-1", summary: "Move content", status: "open",
			entries: [{ doc_path: "guide", proposal_id: "p-cs", status: "staged", stale: false, summary: "Remove", add_count: 0, del_count: 1 }],
			tree_ops: [], created_at: "2026-01-01T00:00:00.000Z", progress: { accepted: 0, total: 1 },
		}];
		let releaseAccept!: () => void;
		const accepting = new Promise<void>((resolve) => { releaseAccept = resolve; });
		routeOverrides.push((call) => {
			if (call.url !== "api/changesets/cs-1/accept") return;
			return new Response(new ReadableStream({ async start(controller) {
				await accepting;
				changesets = [{ ...changesets[0]!, status: "applied", compound_patch_id: "patch-cs", resolved_at: "2026-01-01T00:01:00.000Z" }];
				controller.enqueue(new TextEncoder().encode(JSON.stringify({ changeset: changesets[0] })));
				controller.close();
			} }), { headers: { "Content-Type": "application/json" } });
		});
		const { result } = renderSession();
		await waitFor(() => expect(result.current.changesets).toHaveLength(1));
		let action!: Promise<void>;
		act(() => { action = result.current.acceptChangeset("cs-1"); });
		await waitFor(() => expect(result.current.changesetBusy["cs-1"]).toBe("accepting"));
		releaseAccept();
		await act(async () => { await action; });
		expect(result.current.changesetBusy["cs-1"]).toBeUndefined();
		expect(result.current.changesets[0]?.status).toBe("applied");
		expect(calls.find((call) => call.url.endsWith("/accept"))?.body).toEqual({ session_id: expect.any(String) });

		routeOverrides.unshift((call) => call.url.endsWith("/accept") ? json({ detail: "rollback complete" }, 409) : undefined);
		changesets = [{ ...changesets[0]!, status: "open", compound_patch_id: undefined, resolved_at: undefined }];
		await act(async () => { await result.current.refetchChangesets(); });
		await act(async () => { await result.current.acceptChangeset("cs-1"); });
		expect(result.current.changesetErrors["cs-1"]).toBe(
			"This change-set is no longer open — refresh to see its current status.",
		);
		expect(result.current.changesets[0]?.status).toBe("open");
	});

	it("overlays live kernel request statuses by annotation id", async () => {
		const kernelSession = {
			live: () => true,
			statusOverlay: () => new Map([["ann-1", "working"]]),
		} as never;
		const { result } = renderSession({ kernelSession });

		await waitFor(() => expect(result.current.session.requests).toHaveLength(1));
		expect(result.current.session.requests[0]?.status).toBe("working");
	});

	it("optimistically overlays submitted requests while the kernel session starts", async () => {
		const kernelSession = {
			live: () => false,
			statusOverlay: () => new Map([["ann-1", "working"]]),
		} as never;
		const kernelSnapshot: DocsKernelSessionSnapshot = {
			live: false,
			starting: true,
			state: null,
			statusOverlay: new Map([["ann-1", "working" as const]]),
			changesets: new Map(),
		};
		const { result } = renderSession({
			kernelSession,
			kernelSnapshot,
			onApplyQueue: async () => {},
		});

		await waitFor(() => expect(result.current.session.requests).toHaveLength(1));
		expect(result.current.session.requests[0]?.status).toBe("working");
		expect(result.current.applying).toBe(true);
		expect(result.current.agentStatus).toBe("running");
	});

	it("derives connected, running, and settled controller state from the snapshot", async () => {
		const idleSnapshot: DocsKernelSessionSnapshot = {
			live: false,
			starting: false,
			state: null,
			statusOverlay: new Map(),
			changesets: new Map(),
		};
		const options: Partial<Parameters<typeof useDocLabSession>[0]> = {
			onApplyQueue: async () => {},
			kernelSnapshot: idleSnapshot,
		};
		const { result, rerender } = renderSession(options);
		await waitFor(() => expect(result.current.session.requests).toHaveLength(1));
		expect(result.current.applying).toBe(false);
		expect(result.current.agentStatus).toBe("connected");

		options.kernelSnapshot = {
			...idleSnapshot,
			live: true,
			state: {
				sessionId: "session-1",
				path: "guide",
				docId: "doc-1",
				baseHash: "hash-1",
				currentHash: "hash-1",
				status: "running" as const,
				createdAt: "2026-01-01T00:00:00.000Z",
				scope: ["ann-1"],
				requests: [],
				proposals: [],
				nextAcceptAlias: null,
				undoableAlias: null,
				skipped: [],
				agent: {
					spawned: true,
					running: true,
					turns: 1,
					rerunPending: false,
				},
			},
		};
		rerender();
		expect(result.current.applying).toBe(true);
		expect(result.current.agentStatus).toBe("running");

		options.kernelSnapshot = {
			...options.kernelSnapshot,
			state: {
				...options.kernelSnapshot.state!,
				status: "completed",
				agent: {
					...options.kernelSnapshot.state!.agent,
					running: false,
				},
			},
		};
		rerender();
		expect(result.current.applying).toBe(false);
		expect(result.current.agentStatus).toBe("connected");
	});

	it("keeps the static projection when the kernel session is not live", async () => {
		proposals = [stagedProposal()];
		const kernelSession = {
			live: () => false,
			statusOverlay: () => new Map([["ann-1", "working"]]),
		} as never;
		const { result } = renderSession({ kernelSession });

		await waitFor(() => expect(result.current.session.proposals).toHaveLength(1));
		expect(result.current.session.requests[0]?.status).toBe("ready");
	});

  it("populates session proposals from the initial fetch", async () => {
    proposals = [stagedProposal()];
    const { result } = renderSession();

    await waitFor(() => expect(result.current.session.proposals).toHaveLength(1));
    expect(result.current.session.proposals[0]).toMatchObject({
      transactionId: "proposal-1",
      alias: "R1",
      summary: "Rewrite paragraph",
    });
  });

  it("accepts a proposal, applies the returned doc, and makes it undoable", async () => {
    proposals = [stagedProposal()];
    let applied: [DocDocument, string] | undefined;
    let refreshes = 0;
    routeOverrides.push((call) => {
      if (!call.url.endsWith("/accept")) return;
      proposals = [{ ...proposals[0]!, status: "accepted" }];
      return json({
        proposal: proposals[0],
        ...proposalList(),
        doc: DOC,
        doc_hash: "doc-hash-2",
        patch_id: "patch-1",
      });
    });
    const { result } = renderSession({
      refreshBundle: () => { refreshes += 1; },
      onDocApplied: (doc, hash) => { applied = [doc, hash]; },
    });
    await waitFor(() => expect(result.current.session.proposals).toHaveLength(1));

    await act(async () => { await result.current.session.onAccept?.("R1"); });

    expect(result.current.session.undoableAlias).toBe("R1");
    expect(applied).toEqual([DOC, "doc-hash-2"]);
    expect(refreshes).toBe(1);
    expect(calls.find((call) => call.url.endsWith("/accept"))?.body).toMatchObject({
      path: "guide",
      expected_hash: "proposals-hash",
    });
  });

  it("surfaces stale accepts and refetches proposals", async () => {
    proposals = [stagedProposal()];
    routeOverrides.push((call) =>
      call.url.endsWith("/accept") ? json({ detail: "stale-proposal" }, 409) : undefined,
    );
    const { result } = renderSession();
    await waitFor(() => expect(result.current.session.proposals).toHaveLength(1));

    await act(async () => { await result.current.session.onAccept?.("R1"); });

    expect(result.current.requestErrors.R1).toBe(
      "Proposal is stale — the document changed underneath it.",
    );
    expect(calls.filter((call) => call.url.startsWith("api/proposals?")).length).toBe(2);
  });

  it("targets a live kernel accept by transaction id", async () => {
    proposals = [stagedProposal()];
    const accepts: Array<[string, string | undefined]> = [];
    const kernelSession = {
      live: () => true,
      accept: async (annotationId: string, proposalId?: string) => {
        accepts.push([annotationId, proposalId]);
        return { ok: true };
      },
      statusOverlay: () => new Map(),
      changesets: () => new Map(),
      sessionId: () => "session-1",
    } as never;
    const { result } = renderSession({ kernelSession });
    await waitFor(() => expect(result.current.session.proposals).toHaveLength(1));

    await act(async () => {
      await result.current.session.onAccept?.("R1", "proposal-1");
    });

    expect(accepts).toEqual([["ann-1", "proposal-1"]]);
  });

  it("rejects the staged proposal and refreshes the bundle", async () => {
    proposals = [stagedProposal()];
    let refreshes = 0;
    const { result } = renderSession({ refreshBundle: () => { refreshes += 1; } });
    await waitFor(() => expect(result.current.session.proposals).toHaveLength(1));

    await act(async () => { await result.current.session.onReject?.("R1"); });

    expect(result.current.session.proposals).toHaveLength(0);
    expect(refreshes).toBe(1);
    expect(calls.find((call) => call.url.endsWith("/reject"))?.body).toMatchObject({ path: "guide" });
  });

  it("sends reject feedback through a live kernel session and refetches proposals", async () => {
    proposals = [stagedProposal()];
    const replies: Array<[string, string]> = [];
    const kernelSession = {
      live: () => true,
      reply: async (annotationId: string, note: string) => {
        replies.push([annotationId, note]);
        return { ok: true };
      },
      statusOverlay: () => new Map(),
      changesets: () => new Map(),
      sessionId: () => "session-1",
    } as never;
    const { result } = renderSession({ kernelSession });
    await waitFor(() => expect(result.current.session.proposals).toHaveLength(1));

    await act(async () => {
      await result.current.session.onRejectWithFeedback?.("R1", "Keep the opening sentence");
    });

    expect(replies).toEqual([["ann-1", "Keep the opening sentence"]]);
    expect(calls.filter((call) => call.url.startsWith("api/proposals?")).length).toBe(2);
  });

  it("rejects without resolving the annotation before adding fallback feedback", async () => {
    proposals = [stagedProposal()];
    const { result } = renderSession();
    await waitFor(() => expect(result.current.session.proposals).toHaveLength(1));

    await act(async () => {
      await result.current.session.onRejectWithFeedback?.("R1", "Use a concrete example");
    });

    expect(calls.find((call) => call.url.endsWith("/reject"))?.body).toMatchObject({
      path: "guide",
      resolve_annotation: false,
    });
    expect(calls.find((call) => call.url.includes("ann-1/replies"))?.body).toMatchObject({
      path: "guide",
      body: "Use a concrete example",
      expected_hash: "annotations-hash",
    });
  });

  it("undoes the most recently accepted proposal", async () => {
    proposals = [stagedProposal()];
    routeOverrides.push((call) => {
      if (!call.url.endsWith("/accept")) return;
      proposals = [];
      return json({ proposal: stagedProposal({ status: "accepted" }), ...proposalList(), doc: DOC, doc_hash: "doc-hash-2", patch_id: "patch-1" });
    });
    let refreshes = 0;
    const { result } = renderSession({ refreshBundle: () => { refreshes += 1; } });
    await waitFor(() => expect(result.current.session.proposals).toHaveLength(1));
    await act(async () => { await result.current.session.onAccept?.("R1"); });

    await act(async () => { await result.current.session.onUndo?.("R1"); });

    expect(result.current.session.undoableAlias).toBeUndefined();
    expect(calls.find((call) => call.url === "api/undo")?.body).toEqual({ patch_id: "patch-1" });
    expect(refreshes).toBe(2);
    expect(calls.filter((call) => call.url.startsWith("api/proposals?")).length).toBe(3);
  });

  it("round-trips document-level filing through a root-block annotation", async () => {
    routeOverrides.push((call) => {
      if (call.url !== "api/annotations") return;
      const annotation = {
        id: "ann-global",
        target: { kind: "block" as const, blockId: DOC.root },
        body: "Rewrite everything",
        intent: "agent-request" as const,
        author: "you",
        status: "open" as const,
        createdAt: "2026-01-01T00:02:00.000Z",
      };
      return json({
        annotation,
        annotations: { schemaVersion: 1, annotations: [annotation] },
        hash: "annotations-hash-2",
      });
    });
    const emptyAnnotations: AnnotationsDocument = { schemaVersion: 1, annotations: [] };
    const filedAnnotations: AnnotationsDocument = {
      schemaVersion: 1,
      annotations: [{
        id: "ann-global",
        target: { kind: "block", blockId: DOC.root },
        body: "Rewrite everything",
        intent: "agent-request",
        author: "you",
        status: "open",
        createdAt: "2026-01-01T00:02:00.000Z",
      }],
    };
    const { result, rerender } = renderHook(
      ({ annotations }: { annotations: AnnotationsDocument }) => useDocLabSession({
        path: "guide",
        doc: DOC,
        docHash: "doc-hash",
        annotations,
        annotationsHash: "annotations-hash",
        refreshBundle: () => {},
      }),
      { initialProps: { annotations: emptyAnnotations } },
    );
    await waitFor(() => expect(result.current.proposalsError).toBeNull());

    await act(async () => {
      await result.current.session.onFileRequest?.({
        annotationId: "draft",
        disposition: "global",
        target: { kind: "doc" },
        body: "Rewrite everything",
      });
    });

    expect(calls.find((call) => call.url === "api/annotations")?.body).toMatchObject({
      target: { kind: "block", blockId: DOC.root },
      body: "Rewrite everything",
      intent: "agent-request",
    });

    rerender({ annotations: filedAnnotations });
    expect(result.current.session.requests).toEqual([
      expect.objectContaining({
        annotationId: "ann-global",
        alias: "R1",
        target: { kind: "doc" },
        disposition: "global",
        targetChanged: false,
      }),
    ]);
  });

  it("adds a reply using the linked annotation and refreshes the bundle", async () => {
    let refreshes = 0;
    const { result } = renderSession({ refreshBundle: () => { refreshes += 1; } });
    await waitFor(() => expect(result.current.session.requests).toHaveLength(1));

    await act(async () => { await result.current.session.onReplyToRequest?.("R1", "Please keep it short"); });

    expect(calls.find((call) => call.url.includes("/replies"))?.body).toMatchObject({
      path: "guide",
      body: "Please keep it short",
      expected_hash: "annotations-hash",
    });
    expect(calls.some((call) => call.url.includes("ann-1/replies"))).toBe(true);
    expect(refreshes).toBe(1);
  });

  it("dismisses a request by resolving its annotation and refetching", async () => {
    let refreshes = 0;
    routeOverrides.push((call) => {
      if (call.url !== "api/annotations/ann-1/resolve") return;
      return json({ annotations: ANNOTATIONS, hash: "annotations-hash-2" });
    });
    const { result } = renderSession({ refreshBundle: () => { refreshes += 1; } });
    await waitFor(() => expect(result.current.session.requests).toHaveLength(1));

    await act(async () => { await result.current.session.onDismissRequest?.("ann-1"); });

    expect(calls.find((call) => call.url === "api/annotations/ann-1/resolve")?.body).toMatchObject({
      path: "guide",
      response: "Dismissed from the queue.",
    });
    expect(refreshes).toBe(1);
    expect(calls.filter((call) => call.url.startsWith("api/proposals?")).length).toBe(2);
    expect(result.current.requestErrors.R1).toBeUndefined();
  });

  it("blocks dismissing a request held by a live kernel session", async () => {
    const kernelSession = {
      live: () => true,
      statusOverlay: () => new Map([["ann-1", "working"]]),
    } as never;
    const { result } = renderSession({ kernelSession });
    await waitFor(() => expect(result.current.session.requests).toHaveLength(1));

    await act(async () => { await result.current.session.onDismissRequest?.("ann-1"); });

    expect(result.current.requestErrors.R1).toBe(
      "This note is part of the running session — it can't be removed right now.",
    );
    expect(calls.some((call) => call.url.includes("/resolve"))).toBe(false);
  });
});
