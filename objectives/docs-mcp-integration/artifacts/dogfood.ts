import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve,join } from 'node:path';
import { writeFile } from 'node:fs/promises';
const repo=resolve(import.meta.dir,'../../..');const core=resolve(repo,'..');
const client=new Client({name:'codecaine-docs-acceptance',version:'1.0'});
const evidence:any[]=[];
async function call(name:string,args:Record<string,unknown>={}){
 const result=await client.callTool({name,arguments:args});const data=result.structuredContent as any;
 evidence.push({tool:name,project:args.project,path:args.path,ok:!result.isError,hash:data?.hash,snapshot:data?.snapshot_id,detail:data?.detail});
 if(result.isError)throw new Error(JSON.stringify(data));return data;
}
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[join(repo,'packages/docs-mcp/src/cli.ts'),'mcp','--workspace',core]}));
 const discovered=await call('docs_discover');const begun=await call('docs_begin');
 const specs=[
  {name:'docs-system',path:'20-implementation/10-packages/85-docs-mcp',title:'Docs MCP',blocks:[
   ['paragraph','The Docs MCP package connects external coding agents to the existing Docs service. Codex and Claude Code use an MCP stdio connection. pi Agent uses an extension that forwards the same tool definitions.'],
   ['heading','Read and Edit'],
   ['paragraph','Discover the active workspace with docs_discover. Before editing, call docs_begin to load shared writing standards and component guidance. Read the target document through docs_read, then supply its revision hash and the task ID to a typed editing tool. Valid changes apply immediately.'],
   ['paragraph','The service rejects invalid structure and stale revisions. Editing calls return draft writing findings. Run docs_check before reporting completion, and repair required findings or state what remains unresolved. A failed update in one project does not roll back successful updates in another project.'],
   ['heading','Component Knowledge'],
   ['paragraph','Component manifests declare selection guidance and examples. The shared authoring-guidance renderer supplies the catalog to external tools and both built-in Docs agent contexts. Use docs_guidance with a component name to read its canonical reference.'],
   ['heading','Shared Service'],
   ['paragraph','The CLI automatically starts one local editing service. The client connections share that process, and explicit project IDs route operations to a discovered corpus. The shared workbench mode proxies its API to the same authority. Standalone workbench and kernel modes remain available with their existing process-local state.'],
   ['heading','Development Setup'],
   ['paragraph','From the Docs System repository, run bun packages/docs-mcp/src/cli.ts install to preview the client configuration and skill files. Add --write to install with backups. Run doctor to check those installed files. Restart the coding clients or reload pi after installation.'],
   ['paragraph','Use the ui command with a workspace and project ID to inspect edits through the shared workbench. Publication remains separate: the same corpus can be exported or embedded in a website without deploying after every edit.'],
   ['heading','Source Ownership'],
   ['file-tree',''],
   ['heading','Compatibility'],
   ['paragraph','The snapshot command records package source hashes, repository revisions, tool contracts, and guidance sources. Standards reload between documentation tasks. Imported implementation changes require restarting the service. The built-in Docs Lab editor and generic docs-writer retain their existing staged review behavior.'],
   ['paragraph','Content and component edits expose guarded undo while the service is running. Page creation does not expose undo because the existing tree inverse cannot safely remove a page after later additions.']
  ]},
  {name:'canvas',path:'20-implementation/95-docs-mcp-access',title:'Documentation Access through MCP',blocks:[
   ['paragraph','External coding agents can read and update this Canvas documentation corpus through the Codecaine Docs MCP integration. This uses the Docs interaction service and does not launch the Canvas specialist agent.'],
   ['heading','Connect to This Corpus'],
   ['paragraph','Install the Codecaine Docs client connection and companion skill once. Open the Canvas repository and call docs_discover, or discover the Core workspace to work on Canvas and Docs System documentation in the same request. Each tool call identifies its target project explicitly.'],
   ['heading','Choose and Edit Components'],
   ['paragraph','Call docs_begin before editing. Its shared catalog explains when to use Canvas, Sequence, Process Outline, State Shape, Interaction Surface, and the other registered documentation components. Use docs_guidance for a focused component reference.'],
   ['paragraph','Read content through docs_read and apply changes through typed tools with the current revision hash. Existing embedded Canvas and Sequence actions also require the sidecar hash returned by docs_component_read. Run docs_check before reporting completion.'],
   ['heading','Runtime Boundary'],
   ['paragraph','This connection edits documentation and exposes component operations already supported by the Docs service. It does not replace the standalone Canvas authoring service. Use the shared Docs workbench to inspect the same editing authority as the MCP clients.'],
   ['paragraph','Publishing this corpus remains a separate website build or export. Local tool edits do not deploy a website.']
  ]}
 ];
 for(const spec of specs){
  const project=discovered.projects.find((p:any)=>p.name===spec.name);if(!project)throw new Error(`Missing ${spec.name}`);
  const target={project:project.id,path:spec.path};
  // Idempotent script: if its page already exists, inspect rather than overwrite user edits.
  const tree=await call('docs_tree',{project:project.id});
  if(JSON.stringify(tree).includes(spec.path)) {console.log(`Already exists, checking ${spec.name}/${spec.path}`);await call('docs_check',target);continue;}
  await call('docs_create',{...target,task_id:begun.task_id,title:spec.title,expected_absent:true});
  let read=await call('docs_read',target);const root=read.doc.root;const offset=read.doc.blocks[root].children.length;
  const ops=spec.blocks.map(([type,text],i)=>({type:'insertBlock',blockId:`mcp-guide-${i}`,parentId:root,index:offset+i,blockType:type,props:type==='heading'?{level:2}:type==='file-tree'?{entries:[]}: {},...(type==='file-tree'?{}:{text:[{insert:text}]})}));
  await call('docs_apply_ops',{...target,task_id:begun.task_id,expected_hash:read.hash,ops});
  if(spec.name==='docs-system'){
   const treeId=`mcp-guide-${spec.blocks.findIndex(([type])=>type==='file-tree')}`;
   for(const [path,note] of [
    ['packages/docs-mcp/src/','MCP bridge, local service, client setup and typed tools'],
    ['packages/docs-mcp/skills/codecaine-docs/SKILL.md','External authoring workflow'],
    ['packages/docs-model/src/authoring-guidance.ts','Shared standards and component catalog renderer'],
    ['packages/docs-server/src/store.ts','Root-bound read and mutation authority'],
    ['packages/docs-workbench/src/shared-api.ts','UI proxy to the shared service']
   ]){read=await call('docs_read',target);await call('docs_file_tree_add_entry',{...target,task_id:begun.task_id,expected_hash:read.hash,blockId:treeId,params:{path,note}});}
  }
  const checked=await call('docs_check',target);const final=await call('docs_read',target);
  evidence.push({project:project.id,path:spec.path,finalHash:final.hash,lint:checked.lint,markdown:final.markdown});
 }
 await call('docs_end',{task_id:begun.task_id});
}finally{await client.close();await writeFile(join(import.meta.dir,'dogfood-results.json'),JSON.stringify(evidence,null,2)+'\n');}
console.log(`Saved ${evidence.length} evidence entries.`);
