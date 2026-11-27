import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, RootsListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { daemonFetch, routeState, type DaemonState } from './lifecycle';
import { clientReply, remoteSettings, routeCall, routedArguments, taskRoutes } from './remote';
import { identityFromEnv, newRunId } from '@codecaine-ai/action-log';
import manifest from '../package.json';
import { INSTRUCTIONS } from './instructions';

export async function startMcp(initialWorkspace:string){
 // workspace: the current one, which a docs_capabilities call sets. localWorkspace: the client's own one, for local projects in hybrid mode.
 let workspace=resolve(initialWorkspace);let localWorkspace=workspace;let rootsReady:Promise<void>=Promise.resolve();
 // Each call takes the remote route or the local one (remote.ts). The remote route never starts a local daemon.
 const remote=remoteSettings();const hybrid=!!remote?.projects.length;const servers=new Map<boolean,Promise<DaemonState>>();const tasks=taskRoutes();
 const connect=(isRemote:boolean)=>{let pending=servers.get(isRemote);if(!pending){pending=routeState(isRemote);servers.set(isRemote,pending);pending.catch(()=>servers.delete(isRemote));}return pending;};
 /** One request to the server of a route. A failed remote request drops its cache entry, so the next call checks /health again. */
 const fetchOn=async(isRemote:boolean,path:string,body?:unknown)=>{
  try{const response=await daemonFetch(await connect(isRemote),path,body);if(!response.ok&&response.status>=500)servers.delete(isRemote);return response;}
  catch(error){servers.delete(isRemote);throw error;}
 };
 if(!remote)await connect(false);
 const identity={runId:newRunId(),...identityFromEnv()};
 const server=new Server({name:'docs-system',version:manifest.version},{capabilities:{tools:{},resources:{}},instructions:INSTRUCTIONS});
 const call=async(name:string,args:Record<string,unknown>={})=>{
  await rootsReady;
  // A call with a task_id follows its task. A guidance read with no task follows the latest task, so a remote task never starts a local daemon.
  const known=tasks.get(args.task_id)??(name==='docs_guidance'&&args.task_id===undefined?tasks.latest():undefined);
  const route=routeCall(remote,workspace,args,{localWorkspace,known});
  const response=await fetchOn(route.remote,'/rpc',{workspace:route.workspace,name,arguments:routedArguments(name,route,args),identity});
  if(!response.ok)throw new Error(`Docs service error: ${response.status}`);
  const result=clientReply(await response.json() as any,route);
  if(name==='docs_begin'&&typeof result.structuredContent?.task_id==='string')tasks.set(result.structuredContent.task_id,route);
  if(name==='docs_capabilities'&&!result.isError&&typeof result.structuredContent?.scope?.workspace==='string'){
   // A remote reply names the server path. Keep the client path, which routes to it again. A local reply also sets the local workspace.
   if(route.remote)workspace=typeof args.workspace==='string'?resolve(args.workspace):workspace;
   else workspace=localWorkspace=result.structuredContent.scope.workspace;
  }
  return result;
 };
 server.setRequestHandler(ListToolsRequestSchema,async()=>{
  // In hybrid mode the tool list falls back to the local daemon, so code repos keep their tools while the remote server is down.
  if(remote){
   try{const response=await fetchOn(true,'/tools');if(response.ok)return await response.json() as any;if(!hybrid)throw new Error('Docs service unavailable');}
   catch(error){if(!hybrid)throw error;}
   servers.delete(true);
  }
  const response=await fetchOn(false,'/tools');if(!response.ok)throw new Error('Docs service unavailable');return await response.json() as any;
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
  try {const roots=await server.listRoots();const local=roots.roots.filter(r=>r.uri.startsWith('file:'));if(local.length===1)workspace=localWorkspace=fileURLToPath(local[0]!.uri);} catch { /* Explicit --workspace and docs_capabilities remain available. */ }
 };
 server.oninitialized=()=>{rootsReady=refreshRoots();};
 server.setNotificationHandler(RootsListChangedNotificationSchema,refreshRoots);
 await server.connect(new StdioServerTransport());
 return server;
}
