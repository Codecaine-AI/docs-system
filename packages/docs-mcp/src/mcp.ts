import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, RootsListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { ensureDaemon, daemonFetch } from './lifecycle';

export async function startMcp(initialWorkspace:string){
 const state=await ensureDaemon();let workspace=resolve(initialWorkspace);let rootsReady:Promise<void>=Promise.resolve();
 const server=new Server({name:'codecaine-docs',version:'0.1.0'},{capabilities:{tools:{},resources:{}},instructions:'Use docs_discover for the active workspace. For documentation edits call docs_begin, read its standards and complete component catalog, then use typed Docs tools with task_id and revision hashes. Edits apply immediately. Run docs_check before completion. Never rewrite doc.json or component sidecars directly.'});
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
 server.setRequestHandler(ListResourcesRequestSchema,async()=>({resources:[{uri:'codecaine://docs/guidance',name:'docs-authoring-guidance',description:'Current shared writing standards and full component selection catalog. Use docs_begin to pin it for editing.',mimeType:'text/markdown'}]}));
 server.setRequestHandler(ReadResourceRequestSchema,async request=>{
  if(request.params.uri!=='codecaine://docs/guidance')throw new Error('Unknown resource');
  const result=await call('docs_guidance');if(result.isError)throw new Error(result.structuredContent?.detail??'Guidance unavailable');
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
