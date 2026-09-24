import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { serializeDocDocument, type DocDocument } from "@codecaine-ai/docs-model";
import { createDocsStore } from "@codecaine-ai/docs-server/store";
import { createDocsTools, type DocsTool } from "../tools";

const fixture: DocDocument = {
  schemaVersion: 1, id: "fixture", title: "Fixture", root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["p", "table"] },
    p: { id: "p", type: "paragraph", props: {}, children: [], text: [{ insert: "Initial text." }] },
    table: { id: "table", type: "structured-table", props: { columns: ["Name"], rows: [["Old"]] }, children: [] },
  },
};
let temp: string;
let roots: Record<string, string>;
let tools: DocsTool[];
async function call(name: string, args: Record<string, unknown>) {
  const tool = tools.find((entry) => entry.name === name);
  expect(tool).toBeDefined();
  return (await tool!.execute({ project: "a", ...args })).structuredContent as Record<string, any>;
}
async function read(project = "a", path = "page") { return call("docs_read", { project, path }); }
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), "docs-mcp-tools-"));
  roots = { a: join(temp, "a"), b: join(temp, "b") };
  for (const root of Object.values(roots)) {
    await mkdir(join(root, "page"), { recursive: true });
    await writeFile(join(root, "page/doc.json"), serializeDocDocument(fixture));
  }
  tools = createDocsTools({ resolveProject: async (project) => {
    if (!roots[project]) throw new Error("Unknown project");
    return { id: project, docsRoot: roots[project] };
  } });
});
afterEach(async () => { await rm(temp, { recursive: true, force: true }); });

