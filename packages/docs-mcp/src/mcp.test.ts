import { test, expect } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtemp,mkdir,writeFile,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLI_PATH } from './lifecycle';

test('two MCP clients share one authority; typed edits, UI visibility, stale rejection and undo cross protocol',async()=>{
 const root=await mkdtemp(join(tmpdir(),'docs-mcp-protocol-'));const state=join(root,'state');const clients:Client[]=[];
 try{
  await writeFile(join(root,'members.json'),JSON.stringify([{dir:'a'},{dir:'b'}]));
  const doc={schemaVersion:1,id:'test',title:'Test',root:'root',blocks:{root:{id:'root',type:'paragraph',props:{},children:['p']},p:{id:'p',type:'paragraph',props:{},children:[],text:[{insert:'Original.'}]}}};
  for(const p of ['a','b']){await mkdir(join(root,p,'docs','page'),{recursive:true});await writeFile(join(root,p,'docs','page','doc.json'),JSON.stringify(doc));}
  await mkdir(join(root,'a','docs','page','child'));await writeFile(join(root,'a','docs','page','child','doc.json'),JSON.stringify({...doc,id:'child'}));
  const create=async()=>{const client=new Client({name:'protocol-qa',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[CLI_PATH,'mcp','--workspace',root],env:{...process.env,CODECAINE_DOCS_STATE_DIR:state} as Record<string,string>}));clients.push(client);return client;};
  const [a,b]=await Promise.all([create(),create()]);
  const invoke=async(client:Client,name:string,args:Record<string,unknown>={})=>(await client.callTool({name,arguments:args})).structuredContent as any;
  const tools=await a.listTools();expect(tools.tools.length).toBeGreaterThan(40);
  const found=await invoke(a,'docs_discover');expect(found.projects.length).toBe(2);const project=found.projects.find((p:any)=>p.name==='a').id;
  const begun=await invoke(a,'docs_begin');expect(begun.guidance).toContain('docs_style_guide');expect(begun.components.length).toBeGreaterThan(5);
  const before=await invoke(a,'docs_read',{project,path:'page'});
  const saved=await invoke(a,'docs_write_text',{task_id:begun.task_id,project,path:'page',expected_hash:before.hash,blockId:'p',markdown:'Updated through MCP.'});expect(saved.ok).toBe(true);
  expect((await invoke(b,'docs_read',{project,path:'page'})).markdown).toContain('Updated through MCP.');
  const stale=await invoke(b,'docs_write_text',{task_id:begun.task_id,project,path:'page',expected_hash:before.hash,blockId:'p',markdown:'Stale.'});expect(stale.ok).toBe(false);
  const daemon=JSON.parse(await readFile(join(state,'daemon.json'),'utf8'));
  const ui=await Bun.fetch(`${daemon.url}/projects/${project}/api/bundle?path=page`,{headers:{Authorization:`Bearer ${daemon.token}`}});expect(ui.status).toBe(200);expect(JSON.stringify(await ui.json())).toContain('Updated through MCP.');
  const denied=await Bun.fetch(`${daemon.url}/tools`);expect(denied.status).toBe(401);
  const undo=await invoke(b,'docs_undo',{task_id:begun.task_id,project,patch_id:saved.patchId});expect(undo.ok).toBe(true);
  expect((await invoke(a,'docs_read',{project,path:'page'})).markdown).toContain('Original.');
  for (const name of ['docs_create','docs_move','docs_rename','docs_delete']) expect(tools.tools.some(t=>t.name===name)).toBe(true);
  const treeArgs={project,task_id:begun.task_id};
  expect((await invoke(a,'docs_move',{project,path:'page',to:'denied',expected_hash:before.hash})).ok).toBe(false);
  const movePreview=await invoke(a,'docs_move',{...treeArgs,path:'page',to:'moved',expected_hash:before.hash});
  expect((await invoke(a,'docs_move',{...treeArgs,path:'page',to:'moved',expected_hash:before.hash,preview:false,expected_tree_hash:movePreview.tree_hash})).ok).toBe(true);
  expect((await invoke(b,'docs_read',{project,path:'moved/child'})).doc.id).toBe('child');
  const movedPage=await invoke(b,'docs_read',{project,path:'moved'});
  const renamePreview=await invoke(b,'docs_rename',{...treeArgs,path:'moved',name:'renamed',expected_hash:movedPage.hash});
  expect((await invoke(b,'docs_rename',{...treeArgs,path:'moved',name:'renamed',expected_hash:movedPage.hash,preview:false,expected_tree_hash:renamePreview.tree_hash})).ok).toBe(true);
  const renamedPage=await invoke(a,'docs_read',{project,path:'renamed'});
  const preview=await invoke(a,'docs_delete',{...treeArgs,path:'renamed',recursive:true,expected_hash:renamedPage.hash});
  expect(preview.preview).toBe(true);
  expect((await invoke(b,'docs_delete',{...treeArgs,path:'renamed',recursive:true,expected_hash:renamedPage.hash,preview:false,expected_tree_hash:preview.tree_hash})).ok).toBe(true);
  expect((await invoke(a,'docs_read',{project,path:'renamed'})).ok).toBe(false);
  const detail=await invoke(a,'docs_guidance',{task_id:begun.task_id,component:'state-shape'});expect(detail.reference.length).toBeGreaterThan(100);
 }finally{
  await Promise.all(clients.map(c=>c.close()));
  try{const daemon=JSON.parse(await readFile(join(state,'daemon.json'),'utf8'));await Bun.fetch(`${daemon.url}/shutdown`,{method:'POST',headers:{Authorization:`Bearer ${daemon.token}`}});await Bun.sleep(200);}catch{}
  await rm(root,{recursive:true,force:true});
 }
},30000);
