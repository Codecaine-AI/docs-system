import { mutateTree } from "./tree-tools";
import { createHash, randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { Type, type TObject, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  ACTION_REGISTRY, ALL_COMPONENTS, DOC_BLOCK_TYPES, emptyStateFor, stateFor,
  type DocOp, type ComponentAction,
} from "@codecaine-ai/docs-model";
import { inlineToDelta } from "@codecaine-ai/docs-model/markdown-to-delta";
import { lintDocument, titleHeadingFixOps } from "@codecaine-ai/docs-model/lint";
import { resolveDocBundleJsonPath } from "@codecaine-ai/docs-index/paths";
import { normalizeBundlePath } from "@codecaine-ai/docs-server/bundle";
import { createDocsStore, type DocsStore } from "@codecaine-ai/docs-server/store";
import {
  resolveCanvasSidecarRelativePath, resolveSequenceSidecarRelativePath,
} from "@codecaine-ai/docs-server/confine";

export interface DocsToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}
export interface DocsTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(args: unknown): Promise<DocsToolResult>;
}
export interface DocsToolContext {
  resolveProject(project: string): Promise<{ id: string; docsRoot: string }>;
}

const str = Type.String({ minLength: 1 });
const id = Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,96}$" });
const obj = (properties: Record<string, TSchema>) => Type.Object(properties, { additionalProperties: false });
const record = Type.Record(Type.String(), Type.Unknown());
const blockType = Type.Union(DOC_BLOCK_TYPES.map((type) => Type.Literal(type)));
const delta = Type.Array(obj({ insert: Type.String(), attributes: Type.Optional(record) }));
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

function response(data: Record<string, unknown>): DocsToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data,
    ...(data.ok === false ? { isError: true } : {}) };
}
function failure(detail: string, status = 400): Record<string, unknown> { return { ok: false, status, detail }; }

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

/** Reject lexical escapes and symlink escapes, including existing ancestors of new destinations. */
async function confined(root: string, absolutePath: string): Promise<void> {
  const canonicalRoot = await realpath(root);
  let candidate = resolve(absolutePath);
  const lexical = relative(resolve(root), candidate);
  if (lexical === ".." || lexical.startsWith(`..${sep}`) || lexical.startsWith(sep)) throw new Error("Path escapes the docs root.");
  for (;;) {
    try {
      const canonical = await realpath(candidate);
      const rel = relative(canonicalRoot, canonical);
      if (rel === ".." || rel.startsWith(`..${sep}`) || rel.startsWith(sep)) throw new Error("Symlink escapes the docs root.");
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(candidate);
      if (parent === candidate) throw error;
      candidate = parent;
    }
  }
}