describe("direct Docs MCP tools", () => {
  test("reads stable IDs and projections, then writes immediately through the store", async () => {
    const before = await read();
    expect(before.doc.blocks.p.id).toBe("p");
    expect(before.markdown).toContain("Initial text.");
    const saved = await call("docs_write_text", { path: "page", blockId: "p", expected_hash: before.hash, markdown: "A **revised** paragraph." });
    expect(saved.ok).toBe(true);
    expect(saved.lint.phase).toBe("draft");
    expect(saved.hash).not.toBe(before.hash);
    expect(saved.patchId).toBeString();
    const uiRead = await createDocsStore(roots.a).docGet("page");
    expect(uiRead.ok && uiRead.markdown).toContain("**revised**");
    expect((await read()).doc.blocks.p.id).toBe("p");
    expect((await read("b")).hash).toBe(before.hash);
  });

  test("rejects missing preconditions and malformed operations without writing", async () => {
    const before = await readFile(join(roots.a, "page/doc.json"), "utf8");
    const invalidArgs = await call("docs_write_text", { path: "page", blockId: "p", markdown: "Missing hash" });
    expect(invalidArgs.ok).toBe(false);
    const current = await read();
    const malformed = await call("docs_apply_ops", { path: "page", expected_hash: current.hash, ops: [{ type: "insertBlock", blockId: "bad", parentId: "root", index: 0, blockType: "heading", props: { level: 90 } }] });
    expect(malformed.ok).toBe(false);
    const malformedReference = await call("docs_apply_ops", { path: "page", expected_hash: current.hash, ops: [{ type: "updateBlock", blockId: "p", text: [{ insert: "Bad reference", attributes: { reference: { type: "invented" } } }] }] });
    expect(malformedReference.ok).toBe(false);
    expect(await readFile(join(roots.a, "page/doc.json"), "utf8")).toBe(before);
  });

  test("rejects a stale hash and admits only one concurrent writer", async () => {
    const before = await read();
    const results = await Promise.all(["First edit.", "Second edit."].map((markdown) => call("docs_write_text", { path: "page", blockId: "p", expected_hash: before.hash, markdown })));
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)?.status).toBe(409);
  });

  test("registry-generated component edits validate their parameters", async () => {
    const before = await read();
    const invalid = await call("docs_structured_table_add_row", { path: "page", blockId: "table", expected_hash: before.hash, params: { cells: 4 } });
    expect(invalid.ok).toBe(false);
    const saved = await call("docs_structured_table_add_row", { path: "page", blockId: "table", expected_hash: before.hash, params: { cells: ["New"] } });
    expect(saved.ok).toBe(true);
    expect((await read()).doc.blocks.table.props.rows).toEqual([["Old"], ["New"]]);
  });

  test("inserts text and components using registry defaults and returns final lint", async () => {
    const before = await read();
    const inserted = await call("docs_insert", { path: "page", expected_hash: before.hash, parentId: "root", index: 1, type: "paragraph", markdown: "Another paragraph." });
    expect(inserted.ok).toBe(true);
    expect(inserted.blockId).toBeString();
    const checked = await call("docs_check", { path: "page" });
    expect(checked.structurally_valid).toBe(true);
    expect(checked.lint.phase).toBe("complete");
    expect(checked.hash).toBe(inserted.hash);
  });

  test("undo cannot use another project's patch", async () => {
    const before = await read();
    const changed = await call("docs_write_text", { path: "page", expected_hash: before.hash, blockId: "p", markdown: "Changed." });
    expect((await call("docs_undo", { project: "b", patch_id: changed.patchId })).ok).toBe(false);
    expect((await call("docs_undo", { patch_id: changed.patchId })).ok).toBe(true);
    expect((await read()).hash).toBe(before.hash);
  });

  test("refuses traversal and symlink access outside the corpus", async () => {
    expect((await call("docs_read", { path: "../b/page" })).ok).toBe(false);
    await symlink(join(roots.b, "page"), join(roots.a, "outside"));
    expect((await call("docs_read", { path: "outside" })).ok).toBe(false);
    expect((await call("docs_write_text", { path: "outside", expected_hash: (await read("b")).hash, blockId: "p", markdown: "Escaped" })).ok).toBe(false);
    expect((await read("b")).markdown).toContain("Initial text.");
  });

  test("creates a new bundle through the tree service without replacing an existing one", async () => {
    const created = await call("docs_create", { path: "new-page", title: "New Page", expected_absent: true });
    expect(created.ok).toBe(true);
    expect((await read("a", "new-page")).doc.title).toBe("New Page");
    const refused = await call("docs_create", { path: "page", title: "Replacement", expected_absent: true });
    expect(refused.ok).toBe(false);
    expect((await read()).doc.title).toBe("Fixture");
  });

  test("reads and edits a Sequence sidecar with both hashes and refuses stale content", async () => {
    const path = join(roots.a, "page/assets/sequences/flow.sequence.json");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ version: 1, id: "flow", title: "Flow", participants: [{ id: "a", name: "a", kind: "participant" }, { id: "b", name: "b", kind: "participant" }], items: [{ kind: "message", id: "m1", from: "a", to: "b", line: "sync", text: "hello" }], style: {} }));
    const inserted = await call("docs_insert", { path: "page", expected_hash: (await read()).hash, parentId: "root", index: 2, type: "sequence", props: { src: "./assets/sequences/flow.sequence.json" } });
    expect(inserted.ok).toBe(true);
    const component = await call("docs_component_read", { path: "page", blockId: inserted.blockId });
    expect(component.ok).toBe(true);
    expect(component.sequence.title).toBe("Flow");
    const args = { path: "page", blockId: inserted.blockId, expected_hash: component.doc_hash, expected_component_hash: component.hash, params: { title: "Updated Flow" } };
    const changed = await call("docs_sequence_set_title", args);
    expect(changed.ok).toBe(true);
    expect(JSON.parse(await readFile(path, "utf8")).title).toBe("Updated Flow");
    expect((await call("docs_sequence_set_title", { ...args, params: { title: "Stale" } })).status).toBe(409);
    const checked = await call("docs_check", { path: "page" });
    expect(checked.components).toEqual([{ blockId: inserted.blockId, type: "sequence", ok: true }]);
    expect((await call("docs_undo", { patch_id: changed.patchId })).ok).toBe(true);
    expect(JSON.parse(await readFile(path, "utf8")).title).toBe("Flow");
  });
});


