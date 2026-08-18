/**
 * docs-edit-session/tools — host-bound tools for one docs-edit session.
 *
 * These handlers deliberately return failures as tool results. A malformed
 * model call, an unreadable bundle, or a backend/session refusal must not tear
 * down the agent turn. Mutations remain delegated to the session, which stages
 * DocProposals through docs-server in this process.
 */
import type { CreateKernelConfig } from "@agent-kernel/kernel";
import type {
  DeltaSpan,
  DeltaSpanAttributes,
  DocDocument,
} from "@codecaine-ai/docs-model/doc-schema";
import { isDocBlockType } from "@codecaine-ai/docs-model/doc-schema";
import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";
import {
  doc_get,
  getBundleProposals,
  walkDocsDir,
  type DocsTreeNode,
} from "@codecaine-ai/docs-server";
import {
  moveBlocksChangeSet,
  type DocChangeSetView,
} from "@codecaine-ai/docs-server/changesets";

import type {
  DocsEditProposal,
  DocsEditProposeResult,
  DocsEditRequestEntry,
  DocsEditSessionStatus,
} from "./types";
import { isDocsEditRequestTerminal } from "./types";
import { renderDocsBlockMap } from "./render";

export interface DocsEditToolResult {
  text: string;
  details?: Record<string, unknown>;
  isError?: boolean;
}

export const DOCS_EDIT_TOOL_NAMES = [
  "read_doc",
  "docs_tree",
  "docs_read",
  "propose_ops",
  "propose_move_blocks",
  "resolve_request",
  "reply_request",
] as const;

export type DocsEditToolName = (typeof DOCS_EDIT_TOOL_NAMES)[number];

type Awaitable<T> = T | Promise<T>;

export type DocsEditRequestActionResult =
  | { ok: true; request: DocsEditRequestEntry }
  | { ok: false; message: string };

/**
 * Structural session surface consumed by the tools. The concrete session can
 * expose additional review/service methods without coupling this module to
 * their implementation.
 */
export interface DocsEditToolSession {
  readonly id: string;
  readonly docsRoot: string;
  readonly path: string;
  readonly docId: string;
  readonly baseHash: string;
  document(): DocDocument;
  renderedDocument(): string;
  requests(): readonly DocsEditRequestEntry[];
  requestsBlock(): string;
  status(): DocsEditSessionStatus;
  propose(
    alias: string,
    ops: DocOp[],
    summary: string,
    docPath?: string,
  ): Promise<DocsEditProposeResult>;
  adoptChangeSet(
    alias: string,
    changeset: DocChangeSetView,
    proposals: readonly DocsEditProposal[],
  ): Promise<DocsEditRequestActionResult>;
  supersedeProposals(alias: string): Promise<DocsEditRequestActionResult>;
  resolve(
    alias: string,
    outcome: "done" | "declined",
    note: string,
  ): Awaitable<DocsEditRequestActionResult>;
  reply(alias: string, body: string): Awaitable<DocsEditRequestActionResult>;
}

export interface DocsEditToolOptions {
  docsRoot: string;
}

export interface DocsEditOpParseError {
  code: "invalid_op_shape";
  opIndex: number;
  path: string;
  message: string;
}

export type ParseDocsEditOpsResult =
  | { ok: true; ops: DocOp[] }
  | { ok: false; errors: DocsEditOpParseError[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,96}$/.test(value)
  );
}

function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

const DELTA_ATTRIBUTE_KEYS = new Set([
  "bold",
  "italic",
  "strike",
  "code",
  "link",
  "reference",
]);

function parseDeltaAttributes(value: unknown): DeltaSpanAttributes | null {
  if (!isRecord(value)) return null;
  if (Object.keys(value).some((key) => !DELTA_ATTRIBUTE_KEYS.has(key))) {
    return null;
  }
  for (const mark of ["bold", "italic", "strike", "code"] as const) {
    if (value[mark] !== undefined && value[mark] !== true) return null;
  }
  if (
    value.link !== undefined &&
    (typeof value.link !== "string" || value.link.length === 0)
  ) {
    return null;
  }
  if (value.reference !== undefined && !isJsonRecord(value.reference)) {
    return null;
  }
  return value as DeltaSpanAttributes;
}

