import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {resolve,join} from 'node:path';
import {writeFile} from 'node:fs/promises';
const repo=resolve(import.meta.dir,'../../..'),client=new Client({name:'document-management',version:'1'});let task:string|undefined;const checks:any[]=[];
async function call(name:string,args:any={}){const r=await client.callTool({name,arguments:args});if(r.isError)throw Error(JSON.stringify(r.structuredContent));return r.structuredContent as any;}
const p=(text:string)=>({type:'paragraph',props:{},text:[{insert:text}]});const h=(text:string)=>({type:'heading',props:{level:2},text:[{insert:text}]});
const link=(label:string,path:string,tail:string,kind='doc')=>({type:'paragraph',props:{},text:[{insert:label,attributes:{reference:{kind,path}}},{insert:tail}]});
const path='30-guides/10-docs-mcp/50-document-management';
try{await client.connect(new StdioClientTransport({command:process.execPath,args:[join(repo,'packages/docs-mcp/src/cli.ts'),'mcp','--workspace',resolve(repo,'..')]}));
const found=await call('docs_discover');const project=found.projects.find((p:any)=>p.name==='docs-system').id;const begun=await call('docs_begin');task=begun.task_id;
async function append(target:string,blocks:any[]){const r=await call('docs_read',{project,path:target});await call('docs_apply_ops',{project,path:target,task_id:task,expected_hash:r.hash,ops:blocks.map((b,i)=>({type:'insertBlock',blockId:'full-management-'+i,parentId:r.doc.root,index:r.doc.blocks[r.doc.root].children.length+i,blockType:b.type,props:b.props,...(b.text?{text:b.text}:{})}))});}
await call('docs_create',{project,path,title:'Document and Asset Management',expected_absent:true,task_id:task});
await append(path,[
p('Use the connected tools for normal authoring and for reorganizing documentation. Section moves include descendants. Asset relocation transfers ownership while updating the pages that use the asset. These procedures use the shared Docs service and do not run an internal model agent.'),
h('Authoring Coverage'),{type:'structured-table',props:{columns:['Need','Tools','Behavior'],rows:[
['Pages and sections','docs_create, docs_move, docs_rename, docs_delete, docs_set_title','Create pages, relocate or renumber subtrees, change display titles, and delete reviewed pages or subtrees.'],
['Assets and components','docs_assets, docs_asset_read, docs_asset_upload, docs_asset_move, docs_asset_delete, docs_component_create','Inventory unused files; upload media; create validated Canvas or Sequence sidecars; transfer or remove assets without dangling references.'],
['Content','docs_apply_ops, docs_insert, docs_write_text, docs_component_read, generated component actions','Edit typed block structure and component state with revisions; preserve document and block IDs.'],
['Review and recovery','docs_annotation_*, docs_proposals, docs_proposal_*, docs_changesets, docs_changeset_*, docs_undo, docs_management_restore','Handle discussion and staged review. Content patches and management journals have separate restore mechanisms.'],
['Discovery and verification','docs_discover, docs_tree, docs_search, docs_backlinks, docs_begin, docs_guidance, docs_check, docs_end','Find the project and pages, load maintained guidance, and verify every affected document.']]}},
p('The advertised schemas are the current tool contract. Runtime administration, client installation, publication, and arbitrary filesystem commands are separate from document authoring. An unavailable future operation still requires an explicit service adapter rather than direct storage-file edits.'),
h('Rename or Move a Section'),
p('1. Discover the project, begin a task, and read the section root with docs_read. Keep its hash. docs_rename takes the section path and a new directory name; docs_move takes the source path and a destination path in the same project.'),
p('2. Call the operation with its source expected_hash. Preview is the default. Review files, children, and rewritten_sources. The service plans descendant document links, Canvas links, media references, and paths to assets outside the moving subtree.'),
p('3. Apply with preview:false and expected_tree_hash set to the preview tree_hash. A change anywhere in the captured corpus invalidates that plan. Read the destination and run docs_check on affected documents. A directory rename preserves page IDs, block IDs, and titles; use docs_set_title when the display title should change.'),
h('Move a Shared Canvas Before Deleting Its Old Page'),
p('1. Use docs_assets or the referencing block to locate the Canvas. Read its source path with docs_asset_read to get the asset hash. Asset paths are relative to the docs root.'),
p('2. Preview docs_asset_move with path, to, and expected_hash. The destination must be in an existing page assets directory and retain the component file type. For example, move an Architecture Canvas into System Design assets/canvases before removing Architecture.'),
p('3. Apply the reviewed preview. The service moves the asset bytes and rewrites referring src values. It also maintains attachment links, media posters, and annotation Canvas targets. Read the System Design page and component, then run docs_check to verify the surviving embed.'),
p('4. Preview docs_delete on the old page with its fresh document hash. Repair any remaining inbound links. Use recursive:true only when the intended deletion includes all children. Apply the reviewed preview and inspect the remaining tree.'),
p('A reference to a file inside an old page does not transfer ownership. Move the asset itself before deleting the owning page. Deletion refuses references from outside the deletion set, including references to descendant pages and bundled assets.'),
h('Recovery and Coordination'),
p('Keep tree_change_id from every applied management operation. docs_management_restore previews restoring that change. Apply its reviewed tree hash to restore captured content. Restore refuses changed files, added descendants, occupied original paths, and active draft locks. It does not overwrite later work.'),
p('Management journals live under .changesets/file-management/<id>. They record the plan, captured bytes, application status, and hashes after application. Deleted bundles remain in the journal for recovery. Journals are not published documentation. A process or storage failure may require inspecting the retained journal; a failed rollback is reported explicitly.'),
p('Shared-store callers serialize corpus operations, while document and sidecar locks coordinate lower-level edits. Management checks the complete corpus before applying and checks draft locks on affected files. Separate service processes still do not share in-memory coordination. Finish standalone or internal editing activity before reorganizing the same corpus.'),
p('Symlinks, overlapping source/destination paths, destination collisions, invalid rewritten documents, and ambiguous asset paths are rejected. Management restore is distinct from docs_undo, which handles tracked content patches. Cross-project relocation is not an operation; use each project\'s explicit tools and ownership.'),
h('Source Ownership'),
link('packages/docs-server/src/manage-files.ts','packages/docs-server/src/manage-files.ts',' owns preview planning, reference rewrites, file locking, recovery journals, and guarded restoration.','source'),
link('packages/docs-server/src/store.ts','packages/docs-server/src/store.ts',' exposes management through the shared authority and publishes change events.','source'),
link('packages/docs-mcp/src/tools.ts','packages/docs-mcp/src/tools.ts',' owns typed schemas and adapters for external clients. The tool list is generated from these definitions and component actions.','source'),
link('packages/docs-mcp/skills/codecaine-docs/SKILL.md','packages/docs-mcp/skills/codecaine-docs/SKILL.md',' teaches agents how to choose management and review tools. Refresh installed copies through the installer after changing it.','source')
]);
await append('30-guides/10-docs-mcp',[link('Document and Asset Management',path,' covers section renumbering, shared assets, titles, review tools, and restoration.')]);
const replacements=[
['20-implementation/10-packages/85-docs-mcp','page-tree-tools-1','docs_create adds pages. docs_move and docs_rename relocate pages or sections with descendants. The shared management service rewrites descendant document links, Canvas links, and asset references while preserving document identity. docs_set_title changes a display title without moving its path. Management operations use a reviewed corpus fingerprint.'],
['20-implementation/10-packages/85-docs-mcp','page-tree-tools-2','docs_asset_move transfers shared assets and updates their references. docs_delete can remove reviewed subtrees with recursive:true and refuses remaining external references. Management journals support guarded restoration through docs_management_restore. The maintenance guide owns the operating procedure.'],
['30-guides/10-docs-mcp/40-recovery','page-tree-tools-1','Page and section operations now include descendants. docs_move and docs_rename preview their complete file and reference changes; apply with preview:false and expected_tree_hash. Use docs_set_title for display titles.'],
['30-guides/10-docs-mcp/40-recovery','page-tree-tools-2','Management operations keep recovery journals and expose docs_management_restore. Restore refuses subsequent edits or added descendants. Shared-store operations serialize during a reorganization; independent service processes remain separate authorities.'],
['30-guides/10-docs-mcp/40-recovery','page-tree-tools-4','Deletion refuses external references into the deleted subtree. Relocate shared assets with docs_asset_move before removing their owner page. Section moves rewrite both descendant links and shared or external asset paths. Use recursive:true to request deletion of a section and all descendants.']
];
for(const [target,blockId,markdown] of replacements){const r=await call('docs_read',{project,path:target});if(r.doc.blocks[blockId])await call('docs_write_text',{project,path:target,blockId,markdown,expected_hash:r.hash,task_id:task});}
await append('30-guides/10-docs-mcp/40-recovery',[link('Document and Asset Management',path,' gives the complete section, asset, and recovery procedure.')]);
await append('20-implementation/10-packages/85-docs-mcp',[link('Document and Asset Management',path,' documents the supported management tools and their shared service ownership.')]);
for(const target of [path,'30-guides/10-docs-mcp','30-guides/10-docs-mcp/40-recovery','20-implementation/10-packages/85-docs-mcp'])checks.push({path:target,...await call('docs_check',{project,path:target})});
await call('docs_end',{task_id:task});task=undefined;await writeFile(join(import.meta.dir,'full-management-doc-checks.json'),JSON.stringify(checks,null,2));console.log('Four documentation pages checked successfully.');
}finally{if(task)await call('docs_end',{task_id:task}).catch(()=>{});await client.close();}
