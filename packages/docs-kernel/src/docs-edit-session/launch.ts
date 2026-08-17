import type { DocChangeSetView } from "@codecaine-ai/docs-server";
import type { DocsEditProposal, DocsEditRequestInput } from "./types";
import type { SkippedDocsAnnotation } from "./from-annotations";
import { loadDocsEditRequestsFromAnnotations } from "./from-annotations";
import { createDocsEditSession, type DocsEditSession } from "./session";
import { docsEditSessionTools } from "./tools";
import {
  sessionDataForDocsEditSession,
  type DocsEditSessionData,
} from "./session-data";

export interface LaunchDocsEditSessionOptions {
  docsRoot: string;
  path: string;
  requestIds?: readonly string[];
  extraRequests?: DocsEditRequestInput[];
  instruction?: string;
  sessionId?: string;
  /** Service-owned persistence hook; direct launch callers can omit it. */
  onProposalStaged?: (proposal: DocsEditProposal) => void | Promise<void>;
  onChangeSetStaged?: (changeset: DocChangeSetView) => void | Promise<void>;
  onProposalsSuperseded?: (
    alias: string,
    proposals: readonly DocsEditProposal[],
  ) => void | Promise<void>;
}

export interface LaunchedDocsEditSession {
  ok: true;
  session: DocsEditSession;
  tools: ReturnType<typeof docsEditSessionTools>;
  skipped: SkippedDocsAnnotation[];
  scope: readonly string[] | null;
  spawn: {
    agentName: "docs-writer";
    prompt: string;
    sessionData: DocsEditSessionData;
  };
}

export type LaunchDocsEditSessionFailure =
  | { ok: false; reason: "unknown-doc"; path: string }
  | { ok: false; reason: "launch-error"; errors: string[] }
  | {
      ok: false;
      reason: "empty-scope";
      requestIds: readonly string[];
      skipped: SkippedDocsAnnotation[];
    };

export type LaunchDocsEditSessionResult = LaunchedDocsEditSession | LaunchDocsEditSessionFailure;

export const DEFAULT_DOCS_EDIT_KICKOFF = [
  "Work the request queue for this documentation bundle in docs-edit session mode.",
  "Call read_doc first. Whole-document docs_write is unavailable because it would regenerate block ids.",
  "Use only read_doc, docs_tree, docs_read, propose_ops, propose_move_blocks, resolve_request, and reply_request.",
  "Stage id-stable DocOps with propose_ops, one proposal per request, then resolve each request.",
].join(" ");

export async function launchDocsEditSession(
  options: LaunchDocsEditSessionOptions,
): Promise<LaunchDocsEditSessionResult> {
  const loaded = await loadDocsEditRequestsFromAnnotations(
    options.docsRoot,
    options.path,
    options.requestIds !== undefined ? { scopeIds: options.requestIds } : {},
  );
  if (!loaded.ok) {
    if (loaded.status === 404) return { ok: false, reason: "unknown-doc", path: options.path };
    return { ok: false, reason: "launch-error", errors: [loaded.detail] };
  }
  // Host-added requests never point at annotations.json, even if untrusted
  // wire input attempts to mark them otherwise.
  const extras = (options.extraRequests ?? []).map((request) => ({
    ...request,
    sidecarBacked: false,
  }));
  const requests = [...loaded.requests, ...extras];
  if (requests.length === 0) {
    return {
      ok: false,
      reason: "empty-scope",
      requestIds: options.requestIds ?? [],
      skipped: loaded.skipped,
    };
  }

  const session = createDocsEditSession({
    docsRoot: options.docsRoot,
    path: loaded.path,
    document: loaded.document,
    baseHash: loaded.docHash,
    requests,
    instruction: options.instruction,
    sessionId: options.sessionId,
    onProposalStaged: options.onProposalStaged,
    onChangeSetStaged: options.onChangeSetStaged,
    onProposalsSuperseded: options.onProposalsSuperseded,
  });
  const sessionData = sessionDataForDocsEditSession(session);
  return {
    ok: true,
    session,
    tools: docsEditSessionTools(session),
    skipped: loaded.skipped,
    scope: options.requestIds ?? null,
    spawn: {
      agentName: "docs-writer",
      prompt: options.instruction
        ? `${DEFAULT_DOCS_EDIT_KICKOFF}\n\nOperator instruction: ${options.instruction}`
        : DEFAULT_DOCS_EDIT_KICKOFF,
      sessionData,
    },
  };
}

export function relaunchDocsEditSession(
  previous: LaunchedDocsEditSession,
  aliases: readonly string[],
): LaunchedDocsEditSession {
  const sessionData = sessionDataForDocsEditSession(previous.session);
  return {
    ...previous,
    tools: docsEditSessionTools(previous.session),
    spawn: {
      agentName: "docs-writer",
      sessionData,
      prompt: docsEditRerunKickoff(aliases),
    },
  };
}

/** Kickoff for the single coalesced follow-up turn after human replies. */
export function docsEditRerunKickoff(aliases: readonly string[]): string {
  return [
    `The human replied on ${aliases.join(", ")}.`,
    "Continue the same docs-edit session. Read the live queue with read_doc, account for the reply,",
    "and revise the request by staging id-stable DocOps through propose_ops. docs_write remains unavailable.",
  ].join(" ");
}
