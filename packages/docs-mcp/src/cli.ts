#!/usr/bin/env bun
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { identityFromEnv, newRunId } from '@codecaine-ai/action-log';
import { startMcp } from './mcp';
import { runDaemon } from './daemon';
import { daemonFetch, ensureDaemon, readDaemonState, daemonHealthy, stopDaemon, PACKAGE_ROOT, stateDirectory, implementationFingerprint, routeState } from './lifecycle';
import { clientReply, endpoint, remoteSettings, routeCall, routedArguments, taskRoutes } from './remote';
import { installClients, doctorClients, restoreInstallation } from './install';
import { loadGuidance } from './guidance';
import { guidanceManifest } from './guidance-manifest';
import { INSTRUCTIONS } from './instructions';
import { createDevelopmentSnapshot } from './snapshot';
import { createInteractionService } from './service';
import { discoverProjects } from './discovery';
import { loadCodecaineEnv } from './codecaine-env';
// Background and client-launched processes do not inherit the shell. See codecaine-env.ts.
loadCodecaineEnv();

const args=process.argv.slice(2);const command=args.shift()??'help';
function option(name:string,fallback?:string){const i=args.indexOf(name);return i>=0?args[i+1]:fallback;}
const workspace=resolve(option('--workspace',process.env.CLAUDE_PROJECT_DIR||process.cwd())!);
const out=(value:unknown)=>console.log(JSON.stringify(value,null,2));
/** The CLI prints JSON, so each image of a reply goes to a file on this machine, and the reply names that file. */
async function savedImages(result:any){
 if(!Array.isArray(result?.content)||!result.content.some((item:any)=>item.type==='image'))return result;
 const folder=join(tmpdir(),'codecaine-docs-images');await mkdir(folder,{recursive:true});
 const content=await Promise.all(result.content.map(async(item:any)=>{
  if(item.type!=='image')return item;
  const path=join(folder,`${randomUUID()}.png`);await writeFile(path,Buffer.from(item.data,'base64'));
  return {type:'image',mimeType:item.mimeType,path};
 }));
 return {...result,content};
}
/** The id and name of every project in the workspace, read from each docs_capabilities page. */
async function capabilityProjects(state:Awaited<ReturnType<typeof ensureDaemon>>,workspace:string){
 const projects:{id:string,name:string}[]=[];let cursor:string|undefined;
 do{
  const response=await daemonFetch(state,'/rpc',{workspace,name:'docs_capabilities',arguments:cursor===undefined?{}:{cursor}});
  const text=await response.text();let result:any;
  try{result=JSON.parse(text);}catch{throw new Error(`Docs service error ${response.status}: ${text}`);}
  if(!response.ok)throw new Error(`Docs service error ${response.status}: ${result.detail??result.error??text}`);
  if(result.isError)throw new Error(result.structuredContent?.detail??'docs_capabilities failed');
  projects.push(...result.structuredContent.projects);cursor=result.structuredContent.next_cursor??undefined;
 }while(cursor!==undefined);
 return projects;
}
try{
 switch(command){
  case 'mcp':await startMcp(workspace);break;
  case 'daemon':await runDaemon();break;
  case 'start':{const route=routeCall(remoteSettings(),workspace);const state=await routeState(route.remote);out({url:state.url,pid:state.pid,remote:!!state.remote,stateDirectory:stateDirectory()});break;}
  case 'stop':out(await stopDaemon());break;
  case 'status':{const state=await readDaemonState();out({running:await daemonHealthy(state),url:state?.url,pid:state?.pid,packageRoot:state?.packageRoot,stateDirectory:stateDirectory()});break;}
  case 'background':{
   const action=args[0]??'status';
   if(action==='install'){
    const proc=Bun.spawn(['python3',join(PACKAGE_ROOT,'scripts/install-background.py'),'--port',option('--port','4820')!,'--workspace',workspace],{stdout:'inherit',stderr:'inherit'});process.exitCode=await proc.exited;
   }else if(action==='stop'){
    const proc=Bun.spawn(['launchctl','bootout',`gui/${process.getuid!()}/ai.codecaine.docs`],{stdout:'inherit',stderr:'inherit'});process.exitCode=await proc.exited;
   }else if(action==='start'){const state=await ensureDaemon();out({url:state.url,pid:state.pid});}
   else if(action==='status'){const state=await readDaemonState();out(state&&await daemonHealthy(state)?await(await daemonFetch(state,'/health')).json():{running:false});}
   else throw new Error('Use background install, start, stop, or status');
   break;
  }
  case 'capabilities':case 'call':case 'tools':{
   const name=command==='capabilities'?'docs_capabilities':args[0];
   const toolArgs=command==='capabilities'?{}:JSON.parse(option('--args','{}')!);
   // The remote route (remote.ts) never starts a local daemon. tools asks the remote server whenever remote mode is on.
   // A call with a task_id follows the route of its docs_begin, which this file keeps across CLI processes.
   const remote=remoteSettings();const tasks=taskRoutes(remote?join(stateDirectory(),'remote-tasks.json'):undefined);
   const route=command==='tools'?{remote:!!remote,workspace}:routeCall(remote,workspace,toolArgs,{known:tasks.get(toolArgs.task_id)});
   const state=await routeState(route.remote);
   const response=command==='tools'?await daemonFetch(state,'/tools'):await daemonFetch(state,'/rpc',{workspace:route.workspace,name,arguments:routedArguments(name,route,toolArgs),identity:{runId:newRunId(),...identityFromEnv()}});
   const result=await savedImages(clientReply(await response.json() as any,route));out(result);if(!response.ok||result.isError)process.exitCode=1;
   if(name==='docs_begin'&&typeof result.structuredContent?.task_id==='string')tasks.set(result.structuredContent.task_id,route);
   break;
  }
  case 'install':{
   const clients=option('--clients')?.split(',') as ('codex'|'claude'|'pi')[]|undefined;
   if(clients?.some(c=>!['codex','claude','pi'].includes(c)))throw new Error('Clients must be codex,claude,pi');
   out(await installClients({clients,write:args.includes('--write'),homeDir:option('--home')}));break;
  }
  case 'restore':{const file=args[0];if(!file)throw new Error('Provide a saved installation report');out(await restoreInstallation(await Bun.file(file).json(),{write:args.includes('--write')}));break;}
  case 'doctor':{const report=await doctorClients({homeDir:option('--home')});out(report);if(!report.ok)process.exitCode=1;break;}
  case 'snapshot':{
   const destination=resolve(option('--out',join(PACKAGE_ROOT,'artifacts','snapshot.json'))!);
   const snapshot=await createDevelopmentSnapshot(createInteractionService().listTools());
   await mkdir(resolve(destination,'..'),{recursive:true});await writeFile(destination,JSON.stringify(snapshot,null,2)+'\n');out({path:destination,snapshot:snapshot.snapshotId});break;
  }
  case 'instructions':console.log(INSTRUCTIONS);break;
  case 'manifest':out(await guidanceManifest());break;
  case 'guidance':{const snapshot=await loadGuidance();out({snapshotId:snapshot.snapshotId,components:snapshot.components,sources:snapshot.sources});break;}
  case 'ui':{
   // ui routes like a tool call: a mapped or remote project opens the remote server, never a local daemon.
   const route=routeCall(remoteSettings(),workspace,option('--project')?{project:option('--project')}:{});
   const state=await routeState(route.remote);const projects=await capabilityProjects(state,route.workspace);
   const id=option('--project')??(projects.length===1?projects[0].id:undefined);
   const project=projects.find((p:any)=>p.id===id||p.name===id);if(!project)throw new Error(`Choose --project from: ${projects.map((p:any)=>p.id).join(', ')}`);
   const health=await(await daemonFetch(state,'/health')).json() as any;
   if(health.central||state.remote){
    const url=endpoint(state.url,`/projects/${encodeURIComponent(project.id)}/docs/`).href;
    out({url,project:project.id,central:true});
    if(!args.includes('--no-open')&&process.platform==='darwin')Bun.spawn(['open',url],{stdout:'ignore',stderr:'ignore'});
    break;
   }
   // The local service names projects as discoverProjects does, so its docs root comes from a local scan.
   const local=(await discoverProjects(workspace)).projects.find(p=>p.id===project.id);if(!local)throw new Error(`Project ${project.id} is not in ${workspace}`);
   const {runServe}=await import('../../docs-workbench/src/run-serve');
   await runServe({docsRoot:local.docsRoot,port:Number(option('--port','4808')),hostname:'127.0.0.1',sharedApi:{url:state.url,projectId:project.id,token:state.token}});break;
  }
  default:console.log(`Docs System\n\n  background install|start|stop|status      Manage the signed central service (default port 4820)\n  install [--write] [--clients codex,claude,pi]  Install the MCP entries and the pi extension (preview by default)\n  restore REPORT [--write]                  Restore a saved installation report
  doctor                                    Check installed bindings\n  mcp [--workspace PATH]                    Start stdio MCP bridge\n  capabilities [--workspace PATH]           Print the capabilities index with the project list\n  tools                                    List typed tools\n  call TOOL --args JSON [--workspace PATH]  Invoke tools for testing\n  ui [--workspace PATH] [--project ID] [--port 4808]  Open shared-authority workbench\n  guidance                                  Print the guidance snapshot id and sources\n  instructions                              Print the prompt block (MCP instructions)\n  manifest                                  Print the rule-unit manifest as JSON\n  snapshot [--out FILE]                     Record development snapshot\n  start | status | stop                     Control the shared local service`);
 }
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
