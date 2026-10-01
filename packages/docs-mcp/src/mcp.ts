import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, RootsListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { ensureDaemon, daemonFetch } from './lifecycle';
import manifest from '../package.json';

/** Short by design: clients load this with every session. The full rules live in docs_guidance topic "style". */
const INSTRUCTIONS=[
 'Call docs_discover for the active workspace, then docs_begin. Its result opens with the style digest.',
 'Before your first edit, read docs_guidance with task_id and topic "style". Writes are refused until you do.',
 'The most-broken rules are bold-label parent bullets with fact sub-bullets, lists of about 5 items, and no semicolons or label-colon openers.',
 'Write results carry style_findings. Fix them as you go, and run docs_check with task_id on each changed page.',
 'Edit only through typed Docs tools with task_id and revision hashes. Never rewrite doc.json or component sidecars directly.',
].join('\n');

export async function startMcp(initialWorkspace:string){
 const state=await ensureDaemon();let workspace=resolve(initialWorkspace);let rootsReady:Promise<void>=Promise.resolve();
 const server=new Server({name:'codecaine-docs',version:manifest.version},{capabilities:{tools:{},resources:{}},instructions:INSTRUCTIONS});
 const call=async(name:string,args:Record<string,unknown>={})=>{
  await rootsReady;
  const response=await daemonFetch(state,'/rpc',{workspace,name,arguments:args});if(!response.ok)throw new Error(`Docs service error: ${response.status}`);
  const result=await response.json() as any;
  if(name==='docs_discover'&&!result.isError&&typeof result.structuredContent?.workspace==='string')workspace=result.structuredContent.workspace;
  return result;
 };
 server.setRequestHandler(ListToolsRequestSchema,async()=>{
  const response=await daemonFetch(state,'/tools');if(!response.ok)throw new Error('Docs service unavailable');return await response.json() as any;
 });
 server.setRequestHandler(CallToolRequestSchema,async request=>call(request.params.name,request.params.arguments??{}));
 server.setRequestHandler(ListResourcesRequestSchema,async()=>({resources:[{uri:'codecaine://docs/guidance',name:'docs-authoring-guidance',description:'Current shared writing standards, style guide, and full component selection catalog in one text. Use docs_begin to pin it for editing.',mimeType:'text/markdown'}]}));
 server.setRequestHandler(ReadResourceRequestSchema,async request=>{
  if(request.params.uri!=='codecaine://docs/guidance')throw new Error('Unknown resource');
  const result=await call('docs_guidance',{topic:'all'});if(result.isError)throw new Error(result.structuredContent?.detail??'Guidance unavailable');
  return {contents:[{uri:request.params.uri,mimeType:'text/markdown',text:result.structuredContent.guidance}]};
 });
 const refreshRoots=async()=>{
  if(!server.getClientCapabilities()?.roots)return;
  try {const roots=await server.listRoots();const local=roots.roots.filter(r=>r.uri.startsWith('file:'));if(local.length===1)workspace=fileURLToPath(local[0]!.uri);} catch { /* Explicit --workspace and docs_discover remain available. */ }
 };
 server.oninitialized=()=>{rootsReady=refreshRoots();};
 server.setNotificationHandler(RootsListChangedNotificationSchema,refreshRoots);
 await server.connect(new StdioServerTransport());
 return server;
}
