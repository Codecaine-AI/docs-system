import { formatLintReport } from "@codecaine-ai/docs-model/lint";
/**
 * docs-edit-session/tools — host-bound editing tools for one docs-edit
 * session.
 *
 * The agent edits the document through small single-purpose tools: a blank
 * insert plus per-type typed actions whose schemas are generated from the
 * component registry, so an invalid operation shape cannot be expressed. Each
 * edit appends to the request's accumulated op list and restages the full
 * batch through the session (superseding the previous staged state), so the
 * review plumbing underneath is unchanged — the agent simply sees edits.
 *
 * Handlers deliberately return failures as tool results: a malformed model
 * call, an unreadable bundle, or a session refusal must not tear down the
 * agent turn.
 */
import type { CreateKernelConfig } from "@agent-kernel/kernel";
import type { DocBlockType, DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { isDocBlockType } from "@codecaine-ai/docs-model/doc-schema";
import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";
import {
  ALL_COMPONENTS,
  emptyStateFor,
  stateFor,
  type ComponentAction,
} from "@codecaine-ai/docs-model";
import { inlineToDelta } from "@codecaine-ai/docs-model/markdown-to-delta";
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
import type { DocsEditPathClaimResult } from "./session";
import { isDocsEditRequestTerminal } from "./types";
import { renderDocsBlockMap } from "./render";

export interface DocsEditToolResult {
  text: string;
  details?: Record<string, unknown>;
  isError?: boolean;
}

export type DocsEditToolName = string;

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
  readonly corpus: string;
  readonly docsRoot: string;
  readonly path: string;
  readonly docId: string;
  readonly baseHash: string;
  document(): DocDocument;
  renderedDocument(): string;
  requests(): readonly DocsEditRequestEntry[];
  requestsBlock(): string;
  status(): DocsEditSessionStatus;
  proposals?(): readonly DocsEditProposal[];
  claimPaths?(paths: readonly string[]): DocsEditPathClaimResult;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
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

function isId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,96}$/.test(value)
  );
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

function proposeFailureText(
  result: Exclude<DocsEditProposeResult, { ok: true }>,
): string {
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
// Generated action-tool specs (from the component registry)
// ---------------------------------------------------------------------------

/** Types whose editing is delegated to the owning authority's editor. */
const DELEGATED_TYPES: ReadonlySet<string> = new Set(["canvas", "sequence"]);

/** Tool-name prefix per action-owning block type. */
const FAMILY_TOOL_PREFIX: Readonly<Record<string, string>> = {
  code: "code",
  "structured-table": "table",
  "file-tree": "tree",
  "state-shape": "shape",
  "interaction-surface": "surface",
  "process-outline": "outline",
};

/** Block types whose scalar props are edited directly via set_props. */
const SET_PROPS_TYPES: ReadonlySet<string> = new Set([
  "paragraph",
  "heading",
  "list-item",
  "quote",
  "callout",
  "divider",
  "image",
  "video",
  "html",
  "code",
]);

function snakeCase(verb: string): string {
  return verb.replace(/([A-Z])/g, "_$1").toLowerCase();
}

/**
 * Compact per-type props summary for the set_props description, generated
 * from the registry schemas (the generic `props: object` field would
 * otherwise be the only place these shapes could live).
 */
function propsShapeSummary(): string {
  const entries: string[] = [];
  for (const type of EDITABLE_BLOCK_TYPES) {
    if (!SET_PROPS_TYPES.has(type)) continue;
    const schema = stateFor(type).schema as unknown as Record<string, unknown>;
    const properties =
      schema.properties !== null && typeof schema.properties === "object"
        ? (schema.properties as Record<string, unknown>)
        : {};
    const keys = Object.keys(properties);
    if (keys.length === 0) continue;
    const fields = keys
      .map((key) => {
        const node = properties[key] as Record<string, unknown> | null;
        const variants =
          node !== null && Array.isArray(node.anyOf)
            ? node.anyOf
                .map((entry) =>
                  entry !== null && typeof entry === "object" && "const" in entry
                    ? JSON.stringify((entry as Record<string, unknown>).const)
                    : null,
                )
                .filter((entry): entry is string => entry !== null)
            : [];
        if (variants.length > 0) return `${key}: ${variants.join("|")}`;
        if (
          node !== null &&
          node.type === "integer" &&
          typeof node.minimum === "number" &&
          typeof node.maximum === "number"
        ) {
          return `${key}: ${node.minimum}-${node.maximum}`;
        }
        return key;
      })
      .join(", ");
    entries.push(`${type} {${fields}}`);
  }
  return entries.join("; ");
}

type SchemaNode = Record<string, unknown>;

/**
 * Provider-safe copy of a TypeBox params schema: strips $id and replaces
 * recursive $ref nodes with a permissive object stub (providers do not
 * reliably resolve local refs). JSON round-trip drops TypeBox symbols.
 */
function sanitizeParamsSchema(schema: unknown): SchemaNode {
  const clone = JSON.parse(JSON.stringify(schema)) as SchemaNode;
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const record = node as SchemaNode;
    if (typeof record.$ref === "string") {
      const ref = record.$ref;
      for (const key of Object.keys(record)) delete record[key];
      record.type = "object";
      record.additionalProperties = true;
      record.description = `Recursive ${ref} object (same shape as its parent ${ref}).`;
      return;
    }
    delete record.$id;
    for (const value of Object.values(record)) walk(value);
  };
  walk(clone);
  return clone;
}

