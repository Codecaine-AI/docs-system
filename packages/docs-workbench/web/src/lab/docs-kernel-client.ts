import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";

export type DocsEditRequestStatus =
  | "open"
  | "working"
  | "waiting"
  | "ready"
  | "applied"
  | "declined"
  | "resolved"
  | "failed";

export type DocsEditTarget =
  | { kind: "doc" }
  | { kind: "block"; blockId: string; fingerprint?: string }
  | {
      kind: "text-range";
      blockId: string;
      start: number;
      end: number;
      quote: string;
      fingerprint?: string;
    };

export interface DocsEditRequestState {
  alias: string;
  annotationId: string;
  target: DocsEditTarget;
  disposition: "batch" | "global";
  body: string;
  author: "human" | "agent" | "system";
  replies: Array<{ author: "human" | "agent" | "system"; body: string; createdAt?: string }>;
  status: DocsEditRequestStatus;
  waitingOnHuman: boolean;
  note?: string;
  proposalId?: string;
  review: DocsEditReviewStatus;
}

export type DocsEditReviewStatus = "pending" | "applied" | "rejected" | "undone";

export interface DocsEditProposalState {
  proposalId: string;
  requestAlias: string;
  baseHash: string;
  ops: DocOp[];
  changedBlockIds: string[];
  summary: string;
  createdAt: string;
  review: DocsEditReviewStatus;
  patchId?: string;
  supersededProposalIds?: string[];
  docPath?: string;
}

export interface DocsEditSessionState {
  sessionId: string;
  path: string;
  docId: string;
  baseHash: string;
  currentHash: string;
  status: "running" | "completed";
  instruction?: string;
  createdAt: string;
  scope: string[] | null;
  touchedDocPaths?: string[];
  requests: DocsEditRequestState[];
  proposals: DocsEditProposalState[];
  nextAcceptAlias: string | null;
  undoableAlias: string | null;
  skipped: unknown[];
  agent: {
    spawned: boolean;
    error?: string;
    running: boolean;
    turns: number;
    rerunPending: boolean;
  };
}

export interface DocsEditSessionSummary {
  sessionId: string;
  path: string;
  docId: string;
  status: "running" | "completed";
  createdAt: string;
  baseHash: string;
  currentHash: string;
  requestCount: number;
  proposalCount: number;
  appliedCount: number;
  scope: string[] | null;
}

export type DocsEditSessionStreamEvent =
  | { type: "session-state"; sessionId: string; state: DocsEditSessionState }
  | { type: "session-disposed"; sessionId: string }
  | { type: "request-updated"; sessionId: string; request: DocsEditRequestState }
  | { type: "thread-updated"; sessionId: string; alias: string; request: DocsEditRequestState }
  | { type: "proposal-staged"; sessionId: string; proposal: Omit<DocsEditProposalState, "review"> }
  | { type: "session-status"; sessionId: string; status: "running" | "completed" }
  | { type: "proposal-applied"; sessionId: string; alias: string; proposalId: string; patchId: string; hash: string }
  | { type: "proposal-rejected"; sessionId: string; alias: string; proposalId: string; note?: string }
  | { type: "proposal-undone"; sessionId: string; alias: string; proposalId: string; patchId: string; hash: string }
  | { type: "agent-turn"; sessionId: string; phase: "started" | "finished" | "failed"; turn: number; aliases: string[]; error?: string };

export type DocsKernelFailurePayload = Record<string, unknown> & {
  reason?: string;
  kind?: string;
};

export interface DocsKernelClientFailure {
  ok: false;
  status: number;
  errors: string[];
  failure?: DocsKernelFailurePayload;
  currentHash?: string | null;
  offline?: true;
}

export type DocsKernelClientResult<T> = T | DocsKernelClientFailure;

export function isFailure<T>(result: DocsKernelClientResult<T>): result is DocsKernelClientFailure {
  return typeof result === "object" && result !== null && "ok" in result && result.ok === false;
}

export interface CreateDocsEditSessionInput {
  path: string;
  instruction?: string;
  requestIds?: string[];
  extraRequests?: Array<{ target: DocsEditTarget; body: string; id?: string; author?: "human" }>;
  sessionId?: string;
  spawn?: boolean;
}

export type DocsEditReviewSuccess = {
  ok: true;
  alias: string;
  proposalId: string;
  patchId?: string;
  hash?: string;
  request?: DocsEditRequestState;
  annotation?: { annotationId: string; attached: boolean; resolved: boolean; detail?: string };
};

export interface DocsKernelClient {
  health(): Promise<boolean>;
  createSession(input: CreateDocsEditSessionInput): Promise<DocsKernelClientResult<{ state: DocsEditSessionState }>>;
  getSession(id: string): Promise<DocsKernelClientResult<{ state: DocsEditSessionState }>>;
  listSessions(): Promise<DocsKernelClientResult<{ sessions: DocsEditSessionSummary[] }>>;
  subscribeSessionEvents(id: string, onEvent: (event: DocsEditSessionStreamEvent) => void, onError?: (error: Error) => void): () => void;
  acceptProposal(id: string, alias: string): Promise<DocsKernelClientResult<DocsEditReviewSuccess>>;
  rejectProposal(id: string, alias: string, note?: string): Promise<DocsKernelClientResult<DocsEditReviewSuccess>>;
  undoProposal(id: string, alias: string): Promise<DocsKernelClientResult<DocsEditReviewSuccess>>;
  replyToRequest(id: string, alias: string, body: string): Promise<DocsKernelClientResult<{ ok: true; request: DocsEditRequestState }>>;
  addRequest(id: string, input: { target: DocsEditTarget; body: string }): Promise<DocsKernelClientResult<{ ok: true; request: DocsEditRequestState }>>;
  disposeSession(id: string): Promise<DocsKernelClientResult<{ ok: true }>>;
}