async function manage(name:string,args:Record<string,unknown>){
  const preview=await call(name,args);expect(preview.ok).toBe(true);
  const result=await call(name,{...args,preview:false,expected_tree_hash:preview.tree_hash});if(!result.ok)console.log(result);return result;
}
async function putDoc(path:string,doc:DocDocument=structuredClone(fixture)){
  await mkdir(join(roots.a,path),{recursive:true});await writeFile(join(roots.a,path,'doc.json'),serializeDocDocument(doc));
}
describe('complete corpus management',()=>{
 test('renumbers subtree, rewrites descendant and canvas links, and preserves IDs',async()=>{
  await putDoc('page/child');
  const overview=structuredClone(fixture);overview.blocks.p.text=[{insert:'Child',attributes:{reference:{kind:'doc',path:'docs/page/child.md'}}}];
  await putDoc('overview',overview);
  await mkdir(join(roots.a,'overview/assets/canvases'),{recursive:true});
  await writeFile(join(roots.a,'overview/assets/canvases/map.canvas.json'),JSON.stringify({nodes:[],edges:[],links:[{id:'link',objectId:'node',target:{kind:'doc',path:'page/child'}}]}));
  const result=await manage('docs_rename',{path:'page',name:'20-section',expected_hash:(await read()).hash});expect(result.ok).toBe(true);
  expect((await read('a','20-section/child')).doc.id).toBe(fixture.id);
  expect((await read('a','overview')).doc.blocks.p.text[0].attributes.reference.path).toBe('20-section/child');
  const canvas=JSON.parse(await readFile(join(roots.a,'overview/assets/canvases/map.canvas.json'),'utf8'));expect(canvas.links[0].target.path).toBe('20-section/child');
 });
 test('moves shared canvas to overview then deletes old architecture without breaking the canvas',async()=>{
  const bytes=JSON.stringify({schemaVersion:1,id:'shared-map',mode:'diagram',objects:[],connections:[],links:[],annotations:[]})+'\n';
  await mkdir(join(roots.a,'page/assets/canvases'),{recursive:true});
  await writeFile(join(roots.a,'page/assets/canvases/map.canvas.json'),bytes);
  const overview=structuredClone(fixture);overview.blocks.canvas={id:'canvas',type:'canvas',props:{src:'../page/assets/canvases/map.canvas.json'},children:[]};overview.blocks.root.children.push('canvas');await putDoc('overview',overview);
  const asset=await call('docs_asset_read',{path:'page/assets/canvases/map.canvas.json'});expect(asset.ok).toBe(true);
  const moved=await manage('docs_asset_move',{path:'page/assets/canvases/map.canvas.json',to:'overview/assets/canvases/map.canvas.json',expected_hash:asset.hash});expect(moved.ok).toBe(true);
  expect(await readFile(join(roots.a,'overview/assets/canvases/map.canvas.json'),'utf8')).toBe(bytes);
  expect((await read('a','overview')).doc.blocks.canvas.props.src).toBe('./assets/canvases/map.canvas.json');
  expect((await manage('docs_delete',{path:'page',expected_hash:(await read()).hash})).ok).toBe(true);
  expect((await read()).ok).toBe(false);
  expect((await call('docs_check',{path:'overview'})).ok).toBe(true);
  expect(await readFile(join(roots.a,'overview/assets/canvases/map.canvas.json'),'utf8')).toBe(bytes);
 });
 test('moving section updates both incoming shared assets and outgoing relative assets',async()=>{
  await putDoc('other');await mkdir(join(roots.a,'other/assets/images'),{recursive:true});await writeFile(join(roots.a,'other/assets/images/x.png'),'image');
  const page=structuredClone(fixture);page.blocks.image={id:'image',type:'image',props:{src:'../other/assets/images/x.png'},children:[]};page.blocks.root.children.push('image');await putDoc('page',page);
  await mkdir(join(roots.a,'page/assets/images'),{recursive:true});await writeFile(join(roots.a,'page/assets/images/local.png'),'local');
  const overview=structuredClone(page);overview.blocks.image.props.src='../page/assets/images/local.png';await putDoc('overview',overview);
  expect((await manage('docs_move',{path:'page',to:'section/moved',expected_hash:(await read()).hash})).ok).toBe(true);
  expect((await read('a','section/moved')).doc.blocks.image.props.src).toBe('../../other/assets/images/x.png');
  expect((await read('a','overview')).doc.blocks.image.props.src).toBe('../section/moved/assets/images/local.png');
 });
 test('preview detects changed descendants and title editing preserves path',async()=>{
  await putDoc('page/child');const args={path:'page',name:'renamed',expected_hash:(await read()).hash};const preview=await call('docs_rename',args);
  await writeFile(join(roots.a,'page/child/.hidden'),'changed');
  expect((await call('docs_rename',{...args,preview:false,expected_tree_hash:preview.tree_hash})).ok).toBe(false);
  expect((await manage('docs_set_title',{path:'page',title:'New Title',expected_hash:(await read()).hash})).ok).toBe(true);
  expect((await read()).doc.title).toBe('New Title');expect((await read('a','page/child')).ok).toBe(true);
 });
 test('recursive delete needs explicit subtree scope and refuses external descendant links',async()=>{
  await putDoc('page/child');const args={path:'page',expected_hash:(await read()).hash};expect((await call('docs_delete',args)).ok).toBe(false);
  const overview=structuredClone(fixture);overview.blocks.p.text=[{insert:'Child',attributes:{reference:{kind:'doc',path:'page/child'}}}];await putDoc('overview',overview);
  expect((await call('docs_delete',{...args,recursive:true})).inbound).toContain('overview/doc.json');
  await putDoc('overview');expect((await manage('docs_delete',{...args,recursive:true})).ok).toBe(true);
  expect((await read('a','page/child')).ok).toBe(false);expect((await read('b')).ok).toBe(true);
 });
 test('refuses stale hashes, collisions, symlinks, overlapping paths and draft locks',async()=>{
  const args={path:'page',expected_hash:(await read()).hash};
  expect((await call('docs_move',{...args,to:'new',expected_hash:'stale'})).ok).toBe(false);
  for(const to of ['../escape','page/child','page'])expect((await call('docs_move',{...args,to})).ok).toBe(false);
  await putDoc('existing');expect((await call('docs_move',{...args,to:'existing'})).ok).toBe(false);
  await symlink(roots.b,join(roots.a,'outside'));expect((await call('docs_move',{...args,to:'outside/new'})).ok).toBe(false);await rm(join(roots.a,'outside'));
  const store=createDocsStore(roots.a);store.locks.acquire({kind:'doc',path:'page'},'internal');
  const preview=await call('docs_move',{...args,to:'new'});
  const result=await call('docs_move',{...args,to:'new',preview:false,expected_tree_hash:preview.tree_hash});expect(result.status).toBe(423);
 });
 test('uploads, reads and deletes unused attachments through tools',async()=>{
  const uploaded=await call('docs_asset_upload',{path:'page',filename:'note.txt',content_type:'text/plain',base64:Buffer.from('hello').toString('base64')});expect(uploaded.ok).toBe(true);
  const asset=await call('docs_asset_read',{path:uploaded.response.path,include_content:true});expect(asset.ok).toBe(true);expect(Buffer.from(asset.base64,'base64').toString()).toBe('hello');
  expect((await manage('docs_asset_delete',{path:uploaded.response.path,expected_hash:asset.hash})).ok).toBe(true);
 });
});