interface ActionToolSpec {
  name: string;
  actionKey: string;
  blockType: string;
  description: string;
  paramProperties: Record<string, unknown>;
  paramRequired: string[];
  paramKeys: string[];
}

function buildActionToolSpecs(): ActionToolSpec[] {
  const specs: ActionToolSpec[] = [];
  for (const component of ALL_COMPONENTS) {
    for (const action of component.actions as readonly ComponentAction[]) {
      const [blockType, verb] = action.action.split(".", 2);
      if (blockType === undefined || verb === undefined) continue;
      if (DELEGATED_TYPES.has(blockType)) continue;
      const prefix = FAMILY_TOOL_PREFIX[blockType];
      if (prefix === undefined) {
        throw new Error(
          `docs-edit tools: no tool prefix for action-owning type "${blockType}".`,
        );
      }
      const sanitized = sanitizeParamsSchema(action.params);
      const properties =
        sanitized.properties !== null && typeof sanitized.properties === "object"
          ? (sanitized.properties as Record<string, unknown>)
          : {};
      const required = Array.isArray(sanitized.required)
        ? sanitized.required.filter(
            (key): key is string => typeof key === "string",
          )
        : [];
      for (const reserved of ["requestAlias", "blockId", "docPath", "summary"]) {
        if (reserved in properties) {
          throw new Error(
            `docs-edit tools: action ${action.action} param "${reserved}" collides with a tool field.`,
          );
        }
      }
      specs.push({
        name: `${prefix}_${snakeCase(verb)}`,
        actionKey: action.action,
        blockType,
        description: `${action.description} Applies to ${blockType} blocks.`,
        paramProperties: properties,
        paramRequired: required,
        paramKeys: Object.keys(properties),
      });
    }
  }
  return specs;
}

const ACTION_TOOL_SPECS: readonly ActionToolSpec[] = buildActionToolSpecs();

const STRUCTURE_TOOL_NAMES = [
  "insert_block",
  "delete_block",
  "move_block",
  "split_block",
  "merge_blocks",
  "move_blocks",
] as const;

/** Every session tool name, fixed plus registry-generated. */
export const DOCS_EDIT_TOOL_NAMES: readonly string[] = [
  "read_doc",
  "docs_tree",
  "docs_read",
  ...STRUCTURE_TOOL_NAMES,
  "write_text",
  "set_props",
  ...ACTION_TOOL_SPECS.map((spec) => spec.name),
  "edit_canvas",
  "edit_sequence",
  "resolve_request",
  "reply_request",
];

const EDITABLE_BLOCK_TYPES = (
  [
    "paragraph",
    "heading",
    "list-item",
    "quote",
    "callout",
    "divider",
    "image",
    "video",
  "html",
    "code",
    "structured-table",
    "file-tree",
    "state-shape",
    "interaction-surface",
    "sequence",
    "canvas",
    "process-outline",
  ] as const
).filter(isDocBlockType);

// ---------------------------------------------------------------------------
// Read/queue handlers (pure)
// ---------------------------------------------------------------------------