export interface CreateDocsKernelClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function offlineFailure(): DocsKernelClientFailure {
  return { ok: false, status: 0, errors: ["docs agent not connected"], offline: true };
}

async function toFailure(response: Response): Promise<DocsKernelClientFailure> {
  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    // A status fallback below still gives callers a useful error.
  }
  const errors = Array.isArray(body.errors)
    ? body.errors.filter((error): error is string => typeof error === "string")
    : [];
  if (typeof body.error === "string") errors.push(body.error);
  if (errors.length === 0) errors.push(`Request failed (${response.status})`);
  return {
    ok: false,
    status: response.status,
    errors,
    ...(body.failure && typeof body.failure === "object"
      ? { failure: body.failure as DocsKernelFailurePayload }
      : {}),
    ...(typeof body.currentHash === "string" || body.currentHash === null
      ? { currentHash: body.currentHash as string | null }
      : {}),
  };
}

export function feedDocsKernelSseChunk(
  buffer: string,
  emit: (event: DocsEditSessionStreamEvent) => void,
): string {
  let rest = buffer;
  for (;;) {
    const match = /\r?\n\r?\n/.exec(rest);
    if (!match || match.index === undefined) return rest;
    const frame = rest.slice(0, match.index);
    rest = rest.slice(match.index + match[0].length);
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    try {
      emit(JSON.parse(data) as DocsEditSessionStreamEvent);
    } catch {
      // Ignore a malformed frame without dropping the stream.
    }
  }
}

export function createDocsKernelClient(options: CreateDocsKernelClientOptions = {}): DocsKernelClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? "http://127.0.0.1:4840").replace(/\/$/, "");
  const sessionsPath = "/kernel/docs-edit-sessions";
  const url = (path: string) => `${baseUrl}${path}`;
  const sessionPath = (id: string) => `${sessionsPath}/${encodeURIComponent(id)}`;
  const requestPath = (id: string, alias: string) =>
    `${sessionPath(id)}/requests/${encodeURIComponent(alias)}`;

  async function request<T>(path: string, init?: RequestInit): Promise<DocsKernelClientResult<T>> {
    try {
      const response = await fetchImpl(url(path), init);
      if (!response.ok) return toFailure(response);
      return (await response.json()) as T;
    } catch {
      return offlineFailure();
    }
  }

  const post = <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });

  return {
    async health() {
      try {
        return (await fetchImpl(url("/health"))).ok;
      } catch {
        return false;
      }
    },
    createSession: (input) => post(sessionsPath, input),
    getSession: (id) => request(sessionPath(id)),
    listSessions: () => request(sessionsPath),
    acceptProposal: (id, alias) => post(`${requestPath(id, alias)}/accept`),
    rejectProposal: (id, alias, note) => post(`${requestPath(id, alias)}/reject`, note === undefined ? {} : { note }),
    undoProposal: (id, alias) => post(`${requestPath(id, alias)}/undo`),
    replyToRequest: (id, alias, body) => post(`${requestPath(id, alias)}/replies`, { body }),
    addRequest: (id, input) => post(`${sessionPath(id)}/requests`, input),
    disposeSession: (id) => request(sessionPath(id), { method: "DELETE" }),
    subscribeSessionEvents(id, onEvent, onError) {
      const streamUrl = url(`${sessionPath(id)}/events`);
      let stopped = false;
      let disposed = false;
      const deliver = (event: DocsEditSessionStreamEvent) => {
        if (stopped) return;
        onEvent(event);
        if (event.type === "session-disposed") disposed = true;
      };

      if (typeof EventSource !== "undefined") {
        const source = new EventSource(streamUrl);
        source.onmessage = (message) => {
          try {
            deliver(JSON.parse(String(message.data)) as DocsEditSessionStreamEvent);
            if (disposed) source.close();
          } catch {
            // Ignore malformed frames.
          }
        };
        source.onerror = () => {
          source.close();
          if (!stopped && !disposed) onError?.(new Error("docs edit session stream dropped"));
        };
        return () => {
          stopped = true;
          source.close();
        };
      }

      const controller = new AbortController();
      let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      void (async () => {
        try {
          const response = await fetchImpl(streamUrl, {
            signal: controller.signal,
            headers: { Accept: "text/event-stream" },
          });
          if (!response.ok || !response.body) throw new Error(`event stream failed (${response.status})`);
          activeReader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { done, value } = await activeReader.read();
            if (done) break;
            buffer += typeof value === "string" ? value : decoder.decode(value, { stream: true });
            buffer = feedDocsKernelSseChunk(buffer, deliver);
            if (disposed) {
              await activeReader.cancel().catch(() => {});
              return;
            }
          }
          if (!stopped && !disposed) throw new Error("docs edit session stream dropped");
        } catch (cause) {
          if (stopped || disposed || controller.signal.aborted) return;
          onError?.(cause instanceof Error ? cause : new Error(String(cause)));
        }
      })();
      return () => {
        stopped = true;
        controller.abort();
        void activeReader?.cancel().catch(() => {});
      };
    },
  };
}