test('creates a Sequence through the service and preserves annotation targets when relocated',async()=>{
 const sequence={version:1,id:'flow',title:'Flow',participants:[],items:[],style:{}};
 const created=await call('docs_component_create',{path:'page',component:'sequence',src:'assets/sequences/new.sequence.json',document:sequence,expected_hash:(await read()).hash});expect(created.ok).toBe(true);
 const inserted=await call('docs_insert',{path:'page',type:'sequence',props:{src:'assets/sequences/new.sequence.json'},parentId:'root',index:2,expected_hash:(await read()).hash});expect(inserted.ok).toBe(true);
 expect((await call('docs_component_read',{path:'page',blockId:inserted.blockId})).ok).toBe(true);
 const note=await call('docs_annotation_add',{path:'page',target:{kind:'block',blockId:'p'},body:'Review this.',author:'test',intent:'note'});expect(note.ok).toBe(true);
 const reply=await call('docs_annotation_reply',{path:'page',annotation_id:note.annotation.id,body:'Reviewed.',author:'test',expected_annotations_hash:note.hash});expect(reply.ok).toBe(true);
 expect((await call('docs_annotation_resolve',{path:'page',annotation_id:note.annotation.id,expected_annotations_hash:reply.hash})).ok).toBe(true);
});

const canvasDocument = {schemaVersion:1,id:'x',mode:'diagram',objects:[],connections:[],links:[],annotations:[]};

