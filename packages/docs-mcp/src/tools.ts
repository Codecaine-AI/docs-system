import { mutateTree } from "./tree-tools";
import { createHash, randomUUID } from "node:crypto";
import { dirname, relative, resolve, sep } from "node:path";
import { Type, type TObject, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  ACTION_REGISTRY, ALL_COMPONENTS, DOC_BLOCK_TYPES, emptyStateFor, stateFor, valueErrorMessage,
  type DocDocument, type DocOp, type ComponentAction,
} from "@codecaine-ai/docs-model";
import { inlineToDelta } from "@codecaine-ai/docs-model/markdown-to-delta";
import { lintDocument, titleHeadingFixOps } from "@codecaine-ai/docs-model/lint";
import { checkBlocksFor, judgedStyleGate, styleGate, touchedBlockIds, writeStyleFeedback, type JudgmentEngine, type StyleFinding } from "./lint-feedback";
import { CLAIMS_LIMIT, CLAIMS_NEXT, claimsToCheck } from "./claims";
import {
  canonicalBundleSrc, classifyBlockSrc, resolveBundleRelativeSrc,
} from "@codecaine-ai/docs-model/bundle-src";
import { isExcludedOnDiskUnderDocsRoot, resolveDocBundleJsonPath } from "@codecaine-ai/docs-index/paths";
import { checkDocsPath, docsFs, realDocsRootPath } from "@codecaine-ai/docs-index/safe-path";
import { normalizeBundlePath } from "@codecaine-ai/docs-server/bundle";
import { createDocsStore, type DocsStore } from "@codecaine-ai/docs-server/store";
import {
  resolveCanvasSidecarRelativePath, resolveCanvasSidecarRootRelativePath,
  resolveSequenceSidecarRelativePath, resolveSequenceSidecarRootRelativePath,
} from "@codecaine-ai/docs-server/confine";
import {
  blockingFindings, canvasFindings, installedSequenceLinter, sequenceFindings, sequenceLintFindings,
  type ComponentFinding, type SequenceLinter,
} from "@codecaine-ai/docs-server/component-lints";

export interface DocsToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}
export interface DocsToolCallContext { taskId?: string }
export interface DocsTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(args: unknown, ctx?: DocsToolCallContext): Promise<DocsToolResult>;
}
/** Each task's first-touch documents, keyed `${project}:${bundle path}`. */
export interface TaskBaselines<T = DocDocument | null> {
  /** undefined: not captured yet. null: the doc did not exist at first touch. */
  get(taskId: string, key: string): T | undefined;
  set(taskId: string, key: string, doc: T): void;
}
type CanvasDocument = Parameters<typeof canvasFindings>[0];
export interface DocsToolContext {
  resolveProject(project: string): Promise<{ id: string; docsRoot: string }>;
  /** Enables docs_check's style gate for callers that pass a task ID. */
  taskBaselines?: TaskBaselines;
  /** Each task's first-touch Canvas sidecars, keyed `${project}:${sidecar path}`: what the canvas text lints judge against. */
  taskCanvasBaselines?: TaskBaselines<CanvasDocument>;
  /** Model-judged style rules: advisory in write results, gated by docs_check with task_id. Fails open. */
  judgmentEngine?: JudgmentEngine;
  /** The sequence quality lints, reported as warnings that never block. Defaults to the installed sequence package's; null turns them off. */
  sequenceLinter?: SequenceLinter | null;
}

const str = Type.String({ minLength: 1 });
const id = Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,96}$" });
const obj = (properties: Record<string, TSchema>) => Type.Object(properties, { additionalProperties: false });
const record = Type.Record(Type.String(), Type.Unknown());
const blockType = Type.Union(DOC_BLOCK_TYPES.map((type) => Type.Literal(type)));
const delta = Type.Array(obj({ insert: Type.String(), attributes: Type.Optional(record) }), {
  description: "Literal text spans: markdown is not parsed, so `name` shows its backticks. Give inline code its own span with attributes { code: true }, or write the block's text with docs_write_text markdown.",
});
const opSchema = Type.Union([
  obj({ type: Type.Literal("insertBlock"), blockId: id, parentId: id, index: Type.Integer({ minimum: 0 }), blockType, props: record, text: Type.Optional(delta) }),
  obj({ type: Type.Literal("updateBlock"), blockId: id, props: Type.Optional(record), text: Type.Optional(Type.Union([delta, Type.Null()])) }),
  obj({ type: Type.Literal("deleteBlock"), blockId: id, mode: Type.Optional(Type.Union([Type.Literal("subtree"), Type.Literal("reparent")])) }),
  obj({ type: Type.Literal("moveBlock"), blockId: id, toParentId: id, toIndex: Type.Integer({ minimum: 0 }) }),
  obj({ type: Type.Literal("splitBlock"), blockId: id, offset: Type.Integer({ minimum: 0 }) }),
  obj({ type: Type.Literal("mergeBlocks"), blockIds: Type.Array(id, { minItems: 2 }) }),
  obj({ type: Type.Literal("componentAction"), blockId: id, action: str, params: record }),
]);
const target = { project: str, path: Type.String({ description: "Bundle path relative to this project's docs root; use docs_tree to discover it. Empty string selects a root bundle." }) };
const writeTarget = { ...target, expected_hash: str };
const SAVED_NEXT = "Changes are saved. Run docs_check with task_id before reporting completion.";
const FIX_STYLE_NEXT = "Changes are saved. Fix style_findings, then run docs_check with task_id.";
const FIX_BLOCKING_NEXT = "Changes are saved. Fix the style_findings marked blocks_check first: docs_check fails on them. Fix the rest as you go, then run docs_check with task_id.";
const FIX_COMPONENT_NEXT = "Changes are saved. Fix component_findings, then run docs_check with task_id.";
const SEQUENCE_WARNINGS_NEXT = "Changes are saved. component_findings holds sequence lint warnings. They never block, but fix each one that applies, then run docs_check with task_id.";
/** A clean write still reports violations an earlier write in the task left open on the page. */
const nextHint = (findings: boolean, open: number, blocking = false) => blocking ? FIX_BLOCKING_NEXT : findings ? FIX_STYLE_NEXT
  : open === 1 ? "Changes are saved. 1 style violation this task introduced on this page is still open. Run docs_check with task_id to list it."
  : open ? `Changes are saved. ${open} style violations this task introduced on this page are still open. Run docs_check with task_id to list them.`
  : SAVED_NEXT;

