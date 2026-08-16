/**
 * Host lifecycle/review service for docs-edit sessions.
 *
 * Unlike prompt transactions, DocProposals do not chain on an in-memory
 * working document: reject may consume any pending proposal. Accept still
 * follows staging order for predictable review. A stale accept re-stages the
 * same DocOps against the current document before applying. Undo uses the
 * in-process docs-server ledger and leaves the annotation resolved.
 */
import {
  acceptBundleProposal,
  loadDocBundle,
  normalizeBundlePath,
  rejectBundleProposal,
  resolveBundleAnnotation,
  stageBundleProposal,
  undo_patch,
} from "@codecaine-ai/docs-server";

import type { SkippedDocsAnnotation } from "./from-annotations";
import {
  launchDocsEditSession,
  relaunchDocsEditSession,
  type LaunchedDocsEditSession,
  type LaunchDocsEditSessionFailure,
} from "./launch";
import type { DocsEditSession, DocsEditSimpleResult } from "./session";
import type {
  DocsEditProposal,
  DocsEditRequestAuthor,
  DocsEditRequestEntry,
  DocsEditRequestInput,
  DocsEditSessionEvent,
  DocsEditSessionStatus,
  DocsEditTarget,
  DocsEditThreadReply,
} from "./types";

export type DocsEditReviewStatus = "pending" | "applied" | "rejected" | "undone";

export interface DocsEditSessionRequestState {
  alias: string;
  annotationId: string;
  target: DocsEditTarget;
  disposition: DocsEditRequestEntry["disposition"];
  body: string;
  author: DocsEditRequestAuthor;
  replies: DocsEditThreadReply[];
  status: DocsEditRequestEntry["status"];
  waitingOnHuman: boolean;
  note?: string;
  proposalId?: string;
  review: DocsEditReviewStatus;
}

export interface DocsEditSessionProposalState {
  proposalId: string;
  requestAlias: string;
  /** Always emitted; optional on the wire for compatibility with old clients. */
  docPath?: string;
  baseHash: string;
  ops: DocsEditProposal["ops"];
  changedBlockIds: string[];
  summary: string;
  createdAt: string;
  review: DocsEditReviewStatus;
  patchId?: string;
  supersededProposalIds?: string[];
}

export interface DocsEditSessionAgentState {
  spawned: boolean;
  error?: string;
  running: boolean;
  turns: number;
  rerunPending: boolean;
}

export interface DocsEditSessionState {
  sessionId: string;
  path: string;
  docId: string;
  baseHash: string;
  currentHash: string;
  status: DocsEditSessionStatus;
  instruction?: string;
  createdAt: string;
  scope: string[] | null;
  touchedDocPaths: string[];
  requests: DocsEditSessionRequestState[];
  proposals: DocsEditSessionProposalState[];
  nextAcceptAlias: string | null;
  undoableAlias: string | null;
  skipped: SkippedDocsAnnotation[];
  agent: DocsEditSessionAgentState;
}

export interface DocsEditSessionSummary {
  sessionId: string;
  path: string;
  docId: string;
  status: DocsEditSessionStatus;
  createdAt: string;
  baseHash: string;
  currentHash: string;
  requestCount: number;
  proposalCount: number;
  appliedCount: number;
  scope: string[] | null;
}

export type DocsEditSessionStreamEvent =
  | DocsEditSessionEvent
  | { type: "session-state"; sessionId: string; state: DocsEditSessionState }
  | { type: "session-disposed"; sessionId: string };
export type DocsEditSessionStreamListener = (event: DocsEditSessionStreamEvent) => void;

export interface DocsEditAnnotationOutcome {
  annotationId: string;
  attached: boolean;
  resolved: boolean;
  detail?: string;
}

export type AcceptDocsEditProposalFailure =
  | { kind: "writes_disabled" }
  | { kind: "unknown_request"; alias: string }
  | { kind: "no_staged_proposal"; alias: string }
  | { kind: "already_applied"; alias: string }
  | { kind: "out_of_order"; alias: string; nextAlias: string }
  | { kind: "apply_failure"; status: number; detail: string; currentHash?: string; issues?: unknown };

