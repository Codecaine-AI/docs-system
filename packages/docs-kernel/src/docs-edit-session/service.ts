import type { LintReport } from "@codecaine-ai/docs-model/lint";
/**
 * Host lifecycle/review service for docs-edit sessions.
 *
 * Unlike prompt transactions, DocProposals do not chain on an in-memory
 * working document: accept/reject may consume any pending proposal. A stale accept re-stages the
 * same DocOps against the current document before applying. Undo uses the
 * in-process docs-server ledger and leaves the annotation resolved.
 */
import { randomUUID } from "node:crypto";
import { basename, dirname, resolve } from "node:path";

import {
  acceptBundleProposal,
  createDocsStore,
  loadDocBundle,
  normalizeBundlePath,
  readChangeSetRecord,
  recordCompoundPatch,
  rejectBundleProposal,
  resolveBundleAnnotation,
  stageBundleProposal,
  undo_patch,
  writeChangeSetRecord,
  type DocChangeSetAnnotationMigration,
  type DocChangeSetEntry,
  type DocChangeSetView,
} from "@codecaine-ai/docs-server";

import type { SkippedDocsAnnotation } from "./from-annotations";
import {
  launchDocsEditSession,
  relaunchDocsEditSession,
  type LaunchedDocsEditSession,
  type LaunchDocsEditSessionFailure,
} from "./launch";
import type {
  DocsEditPathClaimResult,
  DocsEditSession,
  DocsEditSimpleResult,
} from "./session";
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
  lint?: LintReport;
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
  corpus: string;
  path: string;
  docId: string;
  baseHash: string;
  currentHash: string;
  status: DocsEditSessionStatus;
  instruction?: string;
  createdAt: string;
  scope: string[] | null;
  touchedDocPaths: string[];
  changesetId?: string;
  requests: DocsEditSessionRequestState[];
  proposals: DocsEditSessionProposalState[];
  nextAcceptAlias: string | null;
  undoableAlias: string | null;
  skipped: SkippedDocsAnnotation[];
  agent: DocsEditSessionAgentState;
}

export interface DocsEditSessionSummary {
  sessionId: string;
  corpus: string;
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
  | { type: "changeset-updated"; sessionId: string; changeset: DocChangeSetView }
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
  | { kind: "apply_failure"; status: number; detail: string; currentHash?: string; issues?: unknown; lint?: LintReport };

export type AcceptDocsEditProposalResult =
  | {
      ok: true;
      alias: string;
      proposalId: string;
      patchId: string;
      hash: string;
      annotation: DocsEditAnnotationOutcome;
      lint?: LintReport;
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
      lint?: LintReport;
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
      lint?: LintReport;
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
  corpus?: string;
  path: string;
  instruction?: string;
  requestIds?: readonly string[];
  extraRequests?: DocsEditRequestInput[];
  sessionId?: string;
  spawn?: boolean;
}

export type CreateDocsEditSessionFailure =
  | LaunchDocsEditSessionFailure
  | { ok: false; reason: "agent-busy"; path: string; sessionId: string }
  | { ok: false; reason: "unknown-corpus"; corpus: string; known: string[] };
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
  getChangeSet(sessionId: string): Promise<DocChangeSetView | null>;
  subscribe(sessionId: string, listener: DocsEditSessionStreamListener): (() => void) | null;
  acceptProposal(sessionId: string, alias: string, proposalId?: string): Promise<AcceptDocsEditProposalResult | null>;
  acceptAll(sessionId: string): Promise<DocsEditAcceptAllResult | null>;
  rejectProposal(sessionId: string, alias: string, note?: string, proposalId?: string): Promise<RejectDocsEditProposalResult | null>;
  undoAccepted(sessionId: string, alias: string): Promise<UndoAcceptedDocsProposalResult | null>;
  replyToRequest(sessionId: string, alias: string, body: string): Promise<DocsEditSimpleResult | null>;
  addHumanRequest(sessionId: string, input: { id?: string; target: DocsEditTarget; body: string; author?: DocsEditRequestAuthor }): Promise<DocsEditSimpleResult | null>;
  dispose(sessionId: string): boolean;
  disposeAll(): void;
}

export interface DocsEditCorpus {
  name: string;
  docsRoot: string;
}