function parseDelta(value: unknown): DeltaSpan[] | null {
  if (!Array.isArray(value)) return null;
  const spans: DeltaSpan[] = [];
  for (const rawSpan of value) {
    if (!isRecord(rawSpan)) return null;
    const keys = Object.keys(rawSpan);
    if (
      keys.some((key) => key !== "insert" && key !== "attributes") ||
      typeof rawSpan.insert !== "string"
    ) {
      return null;
    }
    if (rawSpan.attributes === undefined) {
      spans.push({ insert: rawSpan.insert });
      continue;
    }
    const attributes = parseDeltaAttributes(rawSpan.attributes);
    if (!attributes) return null;
    spans.push({ insert: rawSpan.insert, attributes });
  }
  return spans;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function invalidOp(
  opIndex: number,
  message: string,
  suffix = "",
): DocsEditOpParseError {
  return {
    code: "invalid_op_shape",
    opIndex,
    path: `$.ops[${opIndex}]${suffix}`,
    message,
  };
}

function parseOneDocOp(
  value: unknown,
  opIndex: number,
): DocOp | DocsEditOpParseError {
  if (!isRecord(value) || typeof value.type !== "string") {
    return invalidOp(opIndex, "Each op must be an object with a supported type.");
  }

  switch (value.type) {
    case "insertBlock": {
      if (
        !hasOnlyKeys(
          value,
          ["type", "blockId", "parentId", "index", "blockType", "props"],
          ["text"],
        ) ||
        !isId(value.blockId) ||
        !isId(value.parentId) ||
        !Number.isInteger(value.index) ||
        (value.index as number) < 0 ||
        !isDocBlockType(value.blockType) ||
        !isJsonRecord(value.props)
      ) {
        return invalidOp(
          opIndex,
          "insertBlock requires valid blockId, parentId, non-negative index, blockType, and JSON-object props.",
        );
      }
      let text: DeltaSpan[] | undefined;
      if (value.text !== undefined) {
        const parsed = parseDelta(value.text);
        if (!parsed) {
          return invalidOp(
            opIndex,
            "insertBlock.text must be an array of valid delta spans.",
            ".text",
          );
        }
        text = parsed;
      }
      return {
        type: "insertBlock",
        blockId: value.blockId,
        parentId: value.parentId,
        index: value.index as number,
        blockType: value.blockType,
        props: value.props,
        ...(text !== undefined ? { text } : {}),
      };
    }

    case "updateBlock": {
      if (
        !hasOnlyKeys(value, ["type", "blockId"], ["props", "text"]) ||
        !isId(value.blockId) ||
        (value.props !== undefined && !isJsonRecord(value.props))
      ) {
        return invalidOp(
          opIndex,
          "updateBlock requires a valid blockId and optional JSON-object props.",
        );
      }
      let text: DeltaSpan[] | null | undefined;
      if (value.text === null) {
        text = null;
      } else if (value.text !== undefined) {
        const parsed = parseDelta(value.text);
        if (!parsed) {
          return invalidOp(
            opIndex,
            "updateBlock.text must be null or an array of valid delta spans.",
            ".text",
          );
        }
        text = parsed;
      }
      return {
        type: "updateBlock",
        blockId: value.blockId,
        ...(value.props !== undefined ? { props: value.props } : {}),
        ...(text !== undefined ? { text } : {}),
      };
    }

    case "deleteBlock":
      if (
        !hasOnlyKeys(value, ["type", "blockId"], ["mode"]) ||
        !isId(value.blockId) ||
        (value.mode !== undefined &&
          value.mode !== "subtree" &&
          value.mode !== "reparent")
      ) {
        return invalidOp(
          opIndex,
          'deleteBlock requires a valid blockId and optional mode "subtree" or "reparent".',
        );
      }
      return {
        type: "deleteBlock",
        blockId: value.blockId,
        ...(value.mode !== undefined ? { mode: value.mode } : {}),
      };

    case "moveBlock":
      if (
        !hasOnlyKeys(value, ["type", "blockId", "toParentId", "toIndex"]) ||
        !isId(value.blockId) ||
        !isId(value.toParentId) ||
        !Number.isInteger(value.toIndex) ||
        (value.toIndex as number) < 0
      ) {
        return invalidOp(
          opIndex,
          "moveBlock requires valid blockId/toParentId and a non-negative integer toIndex.",
        );
      }
      return {
        type: "moveBlock",
        blockId: value.blockId,
        toParentId: value.toParentId,
        toIndex: value.toIndex as number,
      };

    case "splitBlock":
      if (
        !hasOnlyKeys(value, ["type", "blockId", "offset"]) ||
        !isId(value.blockId) ||
        !Number.isInteger(value.offset) ||
        (value.offset as number) < 0
      ) {
        return invalidOp(
          opIndex,
          "splitBlock requires a valid blockId and non-negative integer offset.",
        );
      }
      return {
        type: "splitBlock",
        blockId: value.blockId,
        offset: value.offset as number,
      };

    case "mergeBlocks":
      if (
        !hasOnlyKeys(value, ["type", "blockIds"]) ||
        !Array.isArray(value.blockIds) ||
        value.blockIds.length < 2 ||
        !value.blockIds.every(isId)
      ) {
        return invalidOp(
          opIndex,
          "mergeBlocks requires at least two valid blockIds.",
        );
      }
      return { type: "mergeBlocks", blockIds: [...value.blockIds] };

    case "componentAction":
      if (
        !hasOnlyKeys(value, ["type", "blockId", "action", "params"]) ||
        !isId(value.blockId) ||
        typeof value.action !== "string" ||
        value.action.trim() === "" ||
        !isJsonRecord(value.params)
      ) {
        return invalidOp(
          opIndex,
          "componentAction requires a valid blockId, non-empty action, and JSON-object params.",
        );
      }
      return {
        type: "componentAction",
        blockId: value.blockId,
        action: value.action,
        params: value.params,
      };

    default:
      return invalidOp(opIndex, `Unsupported doc op type: ${value.type}`);
  }
}

/** Strict unknown-to-DocOp[] boundary used before docs-server staging. */
export function parseDocsEditOps(value: unknown): ParseDocsEditOpsResult {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      errors: [invalidOp(-1, "ops must be a non-empty array.")],
    };
  }
  if (value.length === 0) {
    return {
      ok: false,
      errors: [invalidOp(-1, "ops must contain at least one operation.")],
    };
  }

  const ops: DocOp[] = [];
  const errors: DocsEditOpParseError[] = [];
  for (const [index, raw] of value.entries()) {
    const parsed = parseOneDocOp(raw, index);
    if ("code" in parsed) errors.push(parsed);
    else ops.push(parsed);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, ops };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toolFailure(
  tool: DocsEditToolName,
  message: string,
  details: Record<string, unknown> = {},
): DocsEditToolResult {
  return {
    isError: true,
    text: `${tool} rejected: ${message}`,
    details: { ok: false, ...details },
  };
}