/** A doc.json write: who made it, where, the document it replaced, and the ops it applied. */
interface DocWrite { ctx: DocsToolCallContext; project: string; before: DocDocument | null | undefined; ops?: readonly DocOp[]; /** Lint the whole saved page into `lint`, before the result trims `doc`. */ lint?: boolean }
const baselineKey = (project: string, path: string) => `${project}:${normalizeBundlePath(path)}`;
const opBlockIds = (ops: readonly DocOp[] = []): string[] =>
  ops.flatMap((op) => "blockIds" in op ? op.blockIds : "blockId" in op ? [op.blockId] : []);

/**
 * The saved page as a write result carries it: the root, each block the write changed, and the parent
 * of each, so the writer sees the root id and where its blocks sit. Echoing the whole page grew every
 * later turn of a writer that builds a page in many writes (round 6 brief 1: 7 writes, 27 KB each by
 * the end). A page the write made comes back whole. docs_read returns the whole page.
 */
function writtenView(before: DocDocument | null, after: DocDocument, named: Iterable<string>): { doc: DocDocument; doc_omitted_blocks?: number } {
  if (!before) return { doc: after };
  const keep = new Set([after.root, ...touchedBlockIds(before, after, named)]);
  // A parent stays when it holds a kept block, or when its children changed: a delete or move leaves the old parent changed.
  const sameChildren = (a: readonly string[] = [], b: readonly string[] = []) => a.length === b.length && a.every((id, i) => id === b[i]);
  // Repeat until no block joins: a parent can come before its kept child in block order.
  for (let grew = true; grew;) {
    grew = false;
    for (const block of Object.values(after.blocks)) {
      if (keep.has(block.id)) continue;
      if (block.children?.some((child) => keep.has(child)) || !sameChildren(before.blocks[block.id]?.children, block.children)) { keep.add(block.id); grew = true; }
    }
  }
  const omitted = Object.keys(after.blocks).length - keep.size;
  if (omitted === 0) return { doc: after };
  const blocks = Object.fromEntries(Object.entries(after.blocks).filter(([id]) => keep.has(id)));
  return { doc: { ...after, blocks }, doc_omitted_blocks: omitted };
}

function response(data: Record<string, unknown>): DocsToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data,
    ...(data.ok === false ? { isError: true } : {}) };
}
function failure(detail: string, status = 400): Record<string, unknown> { return { ok: false, status, detail }; }
/** Component findings as write results and docs_check carry them: errors, then warnings, then notes, capped like style findings. */
const COMPONENT_FINDINGS_LIMIT = 5;
const findingList = (findings: ComponentFinding[]) => ({ shown: findings.slice(0, COMPONENT_FINDINGS_LIMIT), omitted: Math.max(0, findings.length - COMPONENT_FINDINGS_LIMIT) });

/** Resolve a component src exactly as the viewer and root-relative server routes do. */
export function componentSidecarPath(
  bundlePath: string,
  type: "canvas" | "sequence",
  src: string,
): string | null {
  const kind = classifyBlockSrc(src);
  if (kind === "url" || kind === "parent-escape") return null;
  const rootRel = resolveBundleRelativeSrc(normalizeBundlePath(bundlePath), src);
  return type === "canvas"
    ? resolveCanvasSidecarRootRelativePath("/docs-root", rootRel)
    : resolveSequenceSidecarRootRelativePath("/docs-root", rootRel);
}

/** Keep provider schemas JSON-only, resolving the registry's recursive local refs through $defs. */
function jsonSchema(schema: TObject): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
  const definitions: Record<string, unknown> = {};
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const node = value as Record<string, unknown>;
    if (typeof node.$id === "string") {
      const key = node.$id;
      delete node.$id;
      definitions[key] = node;
    }
    if (typeof node.$ref === "string" && !node.$ref.startsWith("#")) node.$ref = `#/$defs/${node.$ref}`;
    Object.values(node).forEach(visit);
  };
  visit(copy);
  if (Object.keys(definitions).length) copy.$defs = structuredClone(definitions);
  return copy;
}

/**
 * Reject lexical escapes, symlink escapes (existing ancestors of new
 * destinations included) and excluded targets: the docs-root chokepoint's
 * verdict for the path as it is reached on disk.
 */
async function confined(root: string, absolutePath: string): Promise<void> {
  const checked = checkDocsPath(root, absolutePath, "read");
  if (!checked.ok) throw new Error(checked.detail);
}