test('normalizes a bare component-create src in both its result and written path',async()=>{
 const created=await call('docs_component_create',{path:'page',component:'canvas',src:'assets/canvases/x.canvas.json',document:canvasDocument,expected_hash:(await read()).hash});
 expect(created.ok).toBe(true);expect(created.src).toBe('./assets/canvases/x.canvas.json');
 expect(created.response.canvas_path).toBe('page/assets/canvases/x.canvas.json');
 expect(JSON.parse(await readFile(join(roots.a,'page/assets/canvases/x.canvas.json'),'utf8')).id).toBe('x');
});

test('normalizes a bare component src when inserting a block',async()=>{
 const inserted=await call('docs_insert',{path:'page',type:'canvas',props:{src:'assets/canvases/x.canvas.json'},parentId:'root',index:2,expected_hash:(await read()).hash});
 expect(inserted.ok).toBe(true);
 expect((await read()).doc.blocks[inserted.blockId].props.src).toBe('./assets/canvases/x.canvas.json');
});

test('docs_check reports the blocking lint for a bare bundle-relative component src',async()=>{
 const doc=structuredClone(fixture);doc.blocks.canvas={id:'canvas',type:'canvas',props:{src:'assets/canvases/x.canvas.json'},children:[]};doc.blocks.root.children.push('canvas');
 await writeFile(join(roots.a,'page/doc.json'),serializeDocDocument(doc));await mkdir(join(roots.a,'page/assets/canvases'),{recursive:true});await writeFile(join(roots.a,'page/assets/canvases/x.canvas.json'),JSON.stringify(canvasDocument));
 const checked=await call('docs_check',{path:'page'});
 expect(checked.ok).toBe(false);expect(checked.components).toEqual([{blockId:'canvas',type:'canvas',ok:true}]);
 expect(checked.lint.blocking.some((finding:any)=>finding.ruleId==='bundle-relative-src')).toBe(true);
});

test('docs_check loads a docs-root-relative component without rejoining the bundle path',async()=>{
 const doc=structuredClone(fixture);doc.blocks.canvas={id:'canvas',type:'canvas',props:{src:'page/assets/canvases/x.canvas.json'},children:[]};doc.blocks.root.children.push('canvas');
 await writeFile(join(roots.a,'page/doc.json'),serializeDocDocument(doc));await mkdir(join(roots.a,'page/assets/canvases'),{recursive:true});await writeFile(join(roots.a,'page/assets/canvases/x.canvas.json'),JSON.stringify(canvasDocument));
 const checked=await call('docs_check',{path:'page'});
 expect(checked.components).toEqual([{blockId:'canvas',type:'canvas',ok:true}]);expect(checked.ok).toBe(true);
});
test('stages and accepts reviewed edits and can restore deletion without overwriting later edits',async()=>{
 const staged=await call('docs_proposal_stage',{path:'page',expected_hash:(await read()).hash,summary:'Clarify',ops:[{type:'updateBlock',blockId:'p',text:[{insert:'Reviewed text.'}]}]});expect(staged.ok).toBe(true);
 const proposals=await call('docs_proposals',{path:'page'});expect(proposals.proposals).toHaveLength(1);
 expect((await call('docs_proposal_accept',{path:'page',proposal_id:staged.proposal.id,expected_proposals_hash:proposals.hash})).ok).toBe(true);
 const deleted=await manage('docs_delete',{path:'page',expected_hash:(await read()).hash});expect(deleted.ok).toBe(true);
 const restore=await manage('docs_management_restore',{tree_change_id:deleted.tree_change_id});expect(restore.ok).toBe(true);
 expect((await read()).markdown).toContain('Reviewed text.');
 const moved=await manage('docs_move',{path:'page',to:'new',expected_hash:(await read()).hash});expect(moved.ok).toBe(true);
 await call('docs_write_text',{path:'new',blockId:'p',expected_hash:(await read('a','new')).hash,markdown:'A later change.'});
 expect((await call('docs_management_restore',{tree_change_id:moved.tree_change_id})).ok).toBe(false);
});
test('changeset review tools keep staged multi-page edits available',async()=>{
 const staged=await call('docs_proposal_stage',{path:'page',expected_hash:(await read()).hash,summary:'Clarify',ops:[{type:'updateBlock',blockId:'p',text:[{insert:'Reviewed changeset.'}]}]});
 const grouped=await call('docs_changeset_stage',{summary:'Review group',entries:[{docPath:'page',proposalId:staged.proposal.id}]});expect(grouped.ok).toBe(true);
 expect((await call('docs_changeset_read',{changeset_id:grouped.changeset.id})).ok).toBe(true);
 expect((await call('docs_changeset_accept',{changeset_id:grouped.changeset.id})).ok).toBe(true);
 expect((await read()).markdown).toContain('Reviewed changeset.');
});
test('inventories unused assets and searches pages without filesystem instructions',async()=>{
 await mkdir(join(roots.a,'page/assets/images'),{recursive:true});await writeFile(join(roots.a,'page/assets/images/unused.png'),'unused');
 const assets=await call('docs_assets',{});expect(assets.assets[0].path).toBe('page/assets/images/unused.png');
 expect((await call('docs_search',{query:'Initial text'})).matches[0].path).toBe('page');
});
test('management restore refuses newly added descendants',async()=>{
 const moved=await manage('docs_move',{path:'page',to:'new',expected_hash:(await read()).hash});expect(moved.ok).toBe(true);
 await writeFile(join(roots.a,'new/later.txt'),'later');
 expect((await call('docs_management_restore',{tree_change_id:moved.tree_change_id})).ok).toBe(false);
});


