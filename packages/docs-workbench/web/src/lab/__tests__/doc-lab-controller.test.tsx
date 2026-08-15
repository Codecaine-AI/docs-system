import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { AnnotationsDocument } from "@codecaine-ai/docs-model/annotations-schema";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";

import { useDocLabSession } from "../doc-lab-controller";

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
	it("overlays live kernel request statuses by annotation id", async () => {
		const kernelSession = {
			live: () => true,
			statusOverlay: () => new Map([["ann-1", "working"]]),
		} as never;
		const { result } = renderSession({ kernelSession });

		await waitFor(() => expect(result.current.session.requests).toHaveLength(1));
		expect(result.current.session.requests[0]?.status).toBe("working");
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
});