/** Direct adapter over the same store used by the UI. No kernel, model, or staged agent session. */
export function createDocsTools(context: DocsToolContext): DocsTool[] {
  const stores = new Map<string, DocsStore>();
  // Only patches emitted through this adapter can be undone here. In particular,
  // another project's opaque patch ID cannot select a root-relative ledger entry.
  const patches = new Map<string, { root: string; path: string; files: string[] }>();
  async function storeFor(args: Record<string, any>): Promise<DocsStore> {
    const project = await context.resolveProject(args.project);
    const root = realDocsRootPath(project.docsRoot);
    let store = stores.get(root);
    if (!store) { store = createDocsStore(root); stores.set(root, store); }
    // The project's codecaine.docs.json exclude globs: no tool reads or writes there.
    for (const value of [args.path, args.to]) {
      if (typeof value === "string" && isExcludedOnDiskUnderDocsRoot(root, value)) throw new Error(`Path is excluded from this docs project: ${value}`);
    }
    if (typeof args.path === "string" && args.path.includes("/assets/")) {
      await confined(root, resolve(root, args.path));
      return store;
    }
    if (typeof args.path === "string") {
      const path = resolveDocBundleJsonPath(root, args.path);
      if (!path) throw new Error("Invalid docs bundle path.");
      await confined(root, path);
      await confined(root, resolve(dirname(path), "annotations.json"));
      await confined(root, resolve(dirname(path), "proposals.json"));
    }
    return store;
  }
  function tool(name: string, description: string, schema: TObject,
    run: (args: Record<string, any>, store: DocsStore, ctx: DocsToolCallContext) => Promise<Record<string, unknown>>): DocsTool {
    return { name, description, inputSchema: jsonSchema(schema), execute: async (args, ctx = {}) => {
      try {
        if (!Value.Check(schema, args)) {
          return response({ ...failure("Tool arguments failed validation."), issues: [...Value.Errors(schema, args)].map((error) => ({ path: error.path, message: valueErrorMessage(error) })) });
        }
        const input = args as Record<string, any>;
        const store = await storeFor(input);
        if (name.startsWith("docs_change") || name.startsWith("docs_proposal")) {
          await confined(store.docsRoot,resolve(store.docsRoot,".changesets"));
          for (const entry of input.entries ?? []) await storeFor({project:input.project,path:entry.docPath});
        }
        return response(await run(input, store, ctx));
      } catch (error) { return response(failure(error instanceof Error ? error.message : String(error))); }
    } };
  }
  /** The document a write replaces: null when the bundle does not exist yet, undefined when unreadable. */
  async function priorDoc(store: DocsStore, path: string): Promise<DocDocument | null | undefined> {
    const loaded = await store.bundle(path);
    return "error" in loaded ? (loaded.error.status === 404 ? null : undefined) : loaded.document;
  }
  /** Pin the document a task's first successful write to a page replaced. Failed attempts pin nothing. */
  function pinBaseline(write: DocWrite, path: string): void {
    const baselines = context.taskBaselines;
    if (!write.ctx.taskId || !baselines || write.before === undefined) return;
    const key = baselineKey(write.project, path);
    if (baselines.get(write.ctx.taskId, key) === undefined) baselines.set(write.ctx.taskId, key, write.before);
  }
  async function applied(store: DocsStore, path: string, result: Record<string, any>, write?: DocWrite): Promise<Record<string, unknown>> {
    if (!result.ok) return result;
    // Canvas and Sequence actions save only their sidecar and return no doc.
    const docWrite = write && result.doc ? write : undefined;
    if (docWrite) pinBaseline(docWrite, path);
    const patchId = result.patchId as string | undefined;
    const changedIds = [...(result.changedIds ?? []), ...opBlockIds(result.normalization?.ops)];
    if (patchId) {
      const docFile = resolveDocBundleJsonPath(store.docsRoot, path)!;
      const sidecar = result.canvasRelPath ?? result.sequenceRelPath;
      patches.set(patchId, { root: store.docsRoot, path, files: [docFile, ...(sidecar ? [resolve(store.docsRoot, sidecar)] : [])] });
    }
    if (patchId) store.publishChange({ path, changedIds, patchId, actor: "external-agent" });
    const taskBaseline = docWrite ? taskBaselineOf(docWrite, path) : undefined;
    const gate = taskBaseline === undefined ? [] : openStyleGate(result.doc, taskBaseline);
    const style = docWrite && docWrite.before !== undefined
      ? await writeStyleFeedback({ before: docWrite.before, after: result.doc, named: [...changedIds, ...opBlockIds(docWrite.ops)], engine: context.judgmentEngine,
        checkBlocks: checkBlocksFor(result.doc, taskBaseline, gate) })
      : undefined;
    const open = gate.length;
    const claims = docWrite && docWrite.before !== undefined ? claimsToCheck(result.doc, docWrite.before) : [];
    const next = nextHint(style !== undefined, open, style?.shown.some((finding) => finding.blocks_check) ?? false);
    const view = docWrite && docWrite.before !== undefined ? writtenView(docWrite.before, result.doc, [...changedIds, ...opBlockIds(docWrite.ops)]) : {};
    // Clients may show only the start of a large result, so feedback and the new hash lead and the document follows.
    return { ok: true, ...(style ? { style_findings: style } : {}), ...(open ? { style_gate_open: open } : {}),
      ...(claims.length ? { claims_to_check: claims.slice(0, CLAIMS_LIMIT) } : {}), ...(claims.length > CLAIMS_LIMIT ? { claims_omitted: claims.length - CLAIMS_LIMIT } : {}), next: claims.length ? `${next} ${CLAIMS_NEXT}` : next,
      path, ...(result.hash ? { expected_hash: result.hash } : {}), ...result, ...(write?.lint && result.doc ? { lint: lintDocument(result.doc, { phase: "complete" }) } : {}), ...view };
  }
  /** The document the task's first write to this page replaced: null for a page the task made, undefined with no task. */
  function taskBaselineOf(write: DocWrite, path: string): DocDocument | null | undefined {
    return write.ctx.taskId ? context.taskBaselines?.get(write.ctx.taskId, baselineKey(write.project, path)) : undefined;
  }
  /** Gated violations the task has introduced on this page so far, against its pinned baseline: docs_check's style_gate. */
  function openStyleGate(doc: DocDocument, baseline: DocDocument | null): StyleFinding[] {
    return styleGate(lintDocument(doc, { phase: "complete", baseline: baseline ?? undefined }));
  }
  async function apply(store: DocsStore, args: Record<string, any>, ops: DocOp[], ctx: DocsToolCallContext, before?: DocDocument, lint?: boolean): Promise<Record<string, unknown>> {
    if (ops.some((op) => op.type === "componentAction" && ACTION_REGISTRY.get(op.action) && "forward" in ACTION_REGISTRY.get(op.action)!)) {
      return failure("Sidecar actions require their typed component tool and expected_component_hash; they cannot be mixed into a document batch.");
    }
    const prior = before ?? await priorDoc(store, args.path);
    return applied(store, args.path, await store.applyDocOps(args.path, ops, args.expected_hash), { ctx, project: args.project, before: prior, ops, lint });
  }
  async function component(store: DocsStore, args: Record<string, any>) {
    const doc = await store.docGet(args.path);
    if (!doc.ok) return doc;
    const block = doc.doc.blocks[args.blockId];
    const refused = (detail: string) => ({ ok: false as const, status: 400, detail });
    if (!block || (block.type !== "canvas" && block.type !== "sequence")) return refused("blockId must name a canvas or sequence block.");
    if (typeof block.props.src !== "string") return refused("This component has no sidecar src. Central component references are not supported by the Docs store.");
    const src = componentSidecarPath(normalizeBundlePath(args.path), block.type, block.props.src);
    if (!src) return refused("Invalid component sidecar path.");
    await confined(store.docsRoot, resolve(store.docsRoot, src));
    return block.type === "canvas"
      ? { type: "canvas" as const, src, doc_hash: doc.hash, ...await store.canvasGet(src) }
      : { type: "sequence" as const, src, doc_hash: doc.hash, ...await store.sequenceGet(src) };
  }

  /** The board a task first touched at this sidecar, if it has. */
  function canvasBaseline(ctx: DocsToolCallContext, project: string, src: string): CanvasDocument | undefined {
    return ctx.taskId ? context.taskCanvasBaselines?.get(ctx.taskId, `${project}:${src}`) : undefined;
  }
  /** A saved sidecar edit: its findings and render lead, then the usual applied result. */
  async function componentApplied(store: DocsStore, path: string, result: Record<string, any>, findings: ComponentFinding[], render: Record<string, unknown>, fixNext = FIX_COMPONENT_NEXT) {
    const { next, ...saved } = await applied(store, path, result);
    return { ok: true, component_findings: findingList(findings), ...render,
      next: findings.length ? fixNext : next, ...saved };
  }
  const lintSequence = context.sequenceLinter === undefined ? installedSequenceLinter : context.sequenceLinter;

  const tools = [
    tool("docs_tree", "Discover the documentation tree for a project. Read documents through docs_read, never edit doc.json directly.", obj({ project: str }), async (_, store) => ({ ok: true, tree: await store.tree() })),
    tool("docs_read", "Read the document, rendered markdown, stable block IDs, revision hash, and current writing findings. Use its hash as expected_hash on every edit.", obj(target), async (args, store) => {
      const result = await store.docGet(args.path);
      return result.ok ? { ...result, expected_hash: result.hash, lint: lintDocument(result.doc, { phase: "complete" }) } : result;
    }),
    tool("docs_fix_lints", "Apply safe, undoable title-heading lint fixes at the expected revision. Removes only a repeated opening H1 title while preserving children; all other heading levels remain unchanged. Run docs_check afterward for remaining findings.", obj(writeTarget), async (args, store, ctx) => {
      const result = await store.docGet(args.path);
      if (!result.ok) return result;
      if (result.hash !== args.expected_hash) return failure("Document changed; read the current revision before fixing lints.", 409);
      const ops = titleHeadingFixOps(result.doc);
      if (ops.length === 0) return { ok: true, path: args.path, hash: result.hash, expected_hash: result.hash, fixed: 0, lint: lintDocument(result.doc, { phase: "complete" }) };
      // The result trims doc to the changed blocks, so the lint comes from the whole saved page.
      const fixed = await apply(store, args, ops, ctx, result.doc, true);
      return { ...fixed, ...(fixed.ok ? { fixed: ops.length, ops } : {}) };
    }),
    tool("docs_check", "Run final document validation and writing checks. Inspect blocking findings and resolve them before claiming the task is complete. With task_id, style violations the task introduced fail the check and appear in style_gate. Each Canvas and Sequence block reports its lint findings in components. With task_id, findings fail the check only on blocks the task touched, marked touched_by_task. Sequence lint warnings never fail it. An unreadable block always fails.", obj(target), async (args, store, ctx) => {
      const result = await store.docGet(args.path);
      if (!result.ok) return result;
      const lint = lintDocument(result.doc, { phase: "complete" });
      const components = [];
      for (const block of Object.values(result.doc.blocks)) {
        if (block.type === "canvas" || block.type === "sequence") {
          const checked = await component(store, { ...args, blockId: block.id });
          const findings = !checked.ok ? sequenceFindings("issues" in checked ? checked.issues ?? [] : [])
            : checked.type === "canvas" ? canvasFindings(checked.canvas, { finishing: true, baseline: canvasBaseline(ctx, args.project, checked.src) })
            : sequenceLintFindings(checked.sequence, lintSequence);
          // A task answers only for the boards it touched, as it answers only for the style violations it introduced.
          // Sequence edits that the diagnostics flag are refused, so a task never leaves a flagged sequence.
          // A readable sequence's lint warnings advise and never block.
          const blocking = checked.ok && checked.type === "sequence" ? [] : blockingFindings(findings);
          const src = checked.ok ? checked.src : undefined;
          const touched = ctx.taskId ? (src !== undefined && canvasBaseline(ctx, args.project, src) !== undefined) : undefined;
          components.push({ blockId: block.id, type: block.type, ok: checked.ok && blocking.length === 0,
            ...(touched !== undefined ? { touched_by_task: touched } : {}),
            ...(!checked.ok ? { detail: checked.detail } : {}), ...(findings.length ? { findings: findingList(findings) } : {}) });
        }
      }
      // Without a task baseline for this page, the style check is exactly the untasked one.
      const baseline = ctx.taskId ? context.taskBaselines?.get(ctx.taskId, baselineKey(args.project, args.path)) : undefined;
      const style_gate = baseline === undefined ? undefined : styleGate(lintDocument(result.doc, { phase: "complete", baseline: baseline ?? undefined }));
      // Judged findings on blocks the task changed join the gate. Unavailable judgment is reported and never blocks.
      const judged = style_gate && context.judgmentEngine ? await judgedStyleGate({ engine: context.judgmentEngine, baseline: baseline ?? null, doc: result.doc }) : undefined;
      if (judged?.available) style_gate!.push(...judged.gate);
      // An unreadable block always fails: the page cannot load it, whoever broke it.
      const ok = lint.blocking.length === 0 && components.every((entry) => entry.ok || (entry.touched_by_task === false && !("detail" in entry))) && !style_gate?.length;
      return { ok, structurally_valid: true, hash: result.hash, lint, components,
        ...(style_gate ? { style_gate } : {}), ...(judged && !judged.available ? { judgment: { available: false, reason: judged.reason } } : {}) };
    }),
    tool("docs_create", "Create a new blank documentation bundle through the existing tree service. Refuses an existing destination. Write the whole page in one docs_apply_ops batch, since each extra write rereads the whole task. Then run docs_check.", obj({ ...target, title: str, expected_absent: Type.Literal(true) }), async (args, store, ctx) => {
      await confined(store.docsRoot, resolve(store.docsRoot, ".changesets"));
      const staged = await store.changesetStage({ summary: `Create ${args.title}`, entries: [], treeOps: [{ kind: "create-doc", docPath: args.path, title: args.title, position: 0 }] });
      if (!staged.ok) return staged;
      const accepted = await store.changesetAccept(staged.changeset.id);
      if (!accepted.ok) return accepted;
      const doc = await store.docGet(args.path);
      // docs_undo undoes this connection's content patches only. A creation is
      // undone with the change-set undo endpoint (POST api/changesets/<creation_id>/undo),
      // which refuses before any change once the folder holds anything the create
      // did not make; its inverse lives in the service process only.
      // A successful create proves the page was absent, so its baseline is null.
      return applied(store, args.path, { ...doc, creation_id: staged.changeset.id, undo_available: false }, { ctx, project: args.project, before: null });
    }),
    ...["docs_move", "docs_rename"].map((name) => tool(name,
      name === "docs_move" ? "Preview moving a page or entire section with descendants. Rewrites descendant doc links and asset references, including shared Canvas/Sequence assets. Apply with preview:false and expected_tree_hash. Does not change the title." : "Preview renaming a page or entire section within its parent, preserving descendant links and assets. Apply with preview:false and expected_tree_hash. Use docs_set_title for the display title.",
      obj({ ...writeTarget, preview: Type.Optional(Type.Boolean()), expected_tree_hash: Type.Optional(str), ...(name === "docs_move" ? { to: str } : { name: Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$" }) }) }),
      async (args, store) => {
        const destination = name === "docs_move" ? args.to : [normalizeBundlePath(args.path).split("/").slice(0,-1).join("/"),args.name].filter(Boolean).join("/");
        if (!destination || normalizeBundlePath(destination) !== destination) return failure("Use a canonical directory bundle destination.");
        const file = resolveDocBundleJsonPath(store.docsRoot,destination);
        if (!file) return failure("Invalid destination.");
        await confined(store.docsRoot,file);
        await confined(store.docsRoot,resolve(store.docsRoot,".changesets"));
        await confined(store.docsRoot,resolve(store.docsRoot,".index"));
        return mutateTree(store,args,destination);
      })),
    tool("docs_delete", "Preview deleting a page or subtree and bundled assets. Set recursive:true for descendants. Refuses remaining external references. Relocate shared assets first with docs_asset_move. Apply reviewed deletion with preview:false and expected_tree_hash. Recovery journal retained; no guarded undo.",
      obj({ ...writeTarget, preview: Type.Optional(Type.Boolean()), expected_tree_hash: Type.Optional(str), recursive: Type.Optional(Type.Boolean()) }),
      async (args,store) => {
        await confined(store.docsRoot,resolve(store.docsRoot,".changesets"));
        return mutateTree(store,args);
      }),
    tool("docs_assets", "List asset paths, byte sizes and hashes, including unused files. Optionally restrict to a page or section.",obj({project:str,path:Type.Optional(str)}),(args,store)=>store.assets(args.path)),
    tool("docs_search", "Search page titles and rendered documentation in this project. Returns matching paths and short excerpts.",obj({project:str,query:str,limit:Type.Optional(Type.Integer({minimum:1,maximum:100}))}),async(args,store)=>{
      const matches:any[]=[];const query=args.query.toLowerCase();
      async function visit(nodes:any[]){for(const node of nodes){if(matches.length>=(args.limit??20))return;if(node.kind==="bundle"){const doc=await store.docGet(node.path);if(doc.ok){const body=`${doc.doc.title??""}\n${doc.markdown}`;const at=body.toLowerCase().indexOf(query);if(at>=0)matches.push({path:node.path,title:doc.doc.title,excerpt:body.slice(Math.max(0,at-80),at+240)});}}if(node.children)await visit(node.children);}}
      await visit(await store.tree());return {ok:true,matches};
    }),
    tool("docs_management_restore", "Preview restoring a completed page/asset management change by tree_change_id. Refuses subsequent edits to any affected file. Apply with preview:false and expected_tree_hash. Uses the retained recovery journal.",
      obj({project:str,tree_change_id:str,preview:Type.Optional(Type.Boolean()),expected_tree_hash:Type.Optional(str)}),
      (args,store)=>store.restoreManagedFiles(args.tree_change_id,args.preview,args.expected_tree_hash)),
    tool("docs_asset_read", "Read a docs-root-relative asset hash and size. Set include_content:true for base64 bytes up to 1 MiB. Use this hash before moving or deleting an asset.",
      obj({ ...target, include_content: Type.Optional(Type.Boolean()) }), async(args,store)=>{
        if(!args.path.includes("/assets/"))return failure("Expected a bundle asset path.");
        const bytes=await docsFs(store.docsRoot).readFile(args.path);
        if(args.include_content && bytes.length>1048576)return failure("Asset is larger than the 1 MiB inline read limit.",413);
        return {ok:true,path:args.path,hash:createHash("sha256").update(bytes).digest("hex"),size:bytes.length,...(args.include_content?{base64:bytes.toString("base64")}: {})};
      }),
    tool("docs_asset_upload", "Upload an image, video or attachment to an existing page using base64 bytes. The store enforces file types, sizes and collision-safe naming. Returns src to use in a typed block.",
      obj({ ...target, filename:str, content_type:str, base64:Type.String({maxLength:140000000}) }), async(args,store)=>{
        if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(args.base64))return failure("Invalid base64.");
        await confined(store.docsRoot,resolve(store.docsRoot,args.path,"assets"));
        for(const sub of ["images","videos","attachments"])await confined(store.docsRoot,resolve(store.docsRoot,args.path,"assets",sub));
        const file=new File([Buffer.from(args.base64,"base64")],args.filename,{type:args.content_type});
        return args.content_type.startsWith("video/")?store.uploadVideoAsset({bundlePath:args.path,file}):store.uploadAsset({bundlePath:args.path,file});
      }),
    tool("docs_component_create", "Create a validated Canvas or Sequence sidecar for a page. src is page-relative, for example ./assets/canvases/<name>.canvas.json or ./assets/sequences/<name>.sequence.json; a bare assets/... src is normalized to ./assets/.... Insert the typed component block with the returned src. Refuses overwrite.",
      obj({...writeTarget,component:Type.Union([Type.Literal("canvas"),Type.Literal("sequence")]),src:str,document:record}),async(args,store,ctx)=>{
        const src=canonicalBundleSrc(args.src);
        const docPath=`${normalizeBundlePath(args.path)}/doc.json`;
        const rel=args.component==="canvas"?resolveCanvasSidecarRelativePath(docPath,src,store.docsRoot):resolveSequenceSidecarRelativePath(docPath,src,store.docsRoot);
        if(!rel)return failure("Invalid sidecar path.");await confined(store.docsRoot,resolve(store.docsRoot,rel));
        const result=args.component==="canvas"?await store.createCanvasSidecar({docPath,src,canvas:args.document,originalHash:args.expected_hash,insertMdx:false}):await store.createSequenceSidecar({docPath,src,sequence:args.document,originalHash:args.expected_hash});
        if(!result.ok)return {...result,src};
        if(args.component==="sequence"){
          const findings=sequenceLintFindings(args.document as Parameters<typeof sequenceLintFindings>[0],lintSequence);
          return {component_findings:findingList(findings),...(findings.length?{next:SEQUENCE_WARNINGS_NEXT}:{}),...result,src};
        }
        // Everything on a board this task created is the task's writing, so its text lints judge against an empty board.
        const board=args.document as CanvasDocument;const empty={...board,objects:[]};
        const key=componentSidecarPath(args.path,"canvas",src);
        if(ctx.taskId&&key&&canvasBaseline(ctx,args.project,key)===undefined)context.taskCanvasBaselines?.set(ctx.taskId,`${args.project}:${key}`,empty);
        const findings=canvasFindings(board,{baseline:empty});
        return {component_findings:findingList(findings),...(findings.length?{next:FIX_COMPONENT_NEXT}:{}),...result,src};
      }),
    tool("docs_proposals", "List staged proposals and stale status for a page.",obj(target),(args,store)=>store.proposals(args.path)),
    tool("docs_proposal_stage", "Stage typed document operations for review instead of applying them. Uses the current page hash. Sidecar edits use component tools.",
      obj({...writeTarget,summary:str,ops:Type.Array(opSchema,{minItems:1,maxItems:1000})}),
      (args,store)=>store.stageProposal(args.path,{summary:args.summary,ops:args.ops,expectedHash:args.expected_hash})),
    ...["accept","reject"].map(action=>tool(`docs_proposal_${action}`,`${action} a reviewed proposal using the current proposals-file hash returned by staging or docs_proposals.`,
      obj({...target,proposal_id:str,expected_proposals_hash:str}),async(args,store,ctx)=>{
        if(action!=="accept")return store.rejectProposal(args.path,args.proposal_id,{expectedHash:args.expected_proposals_hash});
        const before=await priorDoc(store,args.path);
        const result=await store.acceptProposal(args.path,args.proposal_id,{expectedHash:args.expected_proposals_hash});
        return applied(store,args.path,result,{ctx,project:args.project,before,ops:result.ok?result.proposal.ops:undefined});
      })),
    tool("docs_changesets", "List review changesets, optionally filtered by page path.",obj({project:str,path:Type.Optional(Type.String())}),(args,store)=>store.changesets(args.path)),
    tool("docs_changeset_read", "Read a changeset before reviewing its proposed edits.",obj({project:str,changeset_id:str}),(args,store)=>store.changesetGet(args.changeset_id)),
    tool("docs_changeset_stage", "Group existing staged proposals into a review changeset. Page management uses the preview-based move/delete tools.",
      obj({project:str,summary:str,entries:Type.Array(obj({docPath:str,proposalId:str}),{minItems:1,maxItems:100})}),
      (args,store)=>store.changesetStage({summary:args.summary,entries:args.entries})),
    ...["accept","reject"].map(action=>tool(`docs_changeset_${action}`,`${action} a changeset after reading and reviewing its entries. The service retains its validation and rollback rules.`,
      obj({project:str,changeset_id:str}),(args,store)=>action==="accept"?store.changesetAccept(args.changeset_id):store.changesetReject(args.changeset_id))),
    tool("docs_backlinks", "Read typed inbound links to a page.",obj(target),(args,store)=>store.backlinks(args.path).then(backlinks=>({ok:true,backlinks}))),
    tool("docs_annotation_add", "Add a validated note or agent request to a page. Read docs_annotations for expected_annotations_hash; omit only when no annotation file exists.",
      obj({...target,target:record,body:str,author:str,intent:Type.Union([Type.Literal("note"),Type.Literal("agent-request")]),expected_annotations_hash:Type.Optional(str)}),
      (args,store)=>store.addAnnotation(args.path,{target:args.target,body:args.body,author:args.author,intent:args.intent,expectedHash:args.expected_annotations_hash})),
    tool("docs_annotation_reply", "Reply to a page annotation using its current annotation-file hash.",
      obj({...target,annotation_id:str,body:str,author:str,expected_annotations_hash:str}),
      (args,store)=>store.addAnnotationReply(args.path,args.annotation_id,{body:args.body,author:args.author,expectedHash:args.expected_annotations_hash})),
    tool("docs_annotation_resolve", "Resolve a page annotation using its current annotation-file hash.",
      obj({...target,annotation_id:str,expected_annotations_hash:str,response:Type.Optional(Type.String())}),
      (args,store)=>store.resolveAnnotation(args.path,args.annotation_id,args.expected_annotations_hash,undefined,args.response)),
    tool("docs_annotation_thread", "Bind a page annotation to a T3 Code thread, or pass thread:null to clear it. The annotation stays open.",
      obj({...target,annotation_id:str,thread:Type.Union([obj({id:str,title:Type.Optional(Type.String())}),Type.Null()]),expected_annotations_hash:Type.Optional(str)}),
      (args,store)=>store.setAnnotationThread(args.path,args.annotation_id,{thread:args.thread,expectedHash:args.expected_annotations_hash})),
    tool("docs_asset_move", "Preview relocating a Canvas, Sequence, image, video or attachment to another page assets directory. Rewrites all referencing document src/poster values; preserves asset bytes. Paths are docs-root-relative. Read hash with docs_asset_read. Apply with preview:false and expected_tree_hash.",
      obj({ ...writeTarget, to: str, preview: Type.Optional(Type.Boolean()), expected_tree_hash: Type.Optional(str) }),
      (args,store) => store.manageFiles({kind:"asset",path:args.path,to:args.to,expected_hash:args.expected_hash,preview:args.preview,expected_tree_hash:args.expected_tree_hash})),
    tool("docs_asset_delete", "Preview removing an unused asset. Refuses any remaining document references. Apply reviewed deletion with preview:false and expected_tree_hash.",
      obj({ ...writeTarget, preview: Type.Optional(Type.Boolean()), expected_tree_hash: Type.Optional(str) }),
      (args,store) => store.manageFiles({kind:"asset",path:args.path,expected_hash:args.expected_hash,preview:args.preview,expected_tree_hash:args.expected_tree_hash})),
    tool("docs_set_title", "Preview changing a page display title without changing its path, ID or children. Apply with preview:false and expected_tree_hash.",
      obj({ ...writeTarget, title: str, preview: Type.Optional(Type.Boolean()), expected_tree_hash: Type.Optional(str) }),
      async (args, store, ctx) => {
        const before = args.preview === false ? await priorDoc(store, args.path) : undefined;
        const result = await store.manageFiles({kind:"title",path:args.path,title:args.title,expected_hash:args.expected_hash,preview:args.preview,expected_tree_hash:args.expected_tree_hash});
        if (!result.ok || !result.applied || before === undefined) return result;
        pinBaseline({ ctx, project: args.project, before }, args.path);
        const after = await store.docGet(args.path);
        const style = after.ok ? await writeStyleFeedback({ before, after: after.doc, engine: context.judgmentEngine }) : undefined;
        return style ? { ok: true, style_findings: style, next: FIX_STYLE_NEXT, ...result } : result;
      }),
    tool("docs_apply_ops", "Apply a batch of typed document operations atomically and immediately. Keeps block IDs stable. Invalid structure or a stale hash leaves the document unchanged. The result's doc holds the root, the changed blocks and their parents. docs_read returns the whole page. Use component tools for sidecars.", obj({ ...writeTarget, ops: Type.Array(opSchema, { minItems: 1, maxItems: 1000 }) }), (args, store, ctx) => apply(store, args, args.ops, ctx)),
    tool("docs_insert", "Insert a component block using registry defaults, returning its generated blockId. Supply initial props or markdown when useful, then edit using its component tools.", obj({ ...writeTarget, parentId: id, index: Type.Integer({ minimum: 0 }), type: blockType, props: Type.Optional(record), markdown: Type.Optional(Type.String()) }), async (args, store, ctx) => {
      if (args.markdown !== undefined && !stateFor(args.type).carriesText) return failure("This component carries structured props, not markdown text.");
      const blockId = randomUUID();
      const converted = args.markdown === undefined ? undefined : inlineToDelta(args.markdown);
      const props = { ...emptyStateFor(args.type), ...args.props };
      if (["canvas", "sequence", "image", "video"].includes(args.type) && typeof props.src === "string") props.src = canonicalBundleSrc(props.src);
      if (args.type === "app-embed" && typeof props.poster === "string") props.poster = canonicalBundleSrc(props.poster);
      const result = await apply(store, args, [{ type: "insertBlock", blockId, parentId: args.parentId, index: args.index, blockType: args.type, props, ...(converted ? { text: converted.spans } : {}) }], ctx);
      return result.ok ? { ok: true, blockId, ...result, warnings: converted?.warnings ?? [] } : result;
    }),
    tool("docs_write_text", "Replace one text block with inline markdown, preserving its ID and props. Use docs_apply_ops for structural changes and component tools for structured content.", obj({ ...writeTarget, blockId: id, markdown: Type.String() }), async (args, store, ctx) => {
      const loaded = await store.docGet(args.path);
      if (!loaded.ok) return loaded;
      const block = loaded.doc.blocks[args.blockId];
      if (!block || !stateFor(block.type).carriesText) return failure("blockId must name a text-bearing block.");
      const converted = inlineToDelta(args.markdown);
      return { ...await apply(store, args, [{ type: "updateBlock", blockId: args.blockId, text: converted.spans }], ctx, loaded.doc), warnings: converted.warnings };
    }),
    tool("docs_component_read", "Read the Canvas or Sequence sidecar referenced by a document block, including its hash. Use that hash as expected_component_hash and doc_hash as expected_hash in component action tools.", obj({ ...target, blockId: id }), (args, store) => component(store, args)),
    tool("docs_annotations", "Read annotation requests and discussion attached to a documentation page.", obj(target), (args, store) => store.annotations(args.path)),
    tool("docs_undo", "Undo a patch returned by this connection for this project. Undo refuses when subsequent edits changed the target. Patch history lasts for the local service process lifetime.", obj({ project: str, patch_id: str }), async (args, store) => {
      const patch = patches.get(args.patch_id);
      if (!patch || patch.root !== store.docsRoot) return failure("Patch not found for this project in the current service.", 404);
      for (const file of patch.files) await confined(store.docsRoot, file);
      const result = await store.undoPatch(args.patch_id);
      if (result.ok) { patches.delete(args.patch_id); store.publishChange({ path: patch.path, changedIds: [], patchId: args.patch_id, actor: "undo" }); }
      return result;
    }),
  ];
  for (const bundle of ALL_COMPONENTS) for (const action of bundle.actions as readonly ComponentAction[]) {
    const forwarded = "forward" in action;
    if (forwarded && action.forward.authority !== "canvas" && action.forward.authority !== "sequence") continue;
    const name = `docs_${action.action.replaceAll("-", "_").replace(".", "_").replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`;
    tools.push(tool(name, `${action.description} Applies immediately to ${action.blockType}. ${forwarded ? "Read docs_component_read first for both revision hashes." : "Use the current docs_read hash."}`,
      // Linked development packages may resolve separate TypeBox declarations;
      // their runtime schemas use the same Symbol.for markers.
      obj({ ...writeTarget, blockId: id, params: action.params as unknown as TSchema, ...(forwarded ? { expected_component_hash: str } : {}) }), async (args, store, ctx) => {
        const op: Extract<DocOp, { type: "componentAction" }> = { type: "componentAction", blockId: args.blockId, action: action.action, params: args.params };
        if (!forwarded) return apply(store, args, [op], ctx);
        const read = await component(store, args);
        if (!read.ok) return read;
        if (action.forward.authority === "sequence") {
          const result = await store.forwardSequenceAction(args.path, op, args.expected_hash, args.expected_component_hash);
          // A program or document the sequence diagnostics flag is refused; its findings say why.
          if (!result.ok) return { ...result, ...(Array.isArray(result.issues) ? { component_findings: findingList(sequenceFindings(result.issues)) } : {}) };
          const { program, svg, ...rest } = result;
          return componentApplied(store, args.path, rest, sequenceLintFindings(result.sequence, lintSequence),
            { ...("path" in svg ? { svg_path: svg.path } : { svg_error: svg.error }), program }, SEQUENCE_WARNINGS_NEXT);
        }
        // The text lints judge what this task wrote: against its first-touch board, else the board this edit replaced.
        const result = await store.forwardCanvasAction(args.path, op, args.expected_hash, args.expected_component_hash);
        if (!result.ok || read.type !== "canvas") return applied(store, args.path, result);
        // Only a saved edit touches the board. Its baseline is the board read before the edit.
        if (ctx.taskId && canvasBaseline(ctx, args.project, read.src) === undefined) context.taskCanvasBaselines?.set(ctx.taskId, `${args.project}:${read.src}`, read.canvas);
        const findings = canvasFindings(result.canvas, { baseline: canvasBaseline(ctx, args.project, read.src) ?? read.canvas });
        return componentApplied(store, args.path, result, findings, {});
      }));
  }
  return tools;
}