export type AcceptDocsEditProposalResult =
  | {
      ok: true;
      alias: string;
      proposalId: string;
      patchId: string;
      hash: string;
      annotation: DocsEditAnnotationOutcome;
    }
  | { ok: false; failure: AcceptDocsEditProposalFailure };

export type DocsEditAcceptAllProposalResult =
  | {
      ok: true;
      alias: string;
      docPath: string;
      proposalId: string;
      patchId: string;
      hash: string;
      annotation: DocsEditAnnotationOutcome;
      /** Present when the apply succeeded but was reversed after a later failure. */
      rolledBack?: true;
    }
  | {
      ok: false;
      alias: string;
      docPath: string;
      proposalId: string;
      status: number;
      detail: string;
      currentHash?: string;
    };

export type DocsEditAcceptAllResult =
  | {
      ok: true;
      results: Array<Extract<DocsEditAcceptAllProposalResult, { ok: true }>>;
    }
  | {
      ok: false;
      failure: { alias: string; status: number; detail: string };
      rolledBack: true;
      results: DocsEditAcceptAllProposalResult[];
    };

export type RejectDocsEditProposalFailure =
  | { kind: "writes_disabled" }
  | { kind: "unknown_request"; alias: string }
  | { kind: "no_staged_proposal"; alias: string }
  | { kind: "already_applied"; alias: string }
  | { kind: "reject_failed"; status: number; detail: string; currentHash?: string };

export type RejectDocsEditProposalResult =
  | { ok: true; alias: string; proposalId: string; request: DocsEditRequestEntry; annotation: DocsEditAnnotationOutcome }
  | { ok: false; failure: RejectDocsEditProposalFailure };

export type UndoAcceptedDocsProposalFailure =
  | { kind: "writes_disabled" }
  | { kind: "unknown_request"; alias: string }
  | { kind: "not_applied"; alias: string }
  | { kind: "not_latest_applied"; alias: string; lastAppliedAlias: string }
  | { kind: "undo_failed"; status: number; detail: string; currentHash?: string };

export type UndoAcceptedDocsProposalResult =
  | { ok: true; alias: string; proposalId: string; patchId: string; hash: string }
  | { ok: false; failure: UndoAcceptedDocsProposalFailure };

export interface CreateDocsEditSessionInput {
  path: string;
  instruction?: string;
  requestIds?: readonly string[];
  extraRequests?: DocsEditRequestInput[];
  sessionId?: string;
  spawn?: boolean;
}

export type CreateDocsEditSessionFailure =
  | LaunchDocsEditSessionFailure
  | { ok: false; reason: "agent-busy"; path: string; sessionId: string };
export type CreateDocsEditSessionResult =
  | { ok: true; state: DocsEditSessionState }
  | CreateDocsEditSessionFailure;

export interface DocsEditSessionService {
  readonly allowWrites: boolean;
  createSession(input: CreateDocsEditSessionInput): Promise<CreateDocsEditSessionResult>;
  getState(sessionId: string): DocsEditSessionState | null;
  list(): DocsEditSessionSummary[];
  getSession(sessionId: string): DocsEditSession | null;
  getLaunch(sessionId: string): LaunchedDocsEditSession | null;
  subscribe(sessionId: string, listener: DocsEditSessionStreamListener): (() => void) | null;
  acceptProposal(sessionId: string, alias: string): Promise<AcceptDocsEditProposalResult | null>;
  acceptAll(sessionId: string): Promise<DocsEditAcceptAllResult | null>;
  rejectProposal(sessionId: string, alias: string, note?: string): Promise<RejectDocsEditProposalResult | null>;
  undoAccepted(sessionId: string, alias: string): Promise<UndoAcceptedDocsProposalResult | null>;
  replyToRequest(sessionId: string, alias: string, body: string): Promise<DocsEditSimpleResult | null>;
  addHumanRequest(sessionId: string, input: { id?: string; target: DocsEditTarget; body: string; author?: DocsEditRequestAuthor }): Promise<DocsEditSimpleResult | null>;
  dispose(sessionId: string): boolean;
  disposeAll(): void;
}