function proposeFailureText(result: Exclude<DocsEditProposeResult, { ok: true }>): string {
  const failure = result.failure;
  switch (failure.kind) {
    case "unknown_request":
      return `no request "${failure.alias}" exists in this queue.`;
    case "request_terminal":
      return `${failure.alias} is already terminal (${failure.status}).`;
    case "invalid_params":
      return failure.message;
    case "stage_failed": {
      const issues = Array.isArray(failure.issues)
        ? failure.issues
            .map((issue) => {
              if (!isRecord(issue)) return `  - ${String(issue)}`;
              const path = typeof issue.path === "string" ? issue.path : "$";
              const message =
                typeof issue.message === "string"
                  ? issue.message
                  : JSON.stringify(issue);
              return `  - ${path}: ${message}`;
            })
            .join("\n")
        : "";
      return `${failure.detail}${issues ? `\n${issues}` : ""}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Pure handlers
// ---------------------------------------------------------------------------

export function toolReadDoc(session: DocsEditToolSession): DocsEditToolResult {
  try {
    const document = session.document();
    return {
      text: [
        `DOCUMENT · ${session.path} · id ${session.docId} · base ${session.baseHash}`,
        "Block ids are stable identifiers used by DocOps; the BLOCK MAP section lists every block.",
        "",
        session.renderedDocument(),
        "",
        session.requestsBlock(),
      ].join("\n"),
      details: {
        path: session.path,
        docId: document.id,
        rootBlockId: document.root,
        baseHash: session.baseHash,
        status: session.status(),
      },
    };
  } catch (error) {
    return toolFailure("read_doc", errorMessage(error));
  }
}

export async function toolDocsTree(
  options: DocsEditToolOptions,
): Promise<DocsEditToolResult> {
  try {
    const tree = await walkDocsDir(options.docsRoot);
    return {
      text:
        tree.length === 0
          ? "DOCS TREE · empty"
          : `DOCS TREE\n${JSON.stringify(tree, null, 2)}`,
      details: { ok: true, tree, count: countBundles(tree) },
    };
  } catch (error) {
    return toolFailure("docs_tree", errorMessage(error));
  }
}

function countBundles(nodes: readonly DocsTreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.kind === "bundle") count += 1;
    if (node.children) count += countBundles(node.children);
  }
  return count;
}

export async function toolDocsRead(
  options: DocsEditToolOptions,
  params: { path?: unknown },
): Promise<DocsEditToolResult> {
  const path = typeof params.path === "string" ? params.path.trim() : "";
  if (path === "") {
    return toolFailure("docs_read", "path must name a document bundle.");
  }
  try {
    const result = await doc_get(options.docsRoot, path);
    if (!result.ok) {
      return toolFailure("docs_read", result.detail, {
        path,
        status: result.status,
      });
    }
    return {
      text: `${result.markdown}\n\n${renderDocsBlockMap(result.doc)}`,
      details: {
        ok: true,
        path: result.bundlePath,
        docId: result.doc.id,
        title: result.doc.title ?? null,
        blocks: Object.keys(result.doc.blocks).length,
        hash: result.hash,
      },
    };
  } catch (error) {
    return toolFailure("docs_read", errorMessage(error), { path });
  }
}

export async function toolProposeOps(
  session: DocsEditToolSession,
  params: {
    requestAlias?: unknown;
    ops?: unknown;
    summary?: unknown;
    docPath?: unknown;
  },
): Promise<DocsEditToolResult> {
  const alias =
    typeof params.requestAlias === "string" ? params.requestAlias.trim() : "";
  if (alias === "") {
    return toolFailure(
      "propose_ops",
      'requestAlias must name a queue entry (for example "R1").',
    );
  }
  if (typeof params.summary !== "string" || params.summary.trim() === "") {
    return toolFailure("propose_ops", "summary must be a non-empty string.");
  }
  if (
    params.docPath !== undefined &&
    (typeof params.docPath !== "string" || params.docPath.trim() === "")
  ) {
    return toolFailure(
      "propose_ops",
      "docPath must be a non-empty docs-root-relative bundle path when provided.",
    );
  }
  const parsed = parseDocsEditOps(params.ops);
  if (!parsed.ok) {
    return {
      isError: true,
      text: [
        "propose_ops rejected: malformed ops. Nothing was staged. Fix and retry:",
        ...parsed.errors.map(
          (error) => `  - [${error.code}] ${error.path}: ${error.message}`,
        ),
      ].join("\n"),
      details: { ok: false, errors: parsed.errors },
    };
  }

  try {
    const docPath =
      typeof params.docPath === "string" ? params.docPath.trim() : undefined;
    const result = await session.propose(
      alias,
      parsed.ops,
      params.summary,
      docPath,
    );
    if (!result.ok) {
      return toolFailure("propose_ops", proposeFailureText(result), {
        failure: result.failure,
      });
    }
    const proposal = result.proposal;
    return {
      text: [
        `STAGED · proposal ${proposal.proposalId} for ${proposal.requestAlias} (held for human review — not applied)`,
        `changed blocks: ${proposal.changedBlockIds.join(", ") || "(none reported)"}`,
        `summary: ${proposal.summary}`,
        "",
        session.requestsBlock(),
      ].join("\n"),
      details: proposalDetails(proposal),
    };
  } catch (error) {
    return toolFailure("propose_ops", errorMessage(error));
  }
}

export async function toolProposeMoveBlocks(
  session: DocsEditToolSession,
  params: {
    requestAlias?: unknown;
    blockIds?: unknown;
    destDocPath?: unknown;
    destPosition?: unknown;
    sourceDocPath?: unknown;
  },
): Promise<DocsEditToolResult> {
  const alias = typeof params.requestAlias === "string" ? params.requestAlias.trim() : "";
  if (alias === "") {
    return toolFailure("propose_move_blocks", 'requestAlias must name a queue entry (for example "R1").');
  }
  const request = session.requests().find(
    (entry) => entry.alias === alias || entry.annotationId === alias,
  );
  if (!request) return toolFailure("propose_move_blocks", `No request "${alias}" in the queue.`);
  if (isDocsEditRequestTerminal(request.status)) {
    return toolFailure("propose_move_blocks", `${request.alias} is already ${request.status}.`);
  }
  if (!Array.isArray(params.blockIds) || params.blockIds.length === 0) {
    return toolFailure("propose_move_blocks", "blockIds must be a non-empty array of strings or integers.");
  }
  if (!params.blockIds.every((id) => typeof id === "string" || Number.isInteger(id))) {
    return toolFailure("propose_move_blocks", "blockIds must contain only strings or integers.");
  }
  const blockIds = params.blockIds.map(String);
  if (blockIds.some((id) => id.trim() === "")) {
    return toolFailure("propose_move_blocks", "blockIds must not contain empty strings.");
  }
  const destDocPath = typeof params.destDocPath === "string" ? params.destDocPath.trim() : "";
  if (destDocPath === "") return toolFailure("propose_move_blocks", "destDocPath must name a document bundle.");
  if (!Number.isInteger(params.destPosition)) {
    return toolFailure("propose_move_blocks", "destPosition must be an integer.");
  }
  if (params.sourceDocPath !== undefined &&
      (typeof params.sourceDocPath !== "string" || params.sourceDocPath.trim() === "")) {
    return toolFailure("propose_move_blocks", "sourceDocPath must name a document bundle when provided.");
  }
  const sourceDocPath = typeof params.sourceDocPath === "string"
    ? params.sourceDocPath.trim()
    : session.path;

  try {
    const superseded = await session.supersedeProposals(request.alias);
    if (!superseded.ok) {
      return toolFailure("propose_move_blocks", superseded.message);
    }
    const generated = await moveBlocksChangeSet(session.docsRoot, {
      sourceDocPath,
      blockIds,
      destDocPath,
      destPosition: params.destPosition as number,
      sessionId: session.id,
      alias: request.alias,
      ...(request.sidecarBacked
        ? { annotationId: request.annotationId, annotationDocPath: session.path }
        : {}),
    });
    if (!generated.ok) {
      return toolFailure("propose_move_blocks", generated.detail, { status: generated.status });
    }
    const proposals: DocsEditProposal[] = [];
    for (const entry of generated.changeset.entries) {
      const listed = await getBundleProposals(session.docsRoot, entry.docPath);
      if (!listed.ok) {
        return toolFailure("propose_move_blocks", listed.detail, { status: listed.status });
      }
      const proposal = listed.proposals.find((candidate) => candidate.id === entry.proposalId);
      if (!proposal) {
        return toolFailure("propose_move_blocks", `Generated proposal ${entry.proposalId} is missing from ${entry.docPath}.`);
      }
      proposals.push({
        proposalId: proposal.id,
        requestAlias: request.alias,
        docPath: entry.docPath,
        baseHash: proposal.baseHash,
        ops: [...proposal.ops],
        changedBlockIds: [...proposal.changedBlockIds],
        summary: proposal.summary,
        createdAt: proposal.createdAt,
      });
    }
    const adopted = await session.adoptChangeSet(request.alias, generated.changeset, proposals);
    if (!adopted.ok) return toolFailure("propose_move_blocks", adopted.message);
    return {
      text: [
        `STAGED · change-set ${generated.changeset.id} for ${request.alias} (held for human review — not applied)`,
        ...generated.changeset.entries.map((entry) =>
          `${entry.docPath}: +${entry.addCount} -${entry.delCount}`),
        `annotation migrations: ${generated.changeset.annotationMigrations.length}`,
        "",
        session.requestsBlock(),
      ].join("\n"),
      details: { ok: true, changeset: generated.changeset },
    };
  } catch (error) {
    return toolFailure("propose_move_blocks", errorMessage(error));
  }
}

function proposalDetails(proposal: DocsEditProposal): Record<string, unknown> {
  return {
    ok: true,
    proposalId: proposal.proposalId,
    requestAlias: proposal.requestAlias,
    docPath: proposal.docPath,
    baseHash: proposal.baseHash,
    changedBlockIds: proposal.changedBlockIds,
  };
}

export async function toolResolveRequest(
  session: DocsEditToolSession,
  params: { alias?: unknown; outcome?: unknown; note?: unknown },
): Promise<DocsEditToolResult> {
  const alias = typeof params.alias === "string" ? params.alias.trim() : "";
  if (alias === "") {
    return toolFailure(
      "resolve_request",
      'alias must name a queue entry (for example "R1").',
    );
  }
  if (params.outcome !== "done" && params.outcome !== "declined") {
    return toolFailure(
      "resolve_request",
      'outcome must be "done" or "declined".',
    );
  }
  if (typeof params.note !== "string") {
    return toolFailure("resolve_request", "note must be a string.");
  }

  try {
    const result = await session.resolve(alias, params.outcome, params.note);
    if (!result.ok) {
      return toolFailure("resolve_request", result.message, {
        alias,
      });
    }
    return {
      text: session.requestsBlock(),
      details: {
        ok: true,
        alias: result.request.alias,
        status: result.request.status,
        sessionStatus: session.status(),
      },
    };
  } catch (error) {
    return toolFailure("resolve_request", errorMessage(error), { alias });
  }
}

export async function toolReplyRequest(
  session: DocsEditToolSession,
  params: { alias?: unknown; body?: unknown },
): Promise<DocsEditToolResult> {
  const alias = typeof params.alias === "string" ? params.alias.trim() : "";
  const body = typeof params.body === "string" ? params.body.trim() : "";
  if (alias === "") {
    return toolFailure(
      "reply_request",
      'alias must name a queue entry (for example "R1").',
    );
  }
  if (body === "") {
    return toolFailure("reply_request", "body must be a non-empty string.");
  }

  try {
    const result = await session.reply(alias, body);
    if (!result.ok) {
      return toolFailure("reply_request", result.message, { alias });
    }
    return {
      text: [
        `REPLIED · ${result.request.alias} (waiting-on-human — keep working on the remaining queue)`,
        "",
        session.requestsBlock(),
      ].join("\n"),
      details: {
        ok: true,
        alias: result.request.alias,
        waitingOnHuman: result.request.waitingOnHuman,
      },
    };
  } catch (error) {
    return toolFailure("reply_request", errorMessage(error), { alias });
  }
}

// ---------------------------------------------------------------------------
// Kernel/pi binding
// ---------------------------------------------------------------------------

type SharedToolFactory = ReturnType<
  NonNullable<CreateKernelConfig["sharedTools"]>
>[number];
type SharedToolApi = Parameters<SharedToolFactory>[0];

interface BoundToolDefinition {
  name: DocsEditToolName;
  label: string;
  description: string;
  promptSnippet: string;
  parameters: Record<string, unknown>;
  executionMode: "sequential";
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
  ): Promise<{
    content: Array<{ type: "text"; text: string }>;
    details: Record<string, unknown>;
    isError?: boolean;
  }>;
}

function objectSchema(
  properties: Record<string, Record<string, unknown>>,
  required: string[] = [],
): Record<string, unknown> {
  return {
    type: "object",
    ...(required.length > 0 ? { required } : {}),
    properties,
    additionalProperties: false,
  };
}

function toPiResult(result: DocsEditToolResult): {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
  isError?: boolean;
} {
  return {
    content: [{ type: "text", text: result.text }],
    details: result.details ?? {},
    ...(result.isError ? { isError: true } : {}),
  };
}

/** Register the exact seven-tool session-mode surface. */
export function registerDocsEditSessionTools(
  pi: SharedToolApi,
  session: DocsEditToolSession,
  options: DocsEditToolOptions,
): void {
  const register = pi.registerTool.bind(pi) as unknown as (
    definition: BoundToolDefinition,
  ) => void;

  register({
    name: "read_doc",
    label: "Read session document",
    description:
      "Read the session document as sanctioned markdown plus a block map of stable block ids and the live request queue. Call this before proposing operations and after a thread reply.",
    promptSnippet: "Read the current document and docs-edit request queue.",
    parameters: objectSchema({}),
    executionMode: "sequential",
    execute: async () => toPiResult(toolReadDoc(session)),
  });

  register({
    name: "docs_tree",
    label: "Docs tree",
    description:
      "List the docs corpus using the host's confined, read-only docs-tree path.",
    promptSnippet: "List neighboring document bundles in the docs corpus.",
    parameters: objectSchema({}),
    executionMode: "sequential",
    execute: async () => toPiResult(await toolDocsTree(options)),
  });

  register({
    name: "docs_read",
    label: "Read another document",
    description:
      "Read another document bundle as sanctioned markdown. Includes a block map of stable block ids. This is read-only and paths are relative to the configured docs root.",
    promptSnippet: "Read a related document through the sanctioned render path.",
    parameters: objectSchema(
      { path: { type: "string", description: "Document bundle path." } },
      ["path"],
    ),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toPiResult(await toolDocsRead(options, params)),
  });

  register({
    name: "propose_ops",
    label: "Propose document operations",
    description:
      "Strictly validate and stage id-stable DocOps for one request, optionally against another document via docPath for cross-doc staging. The proposal is held for human review and never applied by this tool.",
    promptSnippet:
      "Stage validated DocOps for one request alias, using docPath for cross-doc staging when needed.",
    parameters: objectSchema(
      {
        requestAlias: {
          type: "string",
          description: 'Queue alias, for example "R1".',
        },
        ops: {
          type: "array",
          minItems: 1,
          items: { type: "object", additionalProperties: true },
        },
        summary: {
          type: "string",
          description: "One-line reviewer summary.",
        },
        docPath: {
          type: "string",
          description:
            "Optional docs-root-relative document bundle path for cross-doc staging; defaults to the session document.",
        },
      },
      ["requestAlias", "ops", "summary"],
    ),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toPiResult(await toolProposeOps(session, params)),
  });

  register({
    name: "propose_move_blocks",
    label: "Propose moving blocks",
    description: "Stage a multi-document change-set that moves block subtrees between documents for human review.",
    promptSnippet: "Stage an atomic cross-document block move for one request alias.",
    parameters: objectSchema({
      requestAlias: { type: "string" },
      blockIds: { type: "array", minItems: 1, items: { anyOf: [{ type: "string" }, { type: "integer" }] } },
      destDocPath: { type: "string" },
      destPosition: { type: "integer" },
      sourceDocPath: { type: "string", description: "Optional source bundle path; defaults to the session document." },
    }, ["requestAlias", "blockIds", "destDocPath", "destPosition"]),
    executionMode: "sequential",
    execute: async (_toolCallId, params) => toPiResult(await toolProposeMoveBlocks(session, params)),
  });

  register({
    name: "resolve_request",
    label: "Resolve a request",
    description:
      'Close a request as "done" when no proposal is needed, or "declined" when it will not be performed. A staged proposal should remain ready for human review.',
    promptSnippet: "Resolve a no-op request or decline a request with a note.",
    parameters: objectSchema(
      {
        alias: { type: "string" },
        outcome: { type: "string", enum: ["done", "declined"] },
        note: { type: "string" },
      },
      ["alias", "outcome", "note"],
    ),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toPiResult(await toolResolveRequest(session, params)),
  });

  register({
    name: "reply_request",
    label: "Reply in a request thread",
    description:
      "Post a clarifying question or progress reply without closing the request. The request becomes waiting-on-human; continue working other requests.",
    promptSnippet: "Reply to a request thread without blocking the agent turn.",
    parameters: objectSchema(
      { alias: { type: "string" }, body: { type: "string" } },
      ["alias", "body"],
    ),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toPiResult(await toolReplyRequest(session, params)),
  });
}

/** Per-session shared-tool factory consumed by docsEditSharedTools' FIFO. */
export function docsEditSessionTools(
  session: DocsEditToolSession,
  options: DocsEditToolOptions = { docsRoot: session.docsRoot },
): SharedToolFactory {
  return (pi) => registerDocsEditSessionTools(pi, session, options);
}