/** Direct adapter over the same store used by the UI. No kernel, model, or staged agent session. */
export function createDocsTools(context: DocsToolContext): DocsTool[] {
  const stores = new Map<string, DocsStore>();
  // Only patches emitted through this adapter can be undone here. In particular,
  // another project's opaque patch ID cannot select a root-relative ledger entry.
  const patches = new Map<string, { root: string; path: string; files: string[] }>();
  async function storeFor(args: Record<string, any>): Promise<DocsStore> {
    const project = await context.resolveProject(args.project);
    const root = await realpath(project.docsRoot);
    let store = stores.get(root);
    if (!store) { store = createDocsStore(root); stores.set(root, store); }
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
    run: (args: Record<string, any>, store: DocsStore) => Promise<Record<string, unknown>>): DocsTool {
    return { name, description, inputSchema: jsonSchema(schema), execute: async (args) => {
      try {
        if (!Value.Check(schema, args)) {
          return response({ ...failure("Tool arguments failed validation."), issues: [...Value.Errors(schema, args)].map(({ path, message }) => ({ path, message })) });
        }
        const input = args as Record<string, any>;
        const store = await storeFor(input);
        if (name.startsWith("docs_change") || name.startsWith("docs_proposal")) {
          await confined(store.docsRoot,resolve(store.docsRoot,".changesets"));
          for (const entry of input.entries ?? []) await storeFor({project:input.project,path:entry.docPath});
        }
        return response(await run(input, store));
      } catch (error) { return response(failure(error instanceof Error ? error.message : String(error))); }
    } };
  }
  async function applied(store: DocsStore, path: string, result: Record<string, any>): Promise<Record<string, unknown>> {
    if (!result.ok) return result;
    const patchId = result.patchId as string | undefined;
    if (patchId) {
      const docFile = resolveDocBundleJsonPath(store.docsRoot, path)!;
      const sidecar = result.canvasRelPath ?? result.sequenceRelPath;
      patches.set(patchId, { root: store.docsRoot, path, files: [docFile, ...(sidecar ? [resolve(store.docsRoot, sidecar)] : [])] });
    }
    if (patchId) store.publishChange({ path, changedIds: [...(result.changedIds ?? []), ...(result.normalization?.ops ?? []).map((op: DocOp) => "blockId" in op ? op.blockId : "").filter(Boolean)], patchId, actor: "external-agent" });
    return { ...result, path, ...(result.hash ? { expected_hash: result.hash } : {}),
      next: "Changes are saved. Run docs_check before reporting completion." };
  }
  async function apply(store: DocsStore, args: Record<string, any>, ops: DocOp[]): Promise<Record<string, unknown>> {
    if (ops.some((op) => op.type === "componentAction" && ACTION_REGISTRY.get(op.action) && "forward" in ACTION_REGISTRY.get(op.action)!)) {
      return failure("Sidecar actions require their typed component tool and expected_component_hash; they cannot be mixed into a document batch.");
    }
    return applied(store, args.path, await store.applyDocOps(args.path, ops, args.expected_hash));
  }
  async function component(store: DocsStore, args: Record<string, any>) {
    const doc = await store.docGet(args.path);
    if (!doc.ok) return doc;
    const block = doc.doc.blocks[args.blockId];
    if (!block || (block.type !== "canvas" && block.type !== "sequence")) return failure("blockId must name a canvas or sequence block.");
    if (typeof block.props.src !== "string") return failure("This component has no sidecar src. Central component references are not supported by the Docs store.");
    const syntheticPath = `${normalizeBundlePath(args.path) ? `${normalizeBundlePath(args.path)}/` : ""}doc.mdx`;
    const src = block.type === "canvas" ? resolveCanvasSidecarRelativePath(syntheticPath, block.props.src) : resolveSequenceSidecarRelativePath(syntheticPath, block.props.src);
    if (!src) return failure("Invalid component sidecar path.");
    await confined(store.docsRoot, resolve(store.docsRoot, src));
    return { type: block.type, src, doc_hash: doc.hash,
      ...(block.type === "canvas" ? await store.canvasGet(src) : await store.sequenceGet(src)) };
  }

  const tools = [
    tool("docs_tree", "Discover the documentation tree for a project. Read documents through docs_read, never edit doc.json directly.", obj({ project: str }), async (_, store) => ({ ok: true, tree: await store.tree() })),
    tool("docs_read", "Read the document, rendered markdown, stable block IDs, revision hash, and current writing findings. Use its hash as expected_hash on every edit.", obj(target), async (args, store) => {
      const result = await store.docGet(args.path);
      return result.ok ? { ...result, expected_hash: result.hash, lint: lintDocument(result.doc, { phase: "complete" }) } : result;
    }),
    tool("docs_fix_lints", "Apply safe, undoable title-heading lint fixes at the expected revision. Removes only a repeated opening H1 title while preserving children; all other heading levels remain unchanged. Run docs_check afterward for remaining findings.", obj(writeTarget), async (args, store) => {
      const result = await store.docGet(args.path);
      if (!result.ok) return result;
      if (result.hash !== args.expected_hash) return failure("Document changed; read the current revision before fixing lints.", 409);
      const ops = titleHeadingFixOps(result.doc);
      if (ops.length === 0) return { ok: true, path: args.path, hash: result.hash, expected_hash: result.hash, fixed: 0, lint: lintDocument(result.doc, { phase: "complete" }) };
      const fixed = await apply(store, args, ops);
      return { ...fixed, ...(fixed.ok ? { fixed: ops.length, ops, lint: lintDocument(fixed.doc as any, { phase: "complete" }) } : {}) };
    }),
    tool("docs_check", "Run final document validation and writing checks. Inspect blocking findings and resolve them before claiming the task is complete.", obj(target), async (args, store) => {
      const result = await store.docGet(args.path);
      if (!result.ok) return result;
      const lint = lintDocument(result.doc, { phase: "complete" });
      const components = [];
      for (const block of Object.values(result.doc.blocks)) {
        if (block.type === "canvas" || block.type === "sequence") {
          const checked = await component(store, { ...args, blockId: block.id });
          components.push({ blockId: block.id, type: block.type, ok: checked.ok, ...(!checked.ok ? { detail: checked.detail } : {}) });
        }
      }
      return { ok: lint.blocking.length === 0 && components.every((entry) => entry.ok), structurally_valid: true, hash: result.hash, lint, components };
    }),
    tool("docs_create", "Create a new blank documentation bundle through the existing tree service. Refuses an existing destination. Populate it with docs_insert or docs_apply_ops, then run docs_check.", obj({ ...target, title: str, expected_absent: Type.Literal(true) }), async (args, store) => {
      await confined(store.docsRoot, resolve(store.docsRoot, ".changesets"));
      const staged = await store.changesetStage({ summary: `Create ${args.title}`, entries: [], treeOps: [{ kind: "create-doc", docPath: args.path, title: args.title, position: 0 }] });
      if (!staged.ok) return staged;
      const accepted = await store.changesetAccept(staged.changeset.id);
      if (!accepted.ok) return accepted;
      const doc = await store.docGet(args.path);
      // Tree inverses can delete later additions and do not carry revision
      // guards. Do not expose those through the guarded content-undo tool.
      return applied(store, args.path, { ...doc, creation_id: staged.changeset.id, undo_available: false });
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
        const bytes=await readFile(resolve(store.docsRoot,args.path));
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
    tool("docs_component_create", "Create a validated Canvas or Sequence sidecar for a page. src is relative to the page directory, under assets/canvases or assets/sequences. Then insert a typed component block referencing returned src. Refuses overwrite.",
      obj({...writeTarget,component:Type.Union([Type.Literal("canvas"),Type.Literal("sequence")]),src:str,document:record}),async(args,store)=>{
        const docPath=`${normalizeBundlePath(args.path)}/doc.json`;
        const rel=args.component==="canvas"?resolveCanvasSidecarRelativePath(docPath,args.src):resolveSequenceSidecarRelativePath(docPath,args.src);
        if(!rel)return failure("Invalid sidecar path.");await confined(store.docsRoot,resolve(store.docsRoot,rel));
        return args.component==="canvas"?store.createCanvasSidecar({docPath,src:args.src,canvas:args.document,originalHash:args.expected_hash,insertMdx:false}):store.createSequenceSidecar({docPath,src:args.src,sequence:args.document,originalHash:args.expected_hash});
      }),
    tool("docs_proposals", "List staged proposals and stale status for a page.",obj(target),(args,store)=>store.proposals(args.path)),
    tool("docs_proposal_stage", "Stage typed document operations for review instead of applying them. Uses the current page hash. Sidecar edits use component tools.",
      obj({...writeTarget,summary:str,ops:Type.Array(opSchema,{minItems:1,maxItems:1000})}),
      (args,store)=>store.stageProposal(args.path,{summary:args.summary,ops:args.ops,expectedHash:args.expected_hash})),
    ...["accept","reject"].map(action=>tool(`docs_proposal_${action}`,`${action} a reviewed proposal using the current proposals-file hash returned by staging or docs_proposals.`,
      obj({...target,proposal_id:str,expected_proposals_hash:str}),(args,store)=>action==="accept"?store.acceptProposal(args.path,args.proposal_id,{expectedHash:args.expected_proposals_hash}).then(result=>applied(store,args.path,result)):store.rejectProposal(args.path,args.proposal_id,{expectedHash:args.expected_proposals_hash}))),
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
    tool("docs_asset_move", "Preview relocating a Canvas, Sequence, image, video or attachment to another page assets directory. Rewrites all referencing document src/poster values; preserves asset bytes. Paths are docs-root-relative. Read hash with docs_asset_read. Apply with preview:false and expected_tree_hash.",
      obj({ ...writeTarget, to: str, preview: Type.Optional(Type.Boolean()), expected_tree_hash: Type.Optional(str) }),
      (args,store) => store.manageFiles({kind:"asset",path:args.path,to:args.to,expected_hash:args.expected_hash,preview:args.preview,expected_tree_hash:args.expected_tree_hash})),
    tool("docs_asset_delete", "Preview removing an unused asset. Refuses any remaining document references. Apply reviewed deletion with preview:false and expected_tree_hash.",
      obj({ ...writeTarget, preview: Type.Optional(Type.Boolean()), expected_tree_hash: Type.Optional(str) }),
      (args,store) => store.manageFiles({kind:"asset",path:args.path,expected_hash:args.expected_hash,preview:args.preview,expected_tree_hash:args.expected_tree_hash})),
    tool("docs_set_title", "Preview changing a page display title without changing its path, ID or children. Apply with preview:false and expected_tree_hash.",
      obj({ ...writeTarget, title: str, preview: Type.Optional(Type.Boolean()), expected_tree_hash: Type.Optional(str) }),
      (args,store) => store.manageFiles({kind:"title",path:args.path,title:args.title,expected_hash:args.expected_hash,preview:args.preview,expected_tree_hash:args.expected_tree_hash})),
    tool("docs_apply_ops", "Apply a batch of typed document operations atomically and immediately. Keeps block IDs stable. Invalid structure or a stale hash leaves the document unchanged. Use component tools for sidecars.", obj({ ...writeTarget, ops: Type.Array(opSchema, { minItems: 1, maxItems: 1000 }) }), (args, store) => apply(store, args, args.ops)),
    tool("docs_insert", "Insert a component block using registry defaults, returning its generated blockId. Supply initial props or markdown when useful, then edit using its component tools.", obj({ ...writeTarget, parentId: id, index: Type.Integer({ minimum: 0 }), type: blockType, props: Type.Optional(record), markdown: Type.Optional(Type.String()) }), async (args, store) => {
      if (args.markdown !== undefined && !stateFor(args.type).carriesText) return failure("This component carries structured props, not markdown text.");
      const blockId = randomUUID();
      const converted = args.markdown === undefined ? undefined : inlineToDelta(args.markdown);
      const result = await apply(store, args, [{ type: "insertBlock", blockId, parentId: args.parentId, index: args.index, blockType: args.type, props: { ...emptyStateFor(args.type), ...args.props }, ...(converted ? { text: converted.spans } : {}) }]);
      return { ...result, ...(result.ok ? { blockId, warnings: converted?.warnings ?? [] } : {}) };
    }),
    tool("docs_write_text", "Replace one text block with inline markdown, preserving its ID and props. Use docs_apply_ops for structural changes and component tools for structured content.", obj({ ...writeTarget, blockId: id, markdown: Type.String() }), async (args, store) => {
      const loaded = await store.docGet(args.path);
      if (!loaded.ok) return loaded;
      const block = loaded.doc.blocks[args.blockId];
      if (!block || !stateFor(block.type).carriesText) return failure("blockId must name a text-bearing block.");
      const converted = inlineToDelta(args.markdown);
      return { ...await apply(store, args, [{ type: "updateBlock", blockId: args.blockId, text: converted.spans }]), warnings: converted.warnings };
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
      obj({ ...writeTarget, blockId: id, params: action.params as unknown as TSchema, ...(forwarded ? { expected_component_hash: str } : {}) }), async (args, store) => {
        const op: Extract<DocOp, { type: "componentAction" }> = { type: "componentAction", blockId: args.blockId, action: action.action, params: args.params };
        if (!forwarded) return apply(store, args, [op]);
        const read = await component(store, args);
        if (!read.ok) return read;
        const result = action.forward.authority === "canvas"
          ? await store.forwardCanvasAction(args.path, op, args.expected_hash, args.expected_component_hash)
          : await store.forwardSequenceAction(args.path, op, args.expected_hash, args.expected_component_hash);
        return applied(store, args.path, result);
      }));
  }
  return tools;
}