export interface CreateDocsEditSessionServiceOptions {
  corpora?: readonly DocsEditCorpus[];
  /** Legacy single-corpus form retained for direct callers and tests. */
  docsRoot?: string;
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
  claimOwnerId: string;
  launch: LaunchedDocsEditSession;
  normalizedPath: string;
  touchedDocPaths: Set<string>;
  changesetId?: string;
  changeSetMigrationsByAlias: Map<string, DocChangeSetAnnotationMigration[]>;
  changesetSyncTail: Promise<void>;
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
  const corpora = options.corpora && options.corpora.length > 0
    ? [...options.corpora]
    : options.docsRoot
      ? [{
          name: basename(dirname(resolve(options.docsRoot))),
          docsRoot: options.docsRoot,
        }]
      : [];
  if (corpora.length === 0) {
    throw new Error("docs-edit session service requires at least one corpus");
  }
  const docsStores = new Map<string, ReturnType<typeof createDocsStore>>();
  const pathClaims = new Map<string, {
    corpus: string;
    path: string;
    sessionId: string;
    ownerId: string;
  }>();
  const claimKey = (corpus: string, path: string) => `${corpus}\0${path}`;
  const claimPaths = (
    corpus: string,
    ownerId: string,
    sessionId: string,
    paths: readonly string[],
  ): DocsEditPathClaimResult & { ownerSessionId?: string; path?: string } => {
    const normalizedPaths = [...new Set(paths.map((path) => normalizeBundlePath(path)))];
    for (const path of normalizedPaths) {
      const existing = pathClaims.get(claimKey(corpus, path));
      if (existing && existing.ownerId !== ownerId) {
        return {
          ok: false,
          message: `Document ${path} is already owned by docs-edit session ${existing.sessionId}.`,
          ownerSessionId: existing.sessionId,
          path,
        };
      }
    }
    const newlyClaimed: string[] = [];
    for (const path of normalizedPaths) {
      const key = claimKey(corpus, path);
      if (pathClaims.has(key)) continue;
      pathClaims.set(key, { corpus, path, sessionId, ownerId });
      newlyClaimed.push(key);
    }
    let released = false;
    return {
      ok: true,
      release: () => {
        if (released) return;
        released = true;
        for (const key of newlyClaimed) {
          if (pathClaims.get(key)?.ownerId === ownerId) pathClaims.delete(key);
        }
      },
    };
  };
  const releaseSessionClaims = (ownerId: string) => {
    for (const [key, claim] of pathClaims) {
      if (claim.ownerId === ownerId) pathClaims.delete(key);
    }
  };
  const docsStoreFor = (managed: ManagedSession) => {
    const root = managed.session.docsRoot;
    let store = docsStores.get(root);
    if (!store) {
      store = createDocsStore(root);
      docsStores.set(root, store);
    }
    return store;
  };

  const emit = (managed: ManagedSession, event: DocsEditSessionStreamEvent) => {
    for (const listener of [...managed.listeners]) listener(event);
  };

  function changeSetEntries(managed: ManagedSession): DocChangeSetEntry[] {
    return managed.session.proposals().map((proposal) => ({
      docPath: proposal.docPath,
      proposalId: proposal.proposalId,
    }));
  }

  function changeSetMigrations(
    managed: ManagedSession,
  ): DocChangeSetAnnotationMigration[] {
    return [...managed.changeSetMigrationsByAlias.values()].flatMap(
      (migrations) => migrations,
    );
  }

  async function emitFreshChangeSet(
    managed: ManagedSession,
  ): Promise<DocChangeSetView | null> {
    if (!managed.changesetId) return null;
    const loaded = await docsStoreFor(managed).changesetGet(managed.changesetId);
    if (!loaded.ok) return null;
    emit(managed, {
      type: "changeset-updated",
      sessionId: managed.session.id,
      changeset: loaded.changeset,
    });
    return loaded.changeset;
  }

  async function synchronizeChangeSet(
    managed: ManagedSession,
    drivingProposal?: DocsEditProposal,
  ): Promise<void> {
    const entries = changeSetEntries(managed);
    if (!entries.some((entry) => entry.docPath !== managed.normalizedPath)) return;

    if (!managed.changesetId) {
      const driving = drivingProposal ?? managed.session.proposals().find(
        (proposal) => proposal.docPath !== managed.normalizedPath,
      );
      const drivingRequest = driving
        ? managed.session.requests().find(
            (request) => request.alias === driving.requestAlias,
          )
        : undefined;
      const instruction = managed.session.instruction?.trim();
      const summary = instruction || managed.session.requests()[0]?.body.trim() || "Docs edit";
      const created = await docsStoreFor(managed).changesetStage({
        summary,
        sessionId: managed.session.id,
        ...(drivingRequest?.sidecarBacked
          ? {
              annotationId: drivingRequest.annotationId,
              annotationDocPath: managed.normalizedPath,
            }
          : {}),
        ...(drivingRequest ? { alias: drivingRequest.alias } : {}),
        entries,
      });
      if (!created.ok) {
        throw new Error(`Failed to persist session change-set: ${created.detail}`);
      }
      managed.changesetId = created.changeset.id;
      emit(managed, {
        type: "changeset-updated",
        sessionId: managed.session.id,
        changeset: created.changeset,
      });
      return;
    }

    const loaded = await readChangeSetRecord(managed.session.docsRoot, managed.changesetId);
    if (!loaded.ok) {
      throw new Error(`Failed to read session change-set: ${loaded.detail}`);
    }
    const written = await writeChangeSetRecord(managed.session.docsRoot, {
      ...loaded.changeset,
      entries,
    });
    if (!written.ok) {
      throw new Error(`Failed to update session change-set: ${written.detail}`);
    }
    const enriched = await emitFreshChangeSet(managed);
    if (!enriched) {
      throw new Error(`Failed to enrich session change-set: ${managed.changesetId}`);
    }
  }