export function toolReadDoc(session: DocsEditToolSession): DocsEditToolResult {
  try {
    const document = session.document();
    return {
      text: [
        `DOCUMENT · ${session.path} · id ${session.docId} · base ${session.baseHash}`,
        "Block ids are stable identifiers used by the editing tools; the BLOCK MAP section lists every block.",
        "",
        session.renderedDocument(),
        "",
        session.requestsBlock(),
      ].join("\n"),
      details: {
        corpus: session.corpus,
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
    return toolFailure("resolve_request", 'outcome must be "done" or "declined".');
  }
  if (typeof params.note !== "string") {
    return toolFailure("resolve_request", "note must be a string.");
  }

  try {
    const result = await session.resolve(alias, params.outcome, params.note);
    if (!result.ok) {
      return toolFailure("resolve_request", result.message, { alias });
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
// Editing toolset (stateful per session: accumulated edits per request)
// ---------------------------------------------------------------------------

interface PendingEdits {
  ops: DocOp[];
  summary: string;
  docPath?: string;
  /** blockId -> type for blocks inserted in this edit list. */
  insertedTypes: Map<string, DocBlockType>;
}

export interface DocsEditToolset {
  readonly names: readonly string[];
  call(
    name: DocsEditToolName,
    params: Record<string, unknown>,
  ): Promise<DocsEditToolResult>;
  definitions(): BoundToolDefinition[];
}

interface EditContext {
  entry: DocsEditRequestEntry;
  pending: PendingEdits;
  docPath?: string;
}

export function createDocsEditToolset(
  session: DocsEditToolSession,
  options: DocsEditToolOptions = { docsRoot: session.docsRoot },
): DocsEditToolset {
  const pendingByAlias = new Map<string, PendingEdits>();
  let mintCounter = 0;

  // Seed continuity across turns: a single staged edit batch per alias picks
  // up where the previous turn left off, so re-editing revises rather than
  // clobbers. Change-set aliases (multiple staged docs) start fresh.
  const staged = session.proposals?.() ?? [];
  const byAlias = new Map<string, DocsEditProposal[]>();
  for (const proposal of staged) {
    const list = byAlias.get(proposal.requestAlias) ?? [];
    list.push(proposal);
    byAlias.set(proposal.requestAlias, list);
  }
  for (const [alias, proposals] of byAlias) {
    const proposal = proposals[0];
    if (proposals.length !== 1 || proposal === undefined) continue;
    const insertedTypes = new Map<string, DocBlockType>();
    for (const op of proposal.ops) {
      if (op.type === "insertBlock") insertedTypes.set(op.blockId, op.blockType);
    }
    pendingByAlias.set(alias, {
      ops: [...proposal.ops],
      summary: proposal.summary,
      docPath: proposal.docPath,
      insertedTypes,
    });
  }

  function resolveEntry(
    tool: string,
    aliasRaw: unknown,
  ): DocsEditRequestEntry | DocsEditToolResult {
    const alias = typeof aliasRaw === "string" ? aliasRaw.trim() : "";
    if (alias === "") {
      return toolFailure(tool, 'requestAlias must name a queue entry (for example "R1").');
    }
    const entry = session
      .requests()
      .find((candidate) => candidate.alias === alias || candidate.annotationId === alias);
    if (!entry) return toolFailure(tool, `No request "${alias}" in the queue.`);
    if (isDocsEditRequestTerminal(entry.status)) {
      return toolFailure(tool, `${entry.alias} is already ${entry.status}.`);
    }
    return entry;
  }

  function editContext(
    tool: string,
    params: Record<string, unknown>,
  ): EditContext | DocsEditToolResult {
    const resolved = resolveEntry(tool, params.requestAlias);
    if ("text" in resolved) return resolved;
    const entry = resolved;
    const pending =
      pendingByAlias.get(entry.alias) ??
      ({
        ops: [],
        summary: `Edits for ${entry.alias}`,
        insertedTypes: new Map(),
      } satisfies PendingEdits);
    const docPathRaw = params.docPath;
    if (
      docPathRaw !== undefined &&
      (typeof docPathRaw !== "string" || docPathRaw.trim() === "")
    ) {
      return toolFailure(tool, "docPath must be a non-empty bundle path when provided.");
    }
    const docPath = typeof docPathRaw === "string" ? docPathRaw.trim() : undefined;
    if (
      pending.ops.length > 0 &&
      docPath !== undefined &&
      (pending.docPath ?? session.path) !== docPath
    ) {
      return toolFailure(
        tool,
        `${entry.alias} already has edits on ${pending.docPath ?? session.path}; one request edits one document (use move_blocks for cross-document structure).`,
      );
    }
    return { entry, pending, docPath: docPath ?? pending.docPath };
  }

  function blockTypeOf(
    context: EditContext,
    blockId: string,
  ): DocBlockType | undefined {
    const inserted = context.pending.insertedTypes.get(blockId);
    if (inserted !== undefined) return inserted;
    if (context.docPath !== undefined && context.docPath !== session.path) {
      return undefined; // cross-doc: let staging validate
    }
    const block = session.document().blocks[blockId];
    return block !== undefined && isDocBlockType(block.type) ? block.type : undefined;
  }

  async function applyEdit(
    tool: string,
    context: EditContext,
    op: DocOp,
    described: string,
    summaryRaw: unknown,
  ): Promise<DocsEditToolResult> {
    const { entry, pending } = context;
    const summary =
      typeof summaryRaw === "string" && summaryRaw.trim() !== ""
        ? summaryRaw.trim()
        : pending.summary;
    const ops = [...pending.ops, op];
    try {
      const result = await session.propose(entry.alias, ops, summary, context.docPath);
      if (!result.ok) {
        return toolFailure(tool, proposeFailureText(result), {
          failure: result.failure,
        });
      }
      const insertedTypes = new Map(pending.insertedTypes);
      if (op.type === "insertBlock") insertedTypes.set(op.blockId, op.blockType);
      pendingByAlias.set(entry.alias, {
        ops,
        summary,
        docPath: context.docPath,
        insertedTypes,
      });
      const proposal = result.proposal;
      return {
        text: [
          `EDITED · ${entry.alias} · ${described}`,
          `${ops.length} edit${ops.length === 1 ? "" : "s"} on ${proposal.docPath} · changed blocks: ${proposal.changedBlockIds.join(", ") || "(none reported)"}`,
          ...(proposal.lint?.findings.length ? [formatLintReport(proposal.lint)] : []),
          "",
          session.requestsBlock(),
        ].join("\n"),
        details: {
          ok: true,
          requestAlias: entry.alias,
          docPath: proposal.docPath,
          editCount: ops.length,
          changedBlockIds: proposal.changedBlockIds,
          lint: proposal.lint,
          ...(op.type === "insertBlock" ? { blockId: op.blockId } : {}),
        },
      };
    } catch (error) {
      return toolFailure(tool, errorMessage(error));
    }
  }

  function mintBlockId(context: EditContext, type: DocBlockType): string {
    const blocks = session.document().blocks;
    for (;;) {
      mintCounter += 1;
      const candidate = `b-${type}-e${mintCounter}`;
      if (blocks[candidate] !== undefined) continue;
      if (context.pending.insertedTypes.has(candidate)) continue;
      return candidate;
    }
  }

  // ── individual edit handlers ───────────────────────────────────────────

  async function callInsertBlock(
    params: Record<string, unknown>,
  ): Promise<DocsEditToolResult> {
    const context = editContext("insert_block", params);
    if ("text" in context) return context;
    if (!isDocBlockType(params.type)) {
      return toolFailure(
        "insert_block",
        `type must be one of: ${EDITABLE_BLOCK_TYPES.join(", ")}.`,
      );
    }
    if (!isId(params.parentId)) {
      return toolFailure("insert_block", "parentId must be an existing block id.");
    }
    if (!Number.isInteger(params.index) || (params.index as number) < 0) {
      return toolFailure("insert_block", "index must be a non-negative integer.");
    }
    const blockId = mintBlockId(context, params.type);
    const op: DocOp = {
      type: "insertBlock",
      blockId,
      parentId: params.parentId,
      index: params.index as number,
      blockType: params.type,
      props: emptyStateFor(params.type),
    };
    return applyEdit(
      "insert_block",
      context,
      op,
      `inserted blank ${params.type} block ${blockId} under ${params.parentId} at ${params.index}`,
      params.summary,
    );
  }

  async function callWriteText(
    params: Record<string, unknown>,
  ): Promise<DocsEditToolResult> {
    const context = editContext("write_text", params);
    if ("text" in context) return context;
    if (!isId(params.blockId)) {
      return toolFailure("write_text", "blockId must be a block id.");
    }
    if (typeof params.markdown !== "string") {
      return toolFailure("write_text", "markdown must be a string.");
    }
    const type = blockTypeOf(context, params.blockId);
    if (type !== undefined && !stateFor(type).carriesText) {
      return toolFailure(
        "write_text",
        `${params.blockId} is a ${type} block, which carries no text — use its typed ${FAMILY_TOOL_PREFIX[type] ?? type} tools instead.`,
      );
    }
    const converted = inlineToDelta(params.markdown);
    const op: DocOp = {
      type: "updateBlock",
      blockId: params.blockId,
      text: converted.spans,
    };
    const warning =
      converted.warnings.length > 0 ? ` (note: ${converted.warnings.join("; ")})` : "";
    return applyEdit(
      "write_text",
      context,
      op,
      `wrote text of ${params.blockId}${warning}`,
      params.summary,
    );
  }

  async function callSetProps(
    params: Record<string, unknown>,
  ): Promise<DocsEditToolResult> {
    const context = editContext("set_props", params);
    if ("text" in context) return context;
    if (!isId(params.blockId)) {
      return toolFailure("set_props", "blockId must be a block id.");
    }
    if (!isJsonRecord(params.props) || Object.keys(params.props).length === 0) {
      return toolFailure("set_props", "props must be a non-empty JSON object patch.");
    }
    const type = blockTypeOf(context, params.blockId);
    if (type !== undefined && !SET_PROPS_TYPES.has(type)) {
      const prefix = FAMILY_TOOL_PREFIX[type];
      return toolFailure(
        "set_props",
        prefix !== undefined
          ? `${params.blockId} is a ${type} block — its content changes through the ${prefix}_* tools, not set_props.`
          : `${params.blockId} is a ${type} block — its content is edited through edit_${type}.`,
      );
    }
    const op: DocOp = {
      type: "updateBlock",
      blockId: params.blockId,
      props: params.props,
    };
    return applyEdit(
      "set_props",
      context,
      op,
      `set props of ${params.blockId}: ${Object.keys(params.props).join(", ")}`,
      params.summary,
    );
  }

  async function callDeleteBlock(
    params: Record<string, unknown>,
  ): Promise<DocsEditToolResult> {
    const context = editContext("delete_block", params);
    if ("text" in context) return context;
    if (!isId(params.blockId)) {
      return toolFailure("delete_block", "blockId must be a block id.");
    }
    if (
      params.mode !== undefined &&
      params.mode !== "subtree" &&
      params.mode !== "reparent"
    ) {
      return toolFailure("delete_block", 'mode must be "subtree" or "reparent".');
    }
    const op: DocOp = {
      type: "deleteBlock",
      blockId: params.blockId,
      ...(params.mode !== undefined ? { mode: params.mode } : {}),
    };
    return applyEdit(
      "delete_block",
      context,
      op,
      `deleted ${params.blockId}${params.mode === "reparent" ? " (children reparented)" : ""}`,
      params.summary,
    );
  }

  async function callMoveBlock(
    params: Record<string, unknown>,
  ): Promise<DocsEditToolResult> {
    const context = editContext("move_block", params);
    if ("text" in context) return context;
    if (!isId(params.blockId) || !isId(params.toParentId)) {
      return toolFailure("move_block", "blockId and toParentId must be block ids.");
    }
    if (!Number.isInteger(params.toIndex) || (params.toIndex as number) < 0) {
      return toolFailure("move_block", "toIndex must be a non-negative integer.");
    }
    const op: DocOp = {
      type: "moveBlock",
      blockId: params.blockId,
      toParentId: params.toParentId,
      toIndex: params.toIndex as number,
    };
    return applyEdit(
      "move_block",
      context,
      op,
      `moved ${params.blockId} under ${params.toParentId} at ${params.toIndex}`,
      params.summary,
    );
  }

  async function callSplitBlock(
    params: Record<string, unknown>,
  ): Promise<DocsEditToolResult> {
    const context = editContext("split_block", params);
    if ("text" in context) return context;
    if (!isId(params.blockId)) {
      return toolFailure("split_block", "blockId must be a block id.");
    }
    if (!Number.isInteger(params.offset) || (params.offset as number) < 0) {
      return toolFailure("split_block", "offset must be a non-negative integer.");
    }
    const op: DocOp = {
      type: "splitBlock",
      blockId: params.blockId,
      offset: params.offset as number,
    };
    return applyEdit(
      "split_block",
      context,
      op,
      `split ${params.blockId} at offset ${params.offset}`,
      params.summary,
    );
  }

  async function callMergeBlocks(
    params: Record<string, unknown>,
  ): Promise<DocsEditToolResult> {
    const context = editContext("merge_blocks", params);
    if ("text" in context) return context;
    if (
      !Array.isArray(params.blockIds) ||
      params.blockIds.length < 2 ||
      !params.blockIds.every(isId)
    ) {
      return toolFailure("merge_blocks", "blockIds must be two or more block ids.");
    }
    const op: DocOp = { type: "mergeBlocks", blockIds: [...params.blockIds] };
    return applyEdit(
      "merge_blocks",
      context,
      op,
      `merged ${params.blockIds.join(" + ")}`,
      params.summary,
    );
  }

  function makeActionHandler(spec: ActionToolSpec) {
    return async (params: Record<string, unknown>): Promise<DocsEditToolResult> => {
      const context = editContext(spec.name, params);
      if ("text" in context) return context;
      if (!isId(params.blockId)) {
        return toolFailure(spec.name, "blockId must be a block id.");
      }
      const type = blockTypeOf(context, params.blockId);
      if (type !== undefined && type !== spec.blockType) {
        return toolFailure(
          spec.name,
          `${params.blockId} is a ${type} block; ${spec.name} applies to ${spec.blockType} blocks.`,
        );
      }
      const actionParams: Record<string, unknown> = {};
      for (const key of spec.paramKeys) {
        if (params[key] !== undefined) actionParams[key] = params[key];
      }
      if (!isJsonRecord(actionParams)) {
        return toolFailure(spec.name, "action params must be JSON values.");
      }
      const op: DocOp = {
        type: "componentAction",
        blockId: params.blockId,
        action: spec.actionKey,
        params: actionParams,
      };
      return applyEdit(
        spec.name,
        context,
        op,
        `${spec.actionKey} on ${params.blockId}`,
        params.summary,
      );
    };
  }

  function makeDelegatedHandler(tool: "edit_canvas" | "edit_sequence") {
    const family = tool === "edit_canvas" ? "canvas" : "sequence";
    return async (params: Record<string, unknown>): Promise<DocsEditToolResult> => {
      const resolved = resolveEntry(tool, params.requestAlias);
      if ("text" in resolved) return resolved;
      return toolFailure(
        tool,
        `${family} content is edited by the ${family} editor, and that handoff is not wired up yet. Reply to the request explaining the ${family} change needs the ${family} editor — do not approximate it with other blocks.`,
      );
    };
  }

  async function callMoveBlocks(
    params: Record<string, unknown>,
  ): Promise<DocsEditToolResult> {
    const resolved = resolveEntry("move_blocks", params.requestAlias);
    if ("text" in resolved) return resolved;
    const request = resolved;
    if (!Array.isArray(params.blockIds) || params.blockIds.length === 0) {
      return toolFailure("move_blocks", "blockIds must be a non-empty array of strings or integers.");
    }
    if (!params.blockIds.every((id) => typeof id === "string" || Number.isInteger(id))) {
      return toolFailure("move_blocks", "blockIds must contain only strings or integers.");
    }
    const blockIds = params.blockIds.map(String);
    if (blockIds.some((id) => id.trim() === "")) {
      return toolFailure("move_blocks", "blockIds must not contain empty strings.");
    }
    const destDocPath = typeof params.destDocPath === "string" ? params.destDocPath.trim() : "";
    if (destDocPath === "") return toolFailure("move_blocks", "destDocPath must name a document bundle.");
    if (!Number.isInteger(params.destPosition)) {
      return toolFailure("move_blocks", "destPosition must be an integer.");
    }
    if (params.sourceDocPath !== undefined &&
        (typeof params.sourceDocPath !== "string" || params.sourceDocPath.trim() === "")) {
      return toolFailure("move_blocks", "sourceDocPath must name a document bundle when provided.");
    }
    const sourceDocPath = typeof params.sourceDocPath === "string"
      ? params.sourceDocPath.trim()
      : session.path;
    let claimed: DocsEditPathClaimResult | undefined;
    let persisted = false;

    try {
      claimed = session.claimPaths?.([sourceDocPath, destDocPath]) ?? {
        ok: true as const,
        release: () => {},
      };
      if (!claimed.ok) {
        return toolFailure("move_blocks", claimed.message);
      }
      const superseded = await session.supersedeProposals(request.alias);
      if (!superseded.ok) {
        claimed.release();
        return toolFailure("move_blocks", superseded.message);
      }
      pendingByAlias.delete(request.alias);
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
        claimed.release();
        return toolFailure("move_blocks", generated.detail, { status: generated.status });
      }
      persisted = true;
      const proposals: DocsEditProposal[] = [];
      for (const entry of generated.changeset.entries) {
        const listed = await getBundleProposals(session.docsRoot, entry.docPath);
        if (!listed.ok) {
          return toolFailure("move_blocks", listed.detail, { status: listed.status });
        }
        const proposal = listed.proposals.find((candidate) => candidate.id === entry.proposalId);
        if (!proposal) {
          return toolFailure("move_blocks", `Generated edit ${entry.proposalId} is missing from ${entry.docPath}.`);
        }
        proposals.push({
          proposalId: proposal.id,
          lint: proposal.lint,
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
      if (!adopted.ok) return toolFailure("move_blocks", adopted.message);
      return {
        text: [
          `MOVED · ${blockIds.length} block${blockIds.length === 1 ? "" : "s"} → ${destDocPath} · ${request.alias}`,
          ...generated.changeset.entries.map((entry) =>
            `${entry.docPath}: +${entry.addCount} -${entry.delCount}`),
          ...proposals.filter(p => p.lint?.findings.length).map(p => `${p.docPath}\n${formatLintReport(p.lint!)}`),
          `annotation migrations: ${generated.changeset.annotationMigrations?.length ?? 0}`,
          "",
          session.requestsBlock(),
        ].join("\n"),
        details: { ok: true, changeset: generated.changeset, lint: proposals.map(p => ({ docPath: p.docPath, report: p.lint })) },
      };
    } catch (error) {
      if (!persisted && claimed?.ok) claimed.release();
      return toolFailure("move_blocks", errorMessage(error));
    }
  }

  // ── definitions ────────────────────────────────────────────────────────

  const handlers: Record<
    string,
    (params: Record<string, unknown>) => Promise<DocsEditToolResult>
  > = {
    read_doc: async () => toolReadDoc(session),
    docs_tree: async () => toolDocsTree(options),
    docs_read: async (params) => toolDocsRead(options, params),
    insert_block: callInsertBlock,
    write_text: callWriteText,
    set_props: callSetProps,
    delete_block: callDeleteBlock,
    move_block: callMoveBlock,
    split_block: callSplitBlock,
    merge_blocks: callMergeBlocks,
    move_blocks: callMoveBlocks,
    edit_canvas: makeDelegatedHandler("edit_canvas"),
    edit_sequence: makeDelegatedHandler("edit_sequence"),
    resolve_request: async (params) => toolResolveRequest(session, params),
    reply_request: async (params) => toolReplyRequest(session, params),
  };
  for (const spec of ACTION_TOOL_SPECS) {
    handlers[spec.name] = makeActionHandler(spec);
  }

  function definitions(): BoundToolDefinition[] {
    return buildToolDefinitions((name, params) => call(name, params));
  }

  async function call(
    name: DocsEditToolName,
    params: Record<string, unknown>,
  ): Promise<DocsEditToolResult> {
    const handler = handlers[name];
    if (handler === undefined) {
      return toolFailure(name, "unknown docs-edit tool.");
    }
    return handler(params);
  }

  return { names: DOCS_EDIT_TOOL_NAMES, call, definitions };
}

// ---------------------------------------------------------------------------
// Kernel/pi binding
// ---------------------------------------------------------------------------

type SharedToolFactory = ReturnType<
  NonNullable<CreateKernelConfig["sharedTools"]>
>[number];
type SharedToolApi = Parameters<SharedToolFactory>[0];

export interface BoundToolDefinition {
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
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return {
    type: "object",
    ...(required.length > 0 ? { required } : {}),
    properties,
    additionalProperties: false,
  };
}

const ALIAS_FIELD = {
  requestAlias: {
    type: "string",
    description: 'Queue alias this edit belongs to, for example "R1".',
  },
} as const;

const EDIT_COMMON_FIELDS = {
  ...ALIAS_FIELD,
  summary: {
    type: "string",
    description: "Optional one-line summary of this request's edits (replaces the previous one).",
  },
  docPath: {
    type: "string",
    description: "Optional bundle path to edit another document; defaults to the session document.",
  },
} as const;

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

function buildToolDefinitions(
  call: (
    name: DocsEditToolName,
    params: Record<string, unknown>,
  ) => Promise<DocsEditToolResult>,
): BoundToolDefinition[] {
  const bind =
    (name: DocsEditToolName) =>
    async (_toolCallId: string, params: Record<string, unknown>) =>
      toPiResult(await call(name, params));

  const definitions: BoundToolDefinition[] = [
    {
      name: "read_doc",
      label: "Read session document",
      description:
        "Read the session document as sanctioned markdown plus a block map of stable block ids and the live request queue. Call this before editing and after a thread reply.",
      promptSnippet: "Read the current document and docs-edit request queue.",
      parameters: objectSchema({}),
      executionMode: "sequential",
      execute: bind("read_doc"),
    },
    {
      name: "docs_tree",
      label: "Docs tree",
      description: "List the docs corpus using the host's confined, read-only docs-tree path.",
      promptSnippet: "List neighboring document bundles in the docs corpus.",
      parameters: objectSchema({}),
      executionMode: "sequential",
      execute: bind("docs_tree"),
    },
    {
      name: "docs_read",
      label: "Read another document",
      description:
        "Read another document bundle as sanctioned markdown. Includes a block map of stable block ids. Read-only; paths are relative to the docs root.",
      promptSnippet: "Read a related document through the sanctioned render path.",
      parameters: objectSchema(
        { path: { type: "string", description: "Document bundle path." } },
        ["path"],
      ),
      executionMode: "sequential",
      execute: bind("docs_read"),
    },
    {
      name: "insert_block",
      label: "Insert a blank block",
      description:
        "Insert a new BLANK block of a type and get its block id back. Content comes afterwards: write_text/set_props for text blocks, the typed per-component tools for structured blocks.",
      promptSnippet: "Insert a blank block of a type, then fill it with the type's tools.",
      parameters: objectSchema(
        {
          ...EDIT_COMMON_FIELDS,
          type: {
            type: "string",
            enum: [...EDITABLE_BLOCK_TYPES],
            description: "Block type to insert.",
          },
          parentId: { type: "string", description: "Parent block id." },
          index: {
            type: "integer",
            minimum: 0,
            description: "Position within the parent's children.",
          },
        },
        ["requestAlias", "type", "parentId", "index"],
      ),
      executionMode: "sequential",
      execute: bind("insert_block"),
    },
    {
      name: "write_text",
      label: "Write block text",
      description:
        "Replace a text block's content with inline markdown (bold, italic, code, links). Block structure comes from blocks, not markdown syntax — headings/lists are their own blocks.",
      promptSnippet: "Write a text block's content as inline markdown.",
      parameters: objectSchema(
        {
          ...EDIT_COMMON_FIELDS,
          blockId: { type: "string", description: "Text-carrying block id." },
          markdown: { type: "string", description: "Inline markdown content." },
        },
        ["requestAlias", "blockId", "markdown"],
      ),
      executionMode: "sequential",
      execute: bind("write_text"),
    },
    {
      name: "set_props",
      label: "Set block props",
      description:
        `Shallow-merge a props patch into a rich-text or code block. Structured component blocks use their typed tools instead. Props by type: ${propsShapeSummary()}.`,
      promptSnippet: "Patch scalar props on a rich-text or code block.",
      parameters: objectSchema(
        {
          ...EDIT_COMMON_FIELDS,
          blockId: { type: "string" },
          props: {
            type: "object",
            description: "Props patch; a key set to null clears where supported.",
            additionalProperties: true,
          },
        },
        ["requestAlias", "blockId", "props"],
      ),
      executionMode: "sequential",
      execute: bind("set_props"),
    },
    {
      name: "delete_block",
      label: "Delete a block",
      description:
        'Delete a block — mode "subtree" (default) removes it and all descendants; "reparent" splices its children into its parent.',
      promptSnippet: "Delete a block by id.",
      parameters: objectSchema(
        {
          ...EDIT_COMMON_FIELDS,
          blockId: { type: "string" },
          mode: { type: "string", enum: ["subtree", "reparent"] },
        },
        ["requestAlias", "blockId"],
      ),
      executionMode: "sequential",
      execute: bind("delete_block"),
    },
    {
      name: "move_block",
      label: "Move a block",
      description:
        "Move a block under a new parent at an index (the index within the destination children after the block is detached).",
      promptSnippet: "Move a block within the document.",
      parameters: objectSchema(
        {
          ...EDIT_COMMON_FIELDS,
          blockId: { type: "string" },
          toParentId: { type: "string" },
          toIndex: { type: "integer", minimum: 0 },
        },
        ["requestAlias", "blockId", "toParentId", "toIndex"],
      ),
      executionMode: "sequential",
      execute: bind("move_block"),
    },
    {
      name: "split_block",
      label: "Split a text block",
      description: "Split a text block's content at a character offset into two blocks.",
      promptSnippet: "Split a text block at an offset.",
      parameters: objectSchema(
        {
          ...EDIT_COMMON_FIELDS,
          blockId: { type: "string" },
          offset: { type: "integer", minimum: 0 },
        },
        ["requestAlias", "blockId", "offset"],
      ),
      executionMode: "sequential",
      execute: bind("split_block"),
    },
    {
      name: "merge_blocks",
      label: "Merge text blocks",
      description: "Merge two or more contiguous sibling text blocks, in document order.",
      promptSnippet: "Merge contiguous text blocks.",
      parameters: objectSchema(
        {
          ...EDIT_COMMON_FIELDS,
          blockIds: { type: "array", minItems: 2, items: { type: "string" } },
        },
        ["requestAlias", "blockIds"],
      ),
      executionMode: "sequential",
      execute: bind("merge_blocks"),
    },
    {
      name: "move_blocks",
      label: "Move blocks across documents",
      description:
        "Move block subtrees to another document as one atomic cross-document change, preserving block identity, annotations, and inbound links.",
      promptSnippet: "Move blocks to another document.",
      parameters: objectSchema(
        {
          ...ALIAS_FIELD,
          blockIds: { type: "array", minItems: 1, items: { anyOf: [{ type: "string" }, { type: "integer" }] } },
          destDocPath: { type: "string" },
          destPosition: { type: "integer" },
          sourceDocPath: { type: "string", description: "Optional source bundle path; defaults to the session document." },
        },
        ["requestAlias", "blockIds", "destDocPath", "destPosition"],
      ),
      executionMode: "sequential",
      execute: bind("move_blocks"),
    },
  ];

  for (const spec of ACTION_TOOL_SPECS) {
    definitions.push({
      name: spec.name,
      label: spec.actionKey,
      description: spec.description,
      promptSnippet: `Edit a ${spec.blockType} block: ${spec.actionKey}.`,
      parameters: objectSchema(
        {
          ...EDIT_COMMON_FIELDS,
          blockId: { type: "string", description: `${spec.blockType} block id.` },
          ...spec.paramProperties,
        },
        ["requestAlias", "blockId", ...spec.paramRequired],
      ),
      executionMode: "sequential",
      execute: bind(spec.name),
    });
  }

  definitions.push(
    {
      name: "edit_canvas",
      label: "Edit a canvas block",
      description:
        "Hand a canvas block's content change to the canvas editor with an instruction. Canvas content is owned by the canvas system and is not edited block-by-block here.",
      promptSnippet: "Delegate a canvas content change to the canvas editor.",
      parameters: objectSchema(
        {
          ...ALIAS_FIELD,
          blockId: { type: "string" },
          instruction: { type: "string", description: "What to change on the canvas." },
        },
        ["requestAlias", "blockId", "instruction"],
      ),
      executionMode: "sequential",
      execute: bind("edit_canvas"),
    },
    {
      name: "edit_sequence",
      label: "Edit a sequence block",
      description:
        "Hand a sequence-diagram change to the sequence editor with an instruction. Sequence programs are owned by the sequence system and are not edited block-by-block here.",
      promptSnippet: "Delegate a sequence-diagram change to the sequence editor.",
      parameters: objectSchema(
        {
          ...ALIAS_FIELD,
          blockId: { type: "string" },
          instruction: { type: "string", description: "What to change in the diagram." },
        },
        ["requestAlias", "blockId", "instruction"],
      ),
      executionMode: "sequential",
      execute: bind("edit_sequence"),
    },
    {
      name: "resolve_request",
      label: "Resolve a request",
      description:
        'Close a request as "done" when it needs no edit, or "declined" when it will not be done. A request you have edited stays open on its own — do not resolve it.',
      promptSnippet: "Resolve a no-edit request or decline a request with a note.",
      parameters: objectSchema(
        {
          alias: { type: "string" },
          outcome: { type: "string", enum: ["done", "declined"] },
          note: { type: "string" },
        },
        ["alias", "outcome", "note"],
      ),
      executionMode: "sequential",
      execute: bind("resolve_request"),
    },
    {
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
      execute: bind("reply_request"),
    },
  );

  return definitions;
}

export interface DocsEditToolPreview {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Static tool-surface preview (no session): names, descriptions, schemas. */
export function docsEditToolPreviews(): DocsEditToolPreview[] {
  return buildToolDefinitions(async () => ({ text: "" })).map((definition) => ({
    name: definition.name,
    label: definition.label,
    description: definition.description,
    parameters: definition.parameters,
  }));
}

/** Register the session-mode editing surface on a pi tool API. */
export function registerDocsEditSessionTools(
  pi: SharedToolApi,
  session: DocsEditToolSession,
  options: DocsEditToolOptions,
): void {
  const register = pi.registerTool.bind(pi) as unknown as (
    definition: BoundToolDefinition,
  ) => void;
  const toolset = createDocsEditToolset(session, options);
  for (const definition of toolset.definitions()) register(definition);
}

/** Per-session shared-tool factory consumed by docsEditSharedTools' FIFO. */
export function docsEditSessionTools(
  session: DocsEditToolSession,
  options: DocsEditToolOptions = { docsRoot: session.docsRoot },
): SharedToolFactory {
  return (pi) => registerDocsEditSessionTools(pi, session, options);
}