export interface CreateDocsEditSessionServiceOptions {
  docsRoot: string;
  spawnAgent?: (launch: LaunchedDocsEditSession) => void | Promise<void>;
  allowWrites?: boolean;
  now?: () => string;
}

interface AppliedRecord {
  alias: string;
  docPath: string;
  proposalId: string;
  patchId: string;
}

interface ManagedSession {
  session: DocsEditSession;
  launch: LaunchedDocsEditSession;
  normalizedPath: string;
  touchedDocPaths: Set<string>;
  createdAt: string;
  currentHash: string;
  review: Map<string, DocsEditReviewStatus>;
  applied: AppliedRecord[];
  listeners: Set<DocsEditSessionStreamListener>;
  unsubscribeSession: () => void;
  agent: DocsEditSessionAgentState;
  spawnEnabled: boolean;
  pendingRerunAliases: Set<string>;
  disposed: boolean;
}

export function createDocsEditSessionService(
  options: CreateDocsEditSessionServiceOptions,
): DocsEditSessionService {
  const allowWrites = options.allowWrites ?? true;
  const now = options.now ?? (() => new Date().toISOString());
  const sessions = new Map<string, ManagedSession>();

  const emit = (managed: ManagedSession, event: DocsEditSessionStreamEvent) => {
    for (const listener of [...managed.listeners]) listener(event);
  };

  function requestState(managed: ManagedSession, entry: DocsEditRequestEntry): DocsEditSessionRequestState {
    return {
      alias: entry.alias,
      annotationId: entry.annotationId,
      target: entry.target,
      disposition: entry.disposition,
      body: entry.body,
      author: entry.author,
      replies: [...entry.replies],
      status: entry.status,
      waitingOnHuman: entry.waitingOnHuman,
      ...(entry.note !== undefined ? { note: entry.note } : {}),
      ...(entry.proposalId !== undefined ? { proposalId: entry.proposalId } : {}),
      review: managed.review.get(entry.alias) ?? "pending",
    };
  }

  function proposalState(managed: ManagedSession, proposal: DocsEditProposal): DocsEditSessionProposalState {
    return {
      proposalId: proposal.proposalId,
      requestAlias: proposal.requestAlias,
      docPath: proposal.docPath,
      baseHash: proposal.baseHash,
      ops: proposal.ops,
      changedBlockIds: proposal.changedBlockIds,
      summary: proposal.summary,
      createdAt: proposal.createdAt,
      review: managed.review.get(proposal.requestAlias) ?? "pending",
      ...(proposal.patchId ? { patchId: proposal.patchId } : {}),
      ...(proposal.supersededProposalIds ? { supersededProposalIds: [...proposal.supersededProposalIds] } : {}),
    };
  }

  function nextAcceptAlias(managed: ManagedSession): string | null {
    for (const proposal of managed.session.proposals()) {
      const review = managed.review.get(proposal.requestAlias) ?? "pending";
      if (review === "pending" || review === "undone") return proposal.requestAlias;
    }
    return null;
  }

  function snapshot(managed: ManagedSession): DocsEditSessionState {
    return {
      sessionId: managed.session.id,
      path: managed.session.path,
      docId: managed.session.docId,
      baseHash: managed.session.baseHash,
      currentHash: managed.currentHash,
      status: managed.session.status(),
      ...(managed.session.instruction !== undefined ? { instruction: managed.session.instruction } : {}),
      createdAt: managed.createdAt,
      scope: managed.launch.scope === null ? null : [...managed.launch.scope],
      touchedDocPaths: [...managed.touchedDocPaths],
      requests: managed.session.requests().map((entry) => requestState(managed, entry)),
      proposals: managed.session.proposals().map((proposal) => proposalState(managed, proposal)),
      nextAcceptAlias: nextAcceptAlias(managed),
      undoableAlias: managed.applied.at(-1)?.alias ?? null,
      skipped: managed.launch.skipped,
      agent: { ...managed.agent },
    };
  }

  function runAgentTurn(
    managed: ManagedSession,
    launch: LaunchedDocsEditSession,
    aliases: string[],
  ): void {
    if (!options.spawnAgent || !managed.spawnEnabled || managed.disposed) return;
    if (managed.agent.running) {
      aliases.forEach((alias) => managed.pendingRerunAliases.add(alias));
      managed.agent.rerunPending = managed.pendingRerunAliases.size > 0;
      return;
    }
    managed.agent.spawned = true;
    managed.agent.running = true;
    managed.agent.turns += 1;
    const turn = managed.agent.turns;
    managed.session.beginAgentTurn(aliases);
    emit(managed, { type: "agent-turn", sessionId: managed.session.id, phase: "started", turn, aliases: [...aliases] });
    Promise.resolve()
      .then(() => options.spawnAgent?.(launch))
      .then(() => undefined, (cause: unknown) => cause instanceof Error ? cause.message : String(cause))
      .then((agentError) => {
        managed.agent.running = false;
        if (agentError !== undefined) managed.agent.error = agentError;
        managed.session.finishAgentTurn(agentError);
        emit(managed, {
          type: "agent-turn",
          sessionId: managed.session.id,
          phase: agentError === undefined ? "finished" : "failed",
          turn,
          aliases: [...aliases],
          ...(agentError !== undefined ? { error: agentError } : {}),
        });
        const pending = [...managed.pendingRerunAliases];
        managed.pendingRerunAliases.clear();
        managed.agent.rerunPending = false;
        if (pending.length > 0 && !managed.disposed) {
          runAgentTurn(managed, relaunchDocsEditSession(managed.launch, pending), pending);
        }
      });
  }

  async function annotationOutcome(
    managed: ManagedSession,
    entry: DocsEditRequestEntry,
    response: string,
    attached: boolean,
  ): Promise<DocsEditAnnotationOutcome> {
    const outcome: DocsEditAnnotationOutcome = {
      annotationId: entry.annotationId,
      attached: false,
      resolved: false,
    };
    if (!entry.sidecarBacked) return { ...outcome, detail: "not-in-sidecar" };
    outcome.attached = attached;
    try {
      const result = await resolveBundleAnnotation(
        options.docsRoot,
        managed.session.path,
        entry.annotationId,
        undefined,
        managed.session.id,
        response,
      );
      if (!result.ok) {
        outcome.detail = result.detail;
        return outcome;
      }
      outcome.resolved = true;
      return outcome;
    } catch (cause) {
      outcome.detail = cause instanceof Error ? cause.message : String(cause);
      return outcome;
    }
  }

  async function restage(
    managed: ManagedSession,
    entry: DocsEditRequestEntry,
    proposal: DocsEditProposal,
    rejectPrevious = true,
  ): Promise<
    | { ok: true; proposal: DocsEditProposal }
    | { ok: false; status: number; detail: string; current_hash?: string; issues?: unknown }
  > {
    const loaded = await loadDocBundle(options.docsRoot, proposal.docPath);
    if ("error" in loaded) return { ok: false as const, status: loaded.error.status, detail: loaded.error.detail };
    const staged = await stageBundleProposal(
      options.docsRoot,
      proposal.docPath,
      {
        ops: proposal.ops,
        summary: proposal.summary,
        expectedHash: loaded.docHash,
        annotationId:
          entry.sidecarBacked && proposal.docPath === managed.normalizedPath
            ? entry.annotationId
            : undefined,
        alias: entry.alias,
        sessionId: managed.session.id,
      },
      managed.session.id,
    );
    if (!staged.ok) return staged;
    const replacement: DocsEditProposal = {
      proposalId: staged.proposal.id,
      requestAlias: entry.alias,
      docPath: proposal.docPath,
      baseHash: staged.proposal.baseHash,
      ops: [...staged.proposal.ops],
      changedBlockIds: [...staged.proposal.changedBlockIds],
      summary: staged.proposal.summary,
      createdAt: staged.proposal.createdAt,
    };
    const replaced = managed.session.replaceProposal(entry.alias, replacement);
    if (!replaced.ok) {
      return { ok: false, status: 400, detail: replaced.message };
    }
    // A stale proposal is still staged and should no longer appear as a live
    // candidate. After undo the prior proposal is already accepted, so there
    // is nothing to reject; the new proposal is the single re-accept target.
    if (
      rejectPrevious &&
      (managed.review.get(entry.alias) ?? "pending") !== "undone"
    ) {
      const rejected = await rejectBundleProposal(
        options.docsRoot,
        proposal.docPath,
        proposal.proposalId,
        { sessionId: managed.session.id },
      );
      if (!rejected.ok && rejected.status !== 409) {
        return rejected;
      }
    }
    const active = managed.session.proposals().find(
      (candidate) => candidate.requestAlias === entry.alias,
    );
    return active
      ? { ok: true, proposal: active }
      : { ok: false, status: 500, detail: "Restaged proposal was not retained by the session" };
  }

  return {
    allowWrites,

    async createSession(input) {
      const normalized = normalizeBundlePath(input.path);
      const busy = [...sessions.values()].find((candidate) =>
        candidate.touchedDocPaths.has(normalized),
      );
      if (busy) {
        return { ok: false, reason: "agent-busy", path: normalized, sessionId: busy.session.id };
      }
      const launch = await launchDocsEditSession({
        docsRoot: options.docsRoot,
        path: input.path,
        instruction: input.instruction,
        requestIds: input.requestIds,
        extraRequests: input.extraRequests,
        sessionId: input.sessionId,
      });
      if (!launch.ok) return launch;
      const managed: ManagedSession = {
        session: launch.session,
        launch,
        normalizedPath: launch.session.path,
        touchedDocPaths: new Set([launch.session.path]),
        createdAt: now(),
        currentHash: launch.session.baseHash,
        review: new Map(),
        applied: [],
        listeners: new Set(),
        unsubscribeSession: () => {},
        agent: { spawned: false, running: false, turns: 0, rerunPending: false },
        spawnEnabled: input.spawn !== false,
        pendingRerunAliases: new Set(),
        disposed: false,
      };
      managed.unsubscribeSession = launch.session.subscribe((event) => {
        if (event.type === "proposal-staged") {
          managed.touchedDocPaths.add(event.proposal.docPath);
        }
        emit(managed, event);
      });
      sessions.set(launch.session.id, managed);
      runAgentTurn(managed, launch, []);
      return { ok: true, state: snapshot(managed) };
    },

    getState(sessionId) {
      const managed = sessions.get(sessionId);
      return managed ? snapshot(managed) : null;
    },

    list() {
      return [...sessions.values()].map((managed) => ({
        sessionId: managed.session.id,
        path: managed.session.path,
        docId: managed.session.docId,
        status: managed.session.status(),
        createdAt: managed.createdAt,
        baseHash: managed.session.baseHash,
        currentHash: managed.currentHash,
        requestCount: managed.session.requests().length,
        proposalCount: managed.session.proposals().length,
        appliedCount: managed.applied.length,
        scope: managed.launch.scope === null ? null : [...managed.launch.scope],
      }));
    },

    getSession: (sessionId) => sessions.get(sessionId)?.session ?? null,
    getLaunch: (sessionId) => sessions.get(sessionId)?.launch ?? null,
    subscribe(sessionId, listener) {
      const managed = sessions.get(sessionId);
      if (!managed) return null;
      managed.listeners.add(listener);
      return () => managed.listeners.delete(listener);
    },

    async acceptProposal(sessionId, requestedAlias) {
      const managed = sessions.get(sessionId);
      if (!managed) return null;
      const alias = requestedAlias.trim();
      if (!allowWrites) return { ok: false, failure: { kind: "writes_disabled" } };
      const entry = managed.session.requests().find((candidate) => candidate.alias === alias);
      if (!entry) return { ok: false, failure: { kind: "unknown_request", alias } };
      if (managed.review.get(alias) === "applied") return { ok: false, failure: { kind: "already_applied", alias } };
      let proposal = managed.session.proposals().find((candidate) => candidate.requestAlias === alias);
      if (!proposal) return { ok: false, failure: { kind: "no_staged_proposal", alias } };
      const nextAlias = nextAcceptAlias(managed);
      if (nextAlias !== alias) {
        return { ok: false, failure: { kind: "out_of_order", alias, nextAlias: nextAlias ?? alias } };
      }

      if (managed.review.get(alias) === "undone") {
        const refreshed = await restage(managed, entry, proposal);
        if (!refreshed.ok) {
          return { ok: false, failure: failureFromBackend("apply_failure", refreshed) };
        }
        proposal = refreshed.proposal;
      }

      let accepted = await acceptBundleProposal(
        options.docsRoot,
        proposal.docPath,
        proposal.proposalId,
        { sessionId: managed.session.id },
      );
      if (!accepted.ok && accepted.status === 409 && accepted.detail === "stale-proposal") {
        const refreshed = await restage(managed, entry, proposal);
        if (!refreshed.ok) return { ok: false, failure: failureFromBackend("apply_failure", refreshed) };
        proposal = refreshed.proposal;
        accepted = await acceptBundleProposal(
          options.docsRoot,
          proposal.docPath,
          proposal.proposalId,
          { sessionId: managed.session.id },
        );
      }
      if (!accepted.ok) return { ok: false, failure: failureFromBackend("apply_failure", accepted) };

      if (proposal.docPath === managed.normalizedPath) {
        managed.currentHash = accepted.hash;
      }
      managed.review.set(alias, "applied");
      managed.applied.push({
        alias,
        docPath: proposal.docPath,
        proposalId: proposal.proposalId,
        patchId: accepted.patchId,
      });
      managed.session.markApplied(alias, accepted.patchId, proposal.proposalId, accepted.hash);
      const annotation = await annotationOutcome(
        managed,
        entry,
        proposal.summary,
        entry.sidecarBacked && proposal.docPath === managed.normalizedPath,
      );
      return { ok: true, alias, proposalId: proposal.proposalId, patchId: accepted.patchId, hash: accepted.hash, annotation };
    },

    async acceptAll(sessionId) {
      const managed = sessions.get(sessionId);
      if (!managed) return null;
      const batch = managed.session.proposals().filter((proposal) => {
        const review = managed.review.get(proposal.requestAlias) ?? "pending";
        return review === "pending" || review === "undone";
      });
      if (!allowWrites) {
        return {
          ok: false,
          failure: {
            alias: batch[0]?.requestAlias ?? "",
            status: 403,
            detail: "Docs writes are disabled — the kernel is not running in dev mode",
          },
          rolledBack: true,
          results: [],
        };
      }

      const appliedPrefix: Array<{
        entry: DocsEditRequestEntry;
        proposal: DocsEditProposal;
        patchId: string;
        hash: string;
      }> = [];
      const results: Array<
        Extract<DocsEditAcceptAllProposalResult, { ok: true }>
      > = [];
      const rollback = async (
        failed: Extract<DocsEditAcceptAllProposalResult, { ok: false }>,
      ): Promise<DocsEditAcceptAllResult> => {
        // Undo consumes each patch ledger entry. Re-stage each accepted
        // proposal after restoring its document so the whole batch remains
        // reviewable and the service's proposal order/reviews stay intact.
        for (const applied of [...appliedPrefix].reverse()) {
          const undone = await undo_patch(options.docsRoot, applied.patchId);
          if (!undone.ok || undone.kind !== "doc") {
            throw new Error(
              `acceptAll rollback failed for ${applied.entry.alias}: ${
                undone.ok ? "Patch was not a document patch" : undone.detail
              }`,
            );
          }
          const replacement = await restage(
            managed,
            applied.entry,
            applied.proposal,
            false,
          );
          if (!replacement.ok) {
            throw new Error(
              `acceptAll could not restore staged proposal ${applied.entry.alias}: ${replacement.detail}`,
            );
          }
        }
        for (const result of results) result.rolledBack = true;
        return {
          ok: false,
          failure: { alias: failed.alias, status: failed.status, detail: failed.detail },
          rolledBack: true,
          results: [...results, failed],
        };
      };

      for (const candidate of batch) {
        const entry = managed.session.requests().find(
          (request) => request.alias === candidate.requestAlias,
        );
        let proposal = candidate;
        if (!entry) {
          const failed = {
            ok: false as const,
            alias: proposal.requestAlias,
            docPath: proposal.docPath,
            proposalId: proposal.proposalId,
            status: 404,
            detail: `Request ${proposal.requestAlias} not found`,
          };
          return rollback(failed);
        }

        // An undone proposal has already been accepted in its sidecar. Refresh
        // it before the atomic window so the batch itself never auto-restages.
        if (managed.review.get(proposal.requestAlias) === "undone") {
          const refreshed = await restage(managed, entry, proposal);
          if (!refreshed.ok) {
            const failed = {
              ok: false as const,
              alias: proposal.requestAlias,
              docPath: proposal.docPath,
              proposalId: proposal.proposalId,
              status: refreshed.status,
              detail: refreshed.detail,
              ...(refreshed.current_hash !== undefined
                ? { currentHash: refreshed.current_hash }
                : {}),
            };
            return rollback(failed);
          }
          proposal = refreshed.proposal;
        }

        const accepted = await acceptBundleProposal(
          options.docsRoot,
          proposal.docPath,
          proposal.proposalId,
          { sessionId: managed.session.id },
        );
        if (!accepted.ok) {
          const failed = {
            ok: false as const,
            alias: proposal.requestAlias,
            docPath: proposal.docPath,
            proposalId: proposal.proposalId,
            status: accepted.status,
            detail: accepted.detail,
            ...(accepted.current_hash !== undefined
              ? { currentHash: accepted.current_hash }
              : {}),
          };
          return rollback(failed);
        }

        appliedPrefix.push({
          entry,
          proposal,
          patchId: accepted.patchId,
          hash: accepted.hash,
        });
        results.push({
          ok: true,
          alias: proposal.requestAlias,
          docPath: proposal.docPath,
          proposalId: proposal.proposalId,
          patchId: accepted.patchId,
          hash: accepted.hash,
        });
      }

      // Only publish applied review state/events and resolve annotations after
      // every per-document accept has succeeded.
      for (const applied of appliedPrefix) {
        if (applied.proposal.docPath === managed.normalizedPath) {
          managed.currentHash = applied.hash;
        }
        managed.review.set(applied.entry.alias, "applied");
        managed.applied.push({
          alias: applied.entry.alias,
          docPath: applied.proposal.docPath,
          proposalId: applied.proposal.proposalId,
          patchId: applied.patchId,
        });
        managed.session.markApplied(
          applied.entry.alias,
          applied.patchId,
          applied.proposal.proposalId,
          applied.hash,
        );
        const annotation = await annotationOutcome(
          managed,
          applied.entry,
          applied.proposal.summary,
          applied.entry.sidecarBacked &&
            applied.proposal.docPath === managed.normalizedPath,
        );
        const result = results.find(
          (candidate) =>
            candidate.ok &&
            candidate.proposalId === applied.proposal.proposalId,
        );
        if (result) result.annotation = annotation;
      }
      return { ok: true, results };
    },

    async rejectProposal(sessionId, requestedAlias, note) {
      const managed = sessions.get(sessionId);
      if (!managed) return null;
      const alias = requestedAlias.trim();
      if (!allowWrites) return { ok: false, failure: { kind: "writes_disabled" } };
      const entry = managed.session.requests().find((candidate) => candidate.alias === alias);
      if (!entry) return { ok: false, failure: { kind: "unknown_request", alias } };
      if (managed.review.get(alias) === "applied") return { ok: false, failure: { kind: "already_applied", alias } };
      const proposal = managed.session.proposals().find((candidate) => candidate.requestAlias === alias);
      if (!proposal) return { ok: false, failure: { kind: "no_staged_proposal", alias } };
      const rejected = await rejectBundleProposal(
        options.docsRoot,
        proposal.docPath,
        proposal.proposalId,
        { sessionId: managed.session.id },
      );
      if (!rejected.ok) return { ok: false, failure: failureFromBackend("reject_failed", rejected) };
      const closingNote = note?.trim() || "Rejected in review.";
      managed.review.set(alias, "rejected");
      managed.session.markRejected(alias, closingNote);
      const annotation = await annotationOutcome(managed, entry, closingNote, false);
      const request = managed.session.requests().find((candidate) => candidate.alias === alias)!;
      return { ok: true, alias, proposalId: proposal.proposalId, request, annotation };
    },

    async undoAccepted(sessionId, requestedAlias) {
      const managed = sessions.get(sessionId);
      if (!managed) return null;
      const alias = requestedAlias.trim();
      if (!allowWrites) return { ok: false, failure: { kind: "writes_disabled" } };
      if (!managed.session.requests().some((entry) => entry.alias === alias)) {
        return { ok: false, failure: { kind: "unknown_request", alias } };
      }
      if (managed.review.get(alias) !== "applied") return { ok: false, failure: { kind: "not_applied", alias } };
      const latest = managed.applied.at(-1);
      if (!latest || latest.alias !== alias) {
        return { ok: false, failure: { kind: "not_latest_applied", alias, lastAppliedAlias: latest?.alias ?? alias } };
      }
      const undone = await undo_patch(options.docsRoot, latest.patchId);
      if (!undone.ok) return { ok: false, failure: failureFromBackend("undo_failed", undone) };
      if (undone.kind !== "doc") {
        return { ok: false, failure: { kind: "undo_failed", status: 400, detail: "Patch was not a document patch" } };
      }
      managed.applied.pop();
      if (latest.docPath === managed.normalizedPath) {
        managed.currentHash = undone.hash;
      }
      managed.review.set(alias, "undone");
      managed.session.markUndone(alias, undone.hash);
      return { ok: true, alias, proposalId: latest.proposalId, patchId: latest.patchId, hash: undone.hash };
    },

    async replyToRequest(sessionId, alias, body) {
      const managed = sessions.get(sessionId);
      if (!managed) return null;
      const result = await managed.session.appendHumanReply(alias, body);
      if (!result.ok) return result;
      runAgentTurn(managed, relaunchDocsEditSession(managed.launch, [result.request.alias]), [result.request.alias]);
      return result;
    },

    async addHumanRequest(sessionId, input) {
      const managed = sessions.get(sessionId);
      if (!managed) return null;
      const generatedId = input.id?.trim() || `${managed.session.id}-host-${managed.session.requests().length + 1}`;
      return managed.session.addRequest({
        id: generatedId,
        target: input.target,
        disposition: input.target.kind === "doc" ? "global" : "batch",
        body: input.body,
        author: input.author ?? "human",
        sidecarBacked: false,
      });
    },

    dispose(sessionId) {
      const managed = sessions.get(sessionId);
      if (!managed) return false;
      managed.disposed = true;
      managed.pendingRerunAliases.clear();
      managed.agent.rerunPending = false;
      emit(managed, { type: "session-disposed", sessionId });
      managed.unsubscribeSession();
      managed.listeners.clear();
      sessions.delete(sessionId);
      return true;
    },

    disposeAll() {
      for (const sessionId of [...sessions.keys()]) this.dispose(sessionId);
    },
  };
}

function failureFromBackend<K extends "apply_failure" | "reject_failed" | "undo_failed">(
  kind: K,
  value: { status?: number; detail?: string; current_hash?: string; issues?: unknown },
): { kind: K; status: number; detail: string; currentHash?: string; issues?: unknown } {
  return {
    kind,
    status: value.status ?? 400,
    detail: value.detail ?? "Docs operation failed",
    ...(value.current_hash !== undefined ? { currentHash: value.current_hash } : {}),
    ...(value.issues !== undefined ? { issues: value.issues } : {}),
  };
}
