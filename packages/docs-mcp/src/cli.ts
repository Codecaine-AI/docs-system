#!/usr/bin/env bun
import { resolve, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { startMcp } from './mcp';
import { runDaemon } from './daemon';
import { daemonFetch, ensureDaemon, readDaemonState, daemonHealthy, stopDaemon, PACKAGE_ROOT, stateDirectory, implementationFingerprint } from './lifecycle';
import { installClients, doctorClients, restoreInstallation } from './install';
import { loadGuidance, generateSkillReferences } from './guidance';
import { createDevelopmentSnapshot } from './snapshot';
import { createInteractionService } from './service';

const args=process.argv.slice(2);const command=args.shift()??'help';
function option(name:string,fallback?:string){const i=args.indexOf(name);return i>=0?args[i+1]:fallback;}
const workspace=resolve(option('--workspace',process.env.CLAUDE_PROJECT_DIR||process.cwd())!);
const out=(value:unknown)=>console.log(JSON.stringify(value,null,2));
try{
 switch(command){
  case 'mcp':await startMcp(workspace);break;
  case 'daemon':await runDaemon();break;
  case 'start':{const state=await ensureDaemon();out({url:state.url,pid:state.pid,stateDirectory:stateDirectory()});break;}
  case 'stop':out(await stopDaemon());break;
  case 'status':{const state=await readDaemonState();out({running:await daemonHealthy(state),url:state?.url,pid:state?.pid,packageRoot:state?.packageRoot,stateDirectory:stateDirectory()});break;}
  case 'discover':case 'call':case 'tools':{
   const state=await ensureDaemon();
   const name=command==='discover'?'docs_discover':args[0];
   const response=command==='tools'?await daemonFetch(state,'/tools'):await daemonFetch(state,'/rpc',{workspace,name,arguments:command==='discover'?{}:JSON.parse(option('--args','{}')!)});
   const result=await response.json();out(result);if(!response.ok||(result as any).isError)process.exitCode=1;break;
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
  case 'guidance':{const snapshot=await loadGuidance();if(args.includes('--write'))await generateSkillReferences(join(PACKAGE_ROOT,'skills','codecaine-docs'),snapshot);out({snapshotId:snapshot.snapshotId,components:snapshot.components,sources:snapshot.sources});break;}
  case 'ui':{
   const state=await ensureDaemon();const found=await (await daemonFetch(state,'/rpc',{workspace,name:'docs_discover',arguments:{}})).json() as any;
   if(found.isError)throw new Error(found.structuredContent.detail);
   const projects=found.structuredContent.projects;
   const id=option('--project')??(projects.length===1?projects[0].id:undefined);
   const project=projects.find((p:any)=>p.id===id||p.name===id);if(!project)throw new Error(`Choose --project from: ${projects.map((p:any)=>p.id).join(', ')}`);
   const {runServe}=await import('../../docs-workbench/src/run-serve');
   await runServe({docsRoot:project.docsRoot,port:Number(option('--port','4808')),hostname:'127.0.0.1',sharedApi:{url:state.url,projectId:project.id,token:state.token}});break;
  }
  default:console.log(`Codecaine Docs\n\n  install [--write] [--clients codex,claude,pi]  Install connection and skills (preview by default)\n  restore REPORT [--write]                  Restore a saved installation report
  doctor                                    Check installed bindings\n  mcp [--workspace PATH]                    Start stdio MCP bridge\n  discover [--workspace PATH]               List project documentation\n  tools                                    List typed tools\n  call TOOL --args JSON [--workspace PATH]  Invoke tools for testing\n  ui [--workspace PATH] [--project ID] [--port 4808]  Open shared-authority workbench\n  guidance [--write]                        Inspect/regenerate skill references\n  snapshot [--out FILE]                     Record development snapshot\n  start | status | stop                     Control the shared local service`);
 }
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