test("title lint fix requires a current revision, removes duplicates, and supports undo", async () => {
  const before = await read();
  const legacy = structuredClone(fixture);
  legacy.blocks.root.children.unshift("title");
  legacy.blocks.title = { id: "title", type: "heading", props: { level: 1 }, children: [], text: [{ insert: "Fixture" }] };
  await writeFile(join(roots.a, "page/doc.json"), serializeDocDocument(legacy));
  const added = await read();
  expect(added.ok).toBe(true);
  expect((await call("docs_check", { path: "page" })).ok).toBe(false);
  expect((await call("docs_fix_lints", { path: "page", expected_hash: before.hash })).status).toBe(409);
  const fixed = await call("docs_fix_lints", { path: "page", expected_hash: added.hash });
  expect(fixed.ok).toBe(true);
  expect(fixed.fixed).toBe(1);
  expect(fixed.doc.blocks.title).toBeUndefined();
  expect((await call("docs_check", { path: "page" })).ok).toBe(true);
  const repeat = await call("docs_fix_lints", { path: "page", expected_hash: fixed.hash });
  expect(repeat.fixed).toBe(0);
  expect(repeat.hash).toBe(fixed.hash);
  expect((await call("docs_undo", { patch_id: fixed.patchId })).ok).toBe(true);
  expect((await read()).doc.blocks.title.text).toEqual([{ insert: "Fixture" }]);
});

test('Process Outline remains draft-editable but completion rejects disconnected roots until repaired', async () => {
  const before=await read();
  const steps=[{text:'Capture source'},{text:'Review the result'}];
  const draft=await call('docs_apply_ops',{path:'page',expected_hash:before.hash,ops:[{type:'insertBlock',blockId:'process',parentId:'root',index:2,blockType:'process-outline',props:{steps}}]});
  expect(draft.ok).toBe(true);
  expect(draft.lint.blocking).toEqual([]);
  const failed=await call('docs_check',{path:'page'});
  expect(failed.ok).toBe(false);
  expect(failed.lint.blocking.some((f:any)=>f.ruleId==='process-outline.single-parent')).toBe(true);
  const repaired=await call('docs_apply_ops',{path:'page',expected_hash:draft.hash,ops:[{type:'componentAction',blockId:'process',action:'process-outline.setSteps',params:{steps:[{text:'Explore a component',steps}]}}]});
  expect(repaired.ok).toBe(true);
  expect((await call('docs_check',{path:'page'})).ok).toBe(true);
});