  async function queueChangeSetSync(
    managed: ManagedSession,
    drivingProposal?: DocsEditProposal,
  ): Promise<void> {
    const run = managed.changesetSyncTail.then(() =>
      synchronizeChangeSet(managed, drivingProposal),
    );
    managed.changesetSyncTail = run.catch(() => undefined);
    await run;
  }

  function reviewForRequest(
    managed: ManagedSession,
    alias: string,
  ): DocsEditReviewStatus {
    const reviews = managed.session.proposals()
      .filter((proposal) => proposal.requestAlias === alias)
      .map((proposal) => managed.review.get(proposal.proposalId) ?? "pending");
    if (reviews.some((review) => review === "pending")) return "pending";
    if (reviews.some((review) => review === "undone")) return "undone";
    if (reviews.some((review) => review === "applied")) return "applied";
    if (reviews.length > 0 && reviews.every((review) => review === "rejected")) {
      return "rejected";
    }
    return "pending";
  }

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
      review: reviewForRequest(managed, entry.alias),
    };
  }

  function proposalState(managed: ManagedSession, proposal: DocsEditProposal): DocsEditSessionProposalState {
    return {
      proposalId: proposal.proposalId,
      lint: proposal.lint,
      requestAlias: proposal.requestAlias,
      docPath: proposal.docPath,
      baseHash: proposal.baseHash,
      ops: proposal.ops,
      changedBlockIds: proposal.changedBlockIds,
      summary: proposal.summary,
      createdAt: proposal.createdAt,
      review: managed.review.get(proposal.proposalId) ?? "pending",
      ...(proposal.patchId ? { patchId: proposal.patchId } : {}),
      ...(proposal.supersededProposalIds ? { supersededProposalIds: [...proposal.supersededProposalIds] } : {}),
    };
  }

  function nextAcceptAlias(managed: ManagedSession): string | null {
    for (const proposal of managed.session.proposals()) {
      const review = managed.review.get(proposal.proposalId) ?? "pending";
      if (review === "pending" || review === "undone") return proposal.requestAlias;
    }
    return null;
  }

  function snapshot(managed: ManagedSession): DocsEditSessionState {
    return {
      sessionId: managed.session.id,
      corpus: managed.session.corpus,
      path: managed.session.path,
      docId: managed.session.docId,
      baseHash: managed.session.baseHash,
      currentHash: managed.currentHash,
      status: managed.session.status(),
      ...(managed.session.instruction !== undefined ? { instruction: managed.session.instruction } : {}),
      createdAt: managed.createdAt,
      scope: managed.launch.scope === null ? null : [...managed.launch.scope],
      touchedDocPaths: [...managed.touchedDocPaths],
      ...(managed.changesetId ? { changesetId: managed.changesetId } : {}),
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
        managed.session.docsRoot,
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
    const loaded = await loadDocBundle(managed.session.docsRoot, proposal.docPath);
    if ("error" in loaded) return { ok: false as const, status: loaded.error.status, detail: loaded.error.detail };
    const hasOtherUnsettledProposal = managed.session.proposals().some((candidate) => {
      if (
        candidate.requestAlias !== entry.alias ||
        candidate.proposalId === proposal.proposalId
      ) {
        return false;
      }
      const review = managed.review.get(candidate.proposalId) ?? "pending";
      return review === "pending" || review === "undone";
    });
    const staged = await stageBundleProposal(
      managed.session.docsRoot,
      proposal.docPath,
      {
        ops: proposal.ops,
        summary: proposal.summary,
        expectedHash: loaded.docHash,
        annotationId:
          !hasOtherUnsettledProposal &&
          entry.sidecarBacked &&
          proposal.docPath === managed.normalizedPath
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
      lint: staged.lint,
      requestAlias: entry.alias,
      docPath: proposal.docPath,
      baseHash: staged.proposal.baseHash,
      ops: [...staged.proposal.ops],
      changedBlockIds: [...staged.proposal.changedBlockIds],
      summary: staged.proposal.summary,
      createdAt: staged.proposal.createdAt,
    };
    const previousReview = managed.review.get(proposal.proposalId) ?? "pending";
    const replaced = managed.session.replaceProposal(
      entry.alias,
      proposal.proposalId,
      replacement,
    );
    if (!replaced.ok) {
      return { ok: false, status: 400, detail: replaced.message };
    }
    // A stale proposal is still staged and should no longer appear as a live
    // candidate. After undo the prior proposal is already accepted, so there
    // is nothing to reject; the new proposal is the single re-accept target.
    if (
      rejectPrevious &&
      previousReview !== "undone"
    ) {
      const rejected = await rejectBundleProposal(
        managed.session.docsRoot,
        proposal.docPath,
        proposal.proposalId,
        { sessionId: managed.session.id },
      );
      if (!rejected.ok && rejected.status !== 409) {
        return rejected;
      }
    }
    managed.review.delete(proposal.proposalId);
    managed.review.set(replacement.proposalId, previousReview);
    await queueChangeSetSync(managed, replacement);
    const active = managed.session.proposals().find(
      (candidate) => candidate.proposalId === replacement.proposalId,
    );
    return active
      ? { ok: true, proposal: active }
      : { ok: false, status: 500, detail: "Restaged proposal was not retained by the session" };
  }

  async function acceptRecordedBatch(
    managed: ManagedSession,
    batch: DocsEditProposal[],
  ): Promise<DocsEditAcceptAllResult | null> {
    if (!managed.changesetId) return null;
    const record = await readChangeSetRecord(managed.session.docsRoot, managed.changesetId);
    if (!record.ok || record.changeset.status !== "open") return null;
    const covered = record.changeset.entries.length === batch.length &&
      record.changeset.entries.every((entry, index) => {
        const proposal = batch[index];
        return proposal !== undefined &&
          entry.docPath === proposal.docPath &&
          entry.proposalId === proposal.proposalId;
    });
    if (!covered) return null;

    // Cross-doc proposals intentionally omit annotation ids from their
    // per-doc sidecars. Keep the record metadata durable, but let the kernel
    // resolve every request after the compound commit so Phase-1 per-request
    // agentRun semantics remain unchanged.
    const annotationMetadata = record.changeset.annotationId &&
      record.changeset.annotationDocPath
      ? {
          annotationId: record.changeset.annotationId,
          annotationDocPath: record.changeset.annotationDocPath,
        }
      : null;
    if (annotationMetadata) {
      const withoutAnnotation = { ...record.changeset };
      delete withoutAnnotation.annotationId;
      delete withoutAnnotation.annotationDocPath;
      const written = await writeChangeSetRecord(managed.session.docsRoot, withoutAnnotation);
      if (!written.ok) return null;
    }
    const accepted = await docsStoreFor(managed).changesetAccept(
      managed.changesetId,
      managed.session.id,
    );
    if (annotationMetadata) {
      const latest = await readChangeSetRecord(managed.session.docsRoot, managed.changesetId);
      if (!latest.ok) {
        throw new Error(`Failed to restore session change-set metadata: ${latest.detail}`);
      }
      const restored = await writeChangeSetRecord(managed.session.docsRoot, {
        ...latest.changeset,
        ...annotationMetadata,
      });
      if (!restored.ok) {
        throw new Error(`Failed to restore session change-set metadata: ${restored.detail}`);
      }
    }
    if (!accepted.ok) {
      const results: DocsEditAcceptAllProposalResult[] = accepted.results
        .filter((result) => result.kind === "entry")
        .map((result) => {
          const proposal = batch.find(
            (candidate) => candidate.proposalId === result.proposalId,
          );
          const alias = proposal?.requestAlias ?? "";
          if (result.ok) {
            const request = managed.session.requests().find(
              (candidate) => candidate.alias === alias,
            );
            return {
              ok: true as const,
              alias,
              docPath: result.docPath,
              proposalId: result.proposalId,
              patchId: result.patchId ?? "",
              hash: proposal?.baseHash ?? managed.currentHash,
              lint: result.lint,
              annotation: {
                annotationId: request?.annotationId ?? "",
                attached: false,
                resolved: false,
                detail: "rolled-back",
              },
              ...(result.rolledBack ? { rolledBack: true as const } : {}),
            };
          }
          return {
            ok: false as const,
            alias,
            docPath: result.docPath,
            proposalId: result.proposalId,
            status: result.status ?? accepted.status,
            detail: result.detail ?? accepted.detail,
            lint: result.lint,
          };
        });
      const failedProposal = accepted.failedEntry
        ? batch.find(
            (proposal) => proposal.proposalId === accepted.failedEntry?.proposalId,
          )
        : batch.find((proposal) =>
            results.some(
              (result) => !result.ok && result.proposalId === proposal.proposalId,
            ),
          );
      await emitFreshChangeSet(managed);
      return {
        ok: false,
        failure: {
          alias: failedProposal?.requestAlias ?? batch[0]?.requestAlias ?? "",
          status: accepted.status,
          detail: accepted.detail,
        },
        rolledBack: true,
        results,
      };
    }

    const hashes = new Map<string, string>();
    await Promise.all(
      [...new Set(batch.map((proposal) => proposal.docPath))].map(async (path) => {
        const loaded = await loadDocBundle(managed.session.docsRoot, path);
        if (!("error" in loaded)) hashes.set(path, loaded.docHash);
      }),
    );
    const results: Array<Extract<DocsEditAcceptAllProposalResult, { ok: true }>> = [];
    for (const proposal of batch) {
      const entry = managed.session.requests().find(
        (request) => request.alias === proposal.requestAlias,
      );
      if (!entry) continue;
      const backend = accepted.results.find(
        (result) => result.kind === "entry" && result.proposalId === proposal.proposalId,
      );
      const patchId = backend?.kind === "entry" && backend.patchId
        ? backend.patchId
        : accepted.patchId;
      const hash = hashes.get(proposal.docPath) ?? proposal.baseHash;
      if (proposal.docPath === managed.normalizedPath) managed.currentHash = hash;
      managed.review.set(proposal.proposalId, "applied");
      managed.applied.push({
        alias: entry.alias,
        docPath: proposal.docPath,
        proposalId: proposal.proposalId,
        patchId,
      });
      const marked = managed.session.markApplied(
        entry.alias,
        patchId,
        proposal.proposalId,
        hash,
      );
      const annotation = marked.ok && marked.request.status === "applied"
        ? await annotationOutcome(
            managed,
            entry,
            proposal.summary,
            entry.sidecarBacked && proposal.docPath === managed.normalizedPath,
          )
        : {
            annotationId: entry.annotationId,
            attached: false,
            resolved: false,
            detail: "request-still-ready",
          };
      results.push({
        ok: true,
        alias: entry.alias,
        docPath: proposal.docPath,
        proposalId: proposal.proposalId,
        patchId,
        hash,
        lint: backend?.kind === "entry" ? backend.lint : undefined,
        annotation,
      });
    }
    await emitFreshChangeSet(managed);
    return { ok: true, results };
  }

  async function reconcileFallbackRecord(
    managed: ManagedSession,
    appliedSuccessfully: boolean,
  ): Promise<void> {
    if (!managed.changesetId) return;
    await queueChangeSetSync(managed);
    if (!appliedSuccessfully) return;

    const loaded = await readChangeSetRecord(managed.session.docsRoot, managed.changesetId);
    if (!loaded.ok || loaded.changeset.status !== "open") return;
    const patchIds = loaded.changeset.entries.map((entry) =>
      [...managed.applied].reverse().find(
        (applied) => applied.docPath === entry.docPath &&
          applied.proposalId === entry.proposalId,
      )?.patchId,
    );
    if (patchIds.some((patchId) => patchId === undefined)) return;
    const compoundPatchId = randomUUID();
    recordCompoundPatch(compoundPatchId, patchIds as string[], managed.session.docsRoot);
    const written = await writeChangeSetRecord(managed.session.docsRoot, {
      ...loaded.changeset,
      status: "applied",
      resolvedAt: now(),
      compoundPatchId,
    });
    if (!written.ok) {
      throw new Error(`Failed to reconcile session change-set: ${written.detail}`);
    }
    await emitFreshChangeSet(managed);
  }

  return {
    allowWrites,

    async createSession(input) {
      const corpus = input.corpus === undefined
        ? corpora[0]!
        : corpora.find((candidate) => candidate.name === input.corpus);
      if (!corpus) {
        return {
          ok: false,
          reason: "unknown-corpus",
          corpus: input.corpus!,
          known: corpora.map((candidate) => candidate.name),
        };
      }
      const normalized = normalizeBundlePath(input.path);
      const sessionId = input.sessionId ?? `des-${randomUUID()}`;
      const claimOwnerId = randomUUID();
      const originClaim = claimPaths(corpus.name, claimOwnerId, sessionId, [normalized]);
      if (!originClaim.ok) {
        return {
          ok: false,
          reason: "agent-busy",
          path: normalized,
          sessionId: originClaim.ownerSessionId!,
        };
      }
      let managedForPersistence: ManagedSession | null = null;
      let launch: Awaited<ReturnType<typeof launchDocsEditSession>>;
      try {
        launch = await launchDocsEditSession({
          corpus: corpus.name,
          docsRoot: corpus.docsRoot,
          path: input.path,
          instruction: input.instruction,
          requestIds: input.requestIds,
          extraRequests: input.extraRequests,
          sessionId,
          claimPaths: (paths) => claimPaths(corpus.name, claimOwnerId, sessionId, paths),
          onProposalStaged: (proposal) => {
            if (!managedForPersistence) return;
            return queueChangeSetSync(managedForPersistence, proposal);
          },
          onProposalsSuperseded: async (alias, proposals) => {
            if (!managedForPersistence) return;
            managedForPersistence.changeSetMigrationsByAlias.delete(alias);
            for (const proposal of proposals) {
              managedForPersistence.review.delete(proposal.proposalId);
            }
            if (!managedForPersistence.changesetId) return;
            const loaded = await readChangeSetRecord(
              managedForPersistence.session.docsRoot,
              managedForPersistence.changesetId,
            );
            if (!loaded.ok) {
              throw new Error(`Failed to read session change-set: ${loaded.detail}`);
            }
            const removed = new Set(proposals.map(
              (proposal) => `${proposal.docPath}\0${proposal.proposalId}`,
            ));
            const written = await writeChangeSetRecord(managedForPersistence.session.docsRoot, {
              ...loaded.changeset,
              entries: loaded.changeset.entries.filter(
                (entry) => !removed.has(`${entry.docPath}\0${entry.proposalId}`),
              ),
              annotationMigrations: changeSetMigrations(managedForPersistence),
            });
            if (!written.ok) {
              throw new Error(`Failed to remove superseded proposals: ${written.detail}`);
            }
            const fresh = await emitFreshChangeSet(managedForPersistence);
            if (!fresh) {
              throw new Error(
                `Failed to load updated change-set: ${managedForPersistence.changesetId}`,
              );
            }
          },
          onChangeSetStaged: async (changeset) => {
            if (!managedForPersistence) return;
            if (changeset.alias) {
              managedForPersistence.changeSetMigrationsByAlias.set(
                changeset.alias,
                [...(changeset.annotationMigrations ?? [])],
              );
            }
            const generated = await readChangeSetRecord(managedForPersistence.session.docsRoot, changeset.id);
            if (!generated.ok) {
              throw new Error(`Failed to read generated change-set: ${generated.detail}`);
            }
            const synchronized = await writeChangeSetRecord(managedForPersistence.session.docsRoot, {
              ...generated.changeset,
              summary: changeset.summary,
              entries: changeSetEntries(managedForPersistence),
              annotationMigrations: changeSetMigrations(managedForPersistence),
            });
            if (!synchronized.ok) {
              throw new Error(`Failed to synchronize generated change-set: ${synchronized.detail}`);
            }
            managedForPersistence.changesetId = changeset.id;
            const fresh = await emitFreshChangeSet(managedForPersistence);
            if (!fresh) throw new Error(`Failed to load generated change-set: ${changeset.id}`);
          },
        });
      } catch (error) {
        releaseSessionClaims(claimOwnerId);
        throw error;
      }
      if (!launch.ok) {
        releaseSessionClaims(claimOwnerId);
        return launch;
      }
      const managed: ManagedSession = {
        session: launch.session,
        claimOwnerId,
        launch,
        normalizedPath: launch.session.path,
        touchedDocPaths: new Set([launch.session.path]),
        changeSetMigrationsByAlias: new Map(),
        changesetSyncTail: Promise.resolve(),
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
      managedForPersistence = managed;
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
        corpus: managed.session.corpus,
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
    async getChangeSet(sessionId) {
      const managed = sessions.get(sessionId);
      if (!managed?.changesetId) return null;
      const loaded = await docsStoreFor(managed).changesetGet(managed.changesetId);
      return loaded.ok ? loaded.changeset : null;
    },
    subscribe(sessionId, listener) {
      const managed = sessions.get(sessionId);
      if (!managed) return null;
      managed.listeners.add(listener);
      return () => managed.listeners.delete(listener);
    },

    async acceptProposal(sessionId, requestedAlias, requestedProposalId) {
      const managed = sessions.get(sessionId);
      if (!managed) return null;
      const alias = requestedAlias.trim();
      const proposalId = requestedProposalId?.trim();
      if (!allowWrites) return { ok: false, failure: { kind: "writes_disabled" } };
      const entry = managed.session.requests().find((candidate) => candidate.alias === alias);
      if (!entry) return { ok: false, failure: { kind: "unknown_request", alias } };
      let proposal = proposalId
        ? managed.session.proposals().find(
            (candidate) => candidate.requestAlias === alias && candidate.proposalId === proposalId,
          )
        : managed.session.proposals().find((candidate) => {
            if (candidate.requestAlias !== alias) return false;
            const review = managed.review.get(candidate.proposalId) ?? "pending";
            return review === "pending" || review === "undone";
          });
      if (!proposal) return { ok: false, failure: { kind: "no_staged_proposal", alias } };
      const proposalReview = managed.review.get(proposal.proposalId) ?? "pending";
      if (proposalReview === "applied") {
        return { ok: false, failure: { kind: "already_applied", alias } };
      }
      if (proposalReview === "rejected") {
        return { ok: false, failure: { kind: "no_staged_proposal", alias } };
      }

      if (proposalReview === "undone" && proposal.patchId) {
        const refreshed = await restage(managed, entry, proposal);
        if (!refreshed.ok) {
          return { ok: false, failure: failureFromBackend("apply_failure", refreshed) };
        }
        proposal = refreshed.proposal;
      }

      let accepted = await acceptBundleProposal(
        managed.session.docsRoot,
        proposal.docPath,
        proposal.proposalId,
        { sessionId: managed.session.id },
      );
      if (!accepted.ok && accepted.status === 409 && accepted.detail === "stale-proposal") {
        const refreshed = await restage(managed, entry, proposal);
        if (!refreshed.ok) return { ok: false, failure: failureFromBackend("apply_failure", refreshed) };
        proposal = refreshed.proposal;
        accepted = await acceptBundleProposal(
          managed.session.docsRoot,
          proposal.docPath,
          proposal.proposalId,
          { sessionId: managed.session.id },
        );
      }
      if (!accepted.ok) return { ok: false, failure: failureFromBackend("apply_failure", accepted) };

      if (proposal.docPath === managed.normalizedPath) {
        managed.currentHash = accepted.hash;
      }
      managed.review.set(proposal.proposalId, "applied");
      managed.applied.push({
        alias,
        docPath: proposal.docPath,
        proposalId: proposal.proposalId,
        patchId: accepted.patchId,
      });
      const marked = managed.session.markApplied(
        alias,
        accepted.patchId,
        proposal.proposalId,
        accepted.hash,
      );
      const annotation = marked.ok && marked.request.status === "applied"
        ? await annotationOutcome(
            managed,
            entry,
            proposal.summary,
            entry.sidecarBacked && proposal.docPath === managed.normalizedPath,
          )
        : {
            annotationId: entry.annotationId,
            attached: false,
            resolved: false,
            detail: "request-still-ready",
          };
      await emitFreshChangeSet(managed);
      return { ok: true, alias, proposalId: proposal.proposalId, patchId: accepted.patchId, hash: accepted.hash, annotation, lint: accepted.lint };
    },

    async acceptAll(sessionId) {
      const managed = sessions.get(sessionId);
      if (!managed) return null;
      const batch = managed.session.proposals().filter((proposal) => {
        const review = managed.review.get(proposal.proposalId) ?? "pending";
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

      const recorded = await acceptRecordedBatch(managed, batch);
      if (recorded) return recorded;

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
          const undone = await undo_patch(managed.session.docsRoot, applied.patchId);
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
        const rolledBack: DocsEditAcceptAllResult = {
          ok: false,
          failure: { alias: failed.alias, status: failed.status, detail: failed.detail },
          rolledBack: true,
          results: [...results, failed],
        };
        await reconcileFallbackRecord(managed, false);
        return rolledBack;
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
        if (managed.review.get(proposal.proposalId) === "undone" && proposal.patchId) {
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
          managed.session.docsRoot,
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
            lint: accepted.lint,
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
          lint: accepted.lint,
          annotation: {
            annotationId: entry.annotationId,
            attached: false,
            resolved: false,
            detail: "pending-batch",
          },
        });
      }

      // Only publish applied review state/events and resolve annotations after
      // every per-document accept has succeeded.
      for (const applied of appliedPrefix) {
        if (applied.proposal.docPath === managed.normalizedPath) {
          managed.currentHash = applied.hash;
        }
        managed.review.set(applied.proposal.proposalId, "applied");
        managed.applied.push({
          alias: applied.entry.alias,
          docPath: applied.proposal.docPath,
          proposalId: applied.proposal.proposalId,
          patchId: applied.patchId,
        });
        const marked = managed.session.markApplied(
          applied.entry.alias,
          applied.patchId,
          applied.proposal.proposalId,
          applied.hash,
        );
        const annotation = marked.ok && marked.request.status === "applied"
          ? await annotationOutcome(
              managed,
              applied.entry,
              applied.proposal.summary,
              applied.entry.sidecarBacked &&
                applied.proposal.docPath === managed.normalizedPath,
            )
          : {
              annotationId: applied.entry.annotationId,
              attached: false,
              resolved: false,
              detail: "request-still-ready",
            };
        const result = results.find(
          (candidate) =>
            candidate.ok &&
            candidate.proposalId === applied.proposal.proposalId,
        );
        if (result) result.annotation = annotation;
      }
      await reconcileFallbackRecord(managed, true);
      return { ok: true, results };
    },

    async rejectProposal(sessionId, requestedAlias, note, requestedProposalId) {
      const managed = sessions.get(sessionId);
      if (!managed) return null;
      const alias = requestedAlias.trim();
      const proposalId = requestedProposalId?.trim();
      if (!allowWrites) return { ok: false, failure: { kind: "writes_disabled" } };
      const entry = managed.session.requests().find((candidate) => candidate.alias === alias);
      if (!entry) return { ok: false, failure: { kind: "unknown_request", alias } };
      const proposal = proposalId
        ? managed.session.proposals().find(
            (candidate) => candidate.requestAlias === alias && candidate.proposalId === proposalId,
          )
        : managed.session.proposals().find((candidate) => {
            if (candidate.requestAlias !== alias) return false;
            const review = managed.review.get(candidate.proposalId) ?? "pending";
            return review === "pending" || review === "undone";
          });
      if (!proposal) return { ok: false, failure: { kind: "no_staged_proposal", alias } };
      const proposalReview = managed.review.get(proposal.proposalId) ?? "pending";
      if (proposalReview === "applied") {
        return { ok: false, failure: { kind: "already_applied", alias } };
      }
      if (proposalReview === "rejected") {
        return { ok: false, failure: { kind: "no_staged_proposal", alias } };
      }
      const rejected = await rejectBundleProposal(
        managed.session.docsRoot,
        proposal.docPath,
        proposal.proposalId,
        { sessionId: managed.session.id },
      );
      if (!rejected.ok) return { ok: false, failure: failureFromBackend("reject_failed", rejected) };
      const closingNote = note?.trim() || "Rejected in review.";
      managed.review.set(proposal.proposalId, "rejected");
      const marked = managed.session.markRejected(
        alias,
        proposal.proposalId,
        closingNote,
      );
      const annotation = marked.ok && marked.request.status !== "ready"
        ? await annotationOutcome(managed, entry, closingNote, false)
        : {
            annotationId: entry.annotationId,
            attached: false,
            resolved: false,
            detail: "request-still-ready",
          };
      const request = managed.session.requests().find((candidate) => candidate.alias === alias)!;
      const rejectedEverything = managed.changesetId !== undefined &&
        managed.session.proposals().every(
          (candidate) => managed.review.get(candidate.proposalId) === "rejected",
        );
      if (rejectedEverything) {
        const changeset = await docsStoreFor(managed).changesetReject(
          managed.changesetId!,
          managed.session.id,
        );
        if (changeset.ok) {
          emit(managed, {
            type: "changeset-updated",
            sessionId: managed.session.id,
            changeset: changeset.changeset,
          });
        } else {
          await emitFreshChangeSet(managed);
        }
      } else {
        await emitFreshChangeSet(managed);
      }
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
      const latestForAlias = [...managed.applied].reverse().find(
        (applied) => applied.alias === alias && managed.review.get(applied.proposalId) === "applied",
      );
      if (!latestForAlias) return { ok: false, failure: { kind: "not_applied", alias } };
      const latest = managed.applied.at(-1);
      if (!latest || latest.proposalId !== latestForAlias.proposalId) {
        return { ok: false, failure: { kind: "not_latest_applied", alias, lastAppliedAlias: latest?.alias ?? alias } };
      }

      if (managed.changesetId) {
        const changeset = await docsStoreFor(managed).changesetGet(managed.changesetId);
        if (changeset.ok && changeset.changeset.status === "applied") {
          const undone = await docsStoreFor(managed).changesetUndo(
            managed.changesetId,
            managed.session.id,
          );
          if (!undone.ok) {
            return {
              ok: false,
              failure: failureFromBackend("undo_failed", undone),
            };
          }
          const hashes = new Map<string, string>();
          await Promise.all(
            [...new Set(managed.applied.map((applied) => applied.docPath))].map(
              async (path) => {
                const loaded = await loadDocBundle(managed.session.docsRoot, path);
                if (!("error" in loaded)) hashes.set(path, loaded.docHash);
              },
            ),
          );
          const appliedBatch = [...managed.applied];
          managed.applied = [];
          for (const applied of appliedBatch) {
            const hash = hashes.get(applied.docPath) ?? managed.session.baseHash;
            if (applied.docPath === managed.normalizedPath) managed.currentHash = hash;
            managed.review.set(applied.proposalId, "undone");
            managed.session.markUndone(applied.alias, applied.proposalId, hash);
          }
          emit(managed, {
            type: "changeset-updated",
            sessionId: managed.session.id,
            changeset: undone.changeset,
          });
          return {
            ok: true,
            alias,
            proposalId: latest.proposalId,
            patchId: latest.patchId,
            hash: hashes.get(latest.docPath) ?? managed.session.baseHash,
          };
        }
      }

      const undone = await undo_patch(managed.session.docsRoot, latest.patchId);
      if (!undone.ok) return { ok: false, failure: failureFromBackend("undo_failed", undone) };
      if (undone.kind !== "doc") {
        return { ok: false, failure: { kind: "undo_failed", status: 400, detail: "Patch was not a document patch" } };
      }
      managed.applied.pop();
      if (latest.docPath === managed.normalizedPath) {
        managed.currentHash = undone.hash;
      }
      managed.review.set(latest.proposalId, "undone");
      managed.session.markUndone(alias, latest.proposalId, undone.hash);
      const entry = managed.session.requests().find(
        (candidate) => candidate.alias === alias,
      );
      const proposal = managed.session.proposals().find(
        (candidate) => candidate.proposalId === latest.proposalId,
      );
      if (entry && proposal) await restage(managed, entry, proposal, false);
      await emitFreshChangeSet(managed);
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
      releaseSessionClaims(managed.claimOwnerId);
      return true;
    },

    disposeAll() {
      for (const sessionId of [...sessions.keys()]) this.dispose(sessionId);
    },
  };
}

function failureFromBackend<K extends "apply_failure" | "reject_failed" | "undo_failed">(
  kind: K,
  value: { status?: number; detail?: string; current_hash?: string; issues?: unknown; lint?: LintReport },
): { kind: K; status: number; detail: string; currentHash?: string; issues?: unknown; lint?: LintReport } {
  return {
    kind,
    status: value.status ?? 400,
    detail: value.detail ?? "Docs operation failed",
    ...(value.current_hash !== undefined ? { currentHash: value.current_hash } : {}),
    ...(value.issues !== undefined ? { issues: value.issues } : {}),
    ...(value.lint !== undefined ? { lint: value.lint } : {}),
  };
}
