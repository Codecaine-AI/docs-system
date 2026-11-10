import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { runWithCallTiming } from '@codecaine-ai/docs-server/call-timing';
import type { DocDocument } from '@codecaine-ai/docs-model';
import { createDocsStore, treeIndex } from '@codecaine-ai/docs-server/store';
import { setDocsRootExclude } from '@codecaine-ai/docs-index/paths';
import { createDocsRoutes } from '@codecaine-ai/docs-server/routes';
import { discoverProjects, type Discovery, type DocsProject } from './discovery';
import { createDocsTools, type DocsToolContext, type DocsToolResult } from './tools';
import { GUIDANCE_TOPICS, guidanceTopics, loadGuidance, servedText, type GuidanceSnapshot, type GuidanceTopic } from './guidance';
import { CAPABILITIES, requiredTopics } from './guidance-manifest';
import manifest from '../package.json';
import { implementationFingerprint } from './lifecycle';
import { textMeasureBackend, textMeasureReady, watchDocsRoot } from '@codecaine-ai/docs-server';
import { defaultJudgmentEngine } from './jev-engine';
import type { JudgmentEngine } from './lint-feedback';

const reply = (data: Record<string,unknown>, error=false):DocsToolResult => ({content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data,...(error?{isError:true}:{})});
const schema=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
const string={type:'string',minLength:1};
const MUTATION_READS = new Set(['docs_tree','docs_read','docs_check','docs_annotations','docs_component_read','docs_search','docs_backlinks','docs_asset_read','docs_assets','docs_proposals','docs_changesets','docs_changeset_read']);
const STYLE_GATE='Read the style guide before your first edit: call docs_guidance with task_id and topic "style". Required once per task.';
const STYLE_NEXT='Read docs_guidance with task_id and topic "style" before your first edit. Writes are refused until you do.';
const topicIndex=(topics:GuidanceTopic[])=>topics.map(({topic,covers,text})=>({topic,covers,chars:text.length}));
/** A task has read a topic when it read that topic or topic "all", which holds every topic. */
const hasRead=(task:{topicsRead:Set<string>},topic:string)=>task.topicsRead.has(topic)||task.topicsRead.has('all');
/** One docs_capabilities page stays within 4,096 bytes, call_id included. */
const CAPABILITIES_PAGE_BYTES=4096,CALL_ID_BYTES=64;
const MINUTE=60_000,HOUR=3_600_000;
export const DEFAULT_TASK_IDLE_MS=30*MINUTE;
export const DEFAULT_TASK_MAX_AGE_MS=12*HOUR;
const RETIRED_KEEP_MS=24*HOUR,SWEEP_EVERY_MS=MINUTE;
type RetireReason='idle'|'max-age';
type TaskCanvasBaseline=NonNullable<ReturnType<NonNullable<DocsToolContext['taskCanvasBaselines']>['get']>>;
type Task={workspace:string,snapshot:GuidanceSnapshot,createdAt:number,lastUsedAt:number,inFlight:number,topicsRead:Set<string>,baselines:Map<string,DocDocument|null>,canvasBaselines:Map<string,TaskCanvasBaseline>};
const plural=(n:number,unit:string)=>`${n} ${unit}${n===1?'':'s'}`;
/** A duration in the largest whole unit: 30 minutes, 12 hours. */
const span=(ms:number)=>ms%HOUR===0?plural(ms/HOUR,'hour'):ms%MINUTE===0?plural(ms/MINUTE,'minute'):plural(Math.ceil(ms/1000),'second');
/** A finite positive millisecond count from the environment, else the default with one warning. */
function durationSetting(name:string,fallback:number):number{
 const raw=process.env[name];if(raw===undefined||raw.trim()==='')return fallback;
 const value=Number(raw);if(Number.isFinite(value)&&value>0)return value;
 console.error(`${name}=${JSON.stringify(raw)} is not a positive number of milliseconds. Using ${fallback}.`);return fallback;
}
const round=(ms:number)=>Math.round(ms*10)/10;
const CALL_TIMINGS_MAX_BYTES=5*1024*1024;
/** Every reply, metadata, tool or refusal, with the call_id of its call-timings line beside its other fields. */
const named=(result:DocsToolResult,callId:string):DocsToolResult=>{
 if(!result.structuredContent)return result;
 const data={...result.structuredContent,call_id:callId};
 return {...result,structuredContent:data,content:[{type:'text',text:JSON.stringify(data)}]};
};
/** Appends one JSON line per tool call to CODECAINE_DOCS_CALL_TIMINGS_FILE (default ~/.codecaine/call-timings.jsonl),
 * moving the file to <file>.1 once it passes 5 MB. Never fails the call it records. */
const timingWrites=new Map<string,Promise<void>>();
async function recordCallTiming(line:Record<string,unknown>){
 const file=process.env.CODECAINE_DOCS_CALL_TIMINGS_FILE||join(homedir(),'.codecaine','call-timings.jsonl');
 // One chain per file: a rotation never runs between another call's size check and its append.
 const write=(timingWrites.get(file)??Promise.resolve()).then(async()=>{
  try{
   await mkdir(dirname(file),{recursive:true});
   if(((await stat(file).catch(()=>undefined))?.size??0)>CALL_TIMINGS_MAX_BYTES)await rename(file,`${file}.1`);
   await appendFile(file,JSON.stringify(line)+'\n');
  }catch(error){console.error(`call-timings: ${error instanceof Error?error.message:String(error)}`);}
 });
 timingWrites.set(file,write);
 await write;
}
/** globalThemesRoot: the shared global theme folder every project's theme API serves (reserved id `global`). codeThemesRoot: the central code-theme folder (`/api/code-themes`). */
/** judgmentEngine: Jev by default. It reads CODECAINE_DOCS_JUDGMENT on every call, so =off disables it without a restart. Pass null for none. */
/** registryFile: the supervisor's projects.json. A rewrite that no longer lists a cached workspace's projects unchanged, or lists a project under it that its discovery lacks, drops that workspace's discovery (see the discovery cache rule). */
/** Tasks expire after taskIdleMs without a call naming them (CODECAINE_DOCS_TASK_IDLE_MS, default 30 min) or taskMaxAgeMs after docs_begin (CODECAINE_DOCS_TASK_MAX_AGE_MS, default 12 h); a task inside a call never expires. now, maxTasks and maxRetired (tombstones kept, default 5,000) are for tests. */
export function createInteractionService(options: { managed?: boolean; projectIds?: Map<string, string>; registryFile?: string; watchFs?: boolean; globalThemesRoot?: string; codeThemesRoot?: string; judgmentEngine?: JudgmentEngine | null; now?: () => number; taskIdleMs?: number; taskMaxAgeMs?: number; maxTasks?: number; maxRetired?: number } = {}) {
 const startupFingerprint=options.managed && process.env.CODECAINE_DOCS_BUILD ? Promise.resolve(process.env.CODECAINE_DOCS_BUILD) : implementationFingerprint();
 const projects=new Map<string,DocsProject>();
 const workspaces=new Map<string,Set<string>>();
 const routes=new Map<string,ReturnType<typeof createDocsRoutes>>();
 const tasks=new Map<string,Task>();
 const now=options.now??Date.now;
 const idleMs=options.taskIdleMs??durationSetting('CODECAINE_DOCS_TASK_IDLE_MS',DEFAULT_TASK_IDLE_MS);
 const maxAgeMs=options.taskMaxAgeMs??durationSetting('CODECAINE_DOCS_TASK_MAX_AGE_MS',DEFAULT_TASK_MAX_AGE_MS);
 const maxTasks=options.maxTasks??1000;
 const maxRetired=options.maxRetired??5000;
 // Retired task ids, so a call with one gets the reason instead of "Unknown task". Answered only in the task's own workspace.
 const retired=new Map<string,{workspace:string,reason:RetireReason,at:number}>();
 const RETIRED_MESSAGE:Record<RetireReason,(id:string)=>string>={
  'max-age':id=>`Task ${id} reached the ${maxAgeMs%HOUR===0?`${maxAgeMs/HOUR}-hour`:span(maxAgeMs)} limit and was closed. Your saved edits are kept. Call docs_begin again, then read docs_guidance topic "style".`,
  idle:id=>`Task ${id} expired after ${span(idleMs)} without a docs call. Your saved edits are kept. Call docs_begin again, then read docs_guidance topic "style".`,
 };
 // Tasks on the same guidance share one snapshot object, refcounted by snapshotId.
 const snapshots=new Map<string,{snapshot:GuidanceSnapshot,refs:number}>();
 function internSnapshot(snapshot:GuidanceSnapshot){
  const held=snapshots.get(snapshot.snapshotId);if(held){held.refs++;return held.snapshot;}
  snapshots.set(snapshot.snapshotId,{snapshot,refs:1});return snapshot;
 }
 function releaseSnapshot(snapshot:GuidanceSnapshot){
  const held=snapshots.get(snapshot.snapshotId);if(held&&--held.refs<=0)snapshots.delete(snapshot.snapshotId);
 }
 function retire(id:string,reason:RetireReason){
  const task=tasks.get(id);if(!task)return;
  tasks.delete(id);releaseSnapshot(task.snapshot);
  retired.delete(id);retired.set(id,{workspace:task.workspace,reason,at:now()});trimRetired();
 }
 /** Keep at most maxRetired tombstones, none older than RETIRED_KEEP_MS. Insertion order is retirement order, so the oldest lead. */
 function trimRetired(){
  const cutoff=now()-RETIRED_KEEP_MS;
  for(const [key,entry] of retired){if(retired.size<=maxRetired&&entry.at>=cutoff)break;retired.delete(key);}
 }
 /** Retire idle and over-age tasks. A task inside a call is never retired. */
 function sweep(){
  const t0=now();
  for(const [id,task] of tasks){
   if(task.inFlight>0)continue;
   if(t0-task.lastUsedAt>idleMs)retire(id,'idle');else if(t0-task.createdAt>maxAgeMs)retire(id,'max-age');
  }
  trimRetired();
 }
 /** The live task with this id in this workspace, refreshed. Throws the retirement reason for a retired id in this workspace; undefined for a missing or foreign id. */
 function liveTask(id:unknown,workspace:string):Task|undefined{
  if(typeof id!=='string')return undefined;
  const task=tasks.get(id);
  if(!task){const gone=retired.get(id);if(gone&&gone.workspace===workspace)throw new Error(RETIRED_MESSAGE[gone.reason](id));return undefined;}
  if(task.workspace!==workspace)return undefined;
  task.lastUsedAt=now();return task;
 }
 const sweeper=setInterval(sweep,SWEEP_EVERY_MS);sweeper.unref?.();
 const watchers=new Map<string,ReturnType<typeof watchDocsRoot>>();
 const treeWatches=new Map<string,()=>void>();
 const tools=createDocsTools({resolveProject:async(id)=>{
  const project=projects.get(id);if(!project)throw new Error('Unknown project. Call docs_capabilities for the active workspace first.');return project;
 },
 // First-touch documents per task, freed when the task expires. undefined: not captured yet. null: the doc did not exist at first touch.
 taskBaselines:{get:(taskId:string,key:string)=>tasks.get(taskId)?.baselines.get(key),set:(taskId:string,key:string,doc:DocDocument|null)=>{tasks.get(taskId)?.baselines.set(key,doc);}},
 // First-touch Canvas sidecars per task, freed with the task: the boards its canvas text lints judge against.
 taskCanvasBaselines:{get:(taskId:string,key:string)=>tasks.get(taskId)?.canvasBaselines.get(key),set:(taskId:string,key:string,board:TaskCanvasBaseline)=>{tasks.get(taskId)?.canvasBaselines.set(key,board);}},
 judgmentEngine:options.judgmentEngine===null?undefined:options.judgmentEngine??defaultJudgmentEngine()});
 /**
  * The discovery cache rule. A workspace's discovery is reused while the files it was read from
  * (members.json and package.json at the workspace, codecaine.docs.json at each folder in
  * Discovery.folders) and those folders themselves (the workspace, each declared and glob-matched folder
  * and its ancestors, each glob's static prefix such as packages/, and each folder that a shorter prefix
  * of a glob with segments after its first wildcard matches) are unchanged, and while the registry, each
  * time it is rewritten, still lists each of its projects unchanged and lists no project under the
  * workspace that it lacks. A new folder under a glob or a manifest added to a matched folder changes a
  * folder's mtime, and an edit to a manifest that enables docs changes the manifest. Each path is signed
  * after the scan, and one whose mtime is 50 ms before the scan's start or later is signed
  * changed-during-scan, so a change the scan may have missed rescans once on the next call. The first page of
  * docs_capabilities always rescans, since a first doc.json inside an existing docs folder changes no signed
  * path. A workspace never seen is scanned on first use, calls that arrive during a scan share
  * it, and concurrent calls that find one stale entry share one rescan. Nothing else scans: one
  * discoverProjects on the knowledge base costs 4 s of CPU, and it used to run on every tool call. A call
  * stats each signed file and folder once, 47 for 20 projects under packages/*.
  */
 const WORKSPACE_MANIFESTS=['members.json','package.json'];
 /** Coarse mtimes round down, so a change just before the scan's start may have been missed. */
 const MTIME_MARGIN_MS=50;
 type CachedDiscovery={discovery:Discovery,signatures:Map<string,string>};
 type Entry={pending:Promise<CachedDiscovery>,settled?:CachedDiscovery};
 const discoveries=new Map<string,Entry>();
 /** mtime and size, or missing: a rewrite, an appearance and a removal all change it. A folder's mtime changes when an entry in it is added, removed or renamed. since: an mtime at or after it signs changed-during-scan. */
 const signature=async(file:string,since=Infinity)=>{try{const s=await stat(file);return s.mtimeMs>=since?'changed-during-scan':`${s.mtimeMs}:${s.size}`;}catch{return 'missing';}};
 const projectKey=(p:DocsProject)=>JSON.stringify([p.id,p.root,p.docsRoot,p.products,p.exclude??[]]);
 let registrySignature:string|undefined;
 /** On a registry rewrite, drop every settled discovery the registry no longer lists unchanged, and every one that lacks a project the registry lists under its workspace. The supervisor rewrites it after each docs_capabilities with that scan's projects as reported, so a workspace's own rescan never drops it, and a lasting disagreement costs one rescan per rewrite, never one per call. */
 async function dropDisowned(){
  if(!options.registryFile)return;
  const current=await signature(options.registryFile);
  if(current===registrySignature)return;
  registrySignature=current;
  const listed=new Map<string,string>();
  try{for(const p of (JSON.parse(await readFile(options.registryFile,'utf8')).projects??[]) as DocsProject[])listed.set(p.docsRoot,projectKey(p));}catch{return;}
  for(const [key,entry] of discoveries){
   if(!entry.settled)continue;
   const {workspace,projects:cached}=entry.settled.discovery;const have=new Set(cached.map(p=>p.docsRoot));
   const under=(docsRoot:string)=>{const path=relative(workspace,docsRoot);return path!==''&&!path.startsWith('..')&&!isAbsolute(path);};
   if(!cached.every(p=>listed.get(p.docsRoot)===projectKey(p))||[...listed.keys()].some(docsRoot=>!have.has(docsRoot)&&under(docsRoot)))discoveries.delete(key);
  }
 }
 async function fresh(entry:CachedDiscovery){
  for(const [file,sig] of entry.signatures)if(await signature(file)!==sig)return false;
  return true;
 }
 /** One scan, then its signatures (see the discovery cache rule). */
 async function scan(workspace:string):Promise<CachedDiscovery>{
  const since=Date.now()-MTIME_MARGIN_MS;
  const discovery=await discoverProjects(workspace);
  for (const project of discovery.projects) project.id = options.projectIds?.get(project.docsRoot) ?? project.id;
  // Every store, watcher and resolver of a docs root honors its project's exclude globs.
  for(const project of discovery.projects)setDocsRootExclude(project.docsRoot,project.exclude);
  for(const project of discovery.projects)projects.set(project.id,project);
  if(options.watchFs) for(const project of discovery.projects) if(!watchers.has(project.docsRoot)) {
   const store=createDocsStore(project.docsRoot,{exclude:project.exclude??[]});
   watchers.set(project.docsRoot,watchDocsRoot(project.docsRoot,event=>store.publishChange(event)));
   treeWatches.set(project.docsRoot,treeIndex.watch(project.docsRoot));
  }
  workspaces.set(discovery.workspace,new Set(discovery.projects.map(p=>p.id)));
  // A root that no workspace lists any more (a project removed or renamed since its last scan) releases its watcher and its tree index.
  if(options.watchFs){
   const live=new Set<string>();
   for(const ids of workspaces.values())for(const id of ids){const root=projects.get(id)?.docsRoot;if(root)live.add(root);}
   for(const [root,watcher] of watchers)if(!live.has(root)){watcher.close();watchers.delete(root);treeWatches.get(root)?.();treeWatches.delete(root);}
  }
  const paths=new Set([...WORKSPACE_MANIFESTS.map(name=>join(discovery.workspace,name)),...discovery.folders.map(folder=>join(folder,'codecaine.docs.json')),...discovery.folders]);
  const signatures=new Map<string,string>();
  for(const path of paths)signatures.set(path,await signature(path,since));
  return {discovery,signatures};
 }
 /** The workspace's discovery: cached under the rule above, scanned on first use, after a change, or when rescan is set (the first docs_capabilities page). */
 async function discover(workspace:string,rescan=false):Promise<Discovery>{
  const key=resolve(workspace);
  await dropDisowned();
  const current=discoveries.get(key);
  // A rescan that arrives while a scan of this workspace runs joins it. Two scans of one workspace would otherwise race to commit its workspace set and its watchers, and the slower one could close a project the faster one found.
  if(rescan&&current&&!current.settled){try{return (await current.pending).discovery;}catch{/* The failed scan was dropped; scan again. */}}
  const cached=rescan?undefined:current;
  if(cached){
   try{
    if(!cached.settled)return (await cached.pending).discovery;
    if(await fresh(cached.settled))return cached.settled.discovery;
   }catch{/* The failed scan was dropped; scan again. */}
   // Another call found the same entry stale first and replaced it: share its rescan.
   const replaced=discoveries.get(key);
   if(replaced&&replaced!==cached)return (await replaced.pending).discovery;
  }
  const entry:Entry={pending:scan(workspace)};
  discoveries.set(key,entry);
  try{entry.settled=await entry.pending;return entry.settled.discovery;}
  catch(error){if(discoveries.get(key)===entry)discoveries.delete(key);throw error;}
 }
 const metadataTools=[
  {name:'docs_capabilities',description:'The capabilities index: the project ids and names of the workspace, discovery warnings, versions, the guidance snapshot, the tool order, and each guidance topic with its size and the writes it unlocks. Call first, and use a returned project ID. A page holds at most 4,096 bytes. Pass next_cursor as cursor for the next page.',inputSchema:schema({workspace:{...string,description:'Absolute active workspace path. Defaults to the connected client workspace.'},cursor:{...string,description:'next_cursor from the previous page.'}})},
  {name:'docs_begin',description:'Begin documentation authoring. Pins the current guidance snapshot and returns task_id, snapshot_id and topics_read. Read docs_guidance topic "style" with task_id before your first edit. Writes are refused until you do. No background agent starts.',inputSchema:schema({thread_id:{...string,description:'Your T3 thread id, when the harness does not pass T3CODE_THREAD_ID. Binds this server run to that thread in the action log.'}})},
  {name:'docs_guidance',description:'Read maintained guidance one topic at a time. Supply task_id to read the task\'s pinned snapshot. Without topic or component it lists topics and sizes. Reading topic "style" with task_id is required once per task before the first edit. Pass component for one component\'s full reference.',inputSchema:schema({task_id:string,topic:{type:'string',enum:[...GUIDANCE_TOPICS,'standards'],description:'Guidance topic. "standards" lists the per-page standards topics. "all" is the full unsplit text.'},component:string})},
 ];
 function listTools(){return [...metadataTools,...tools.map(({name,description,inputSchema})=>{
  const properties=inputSchema.properties as object;
  if(name==='docs_check')return {name,description:`${description} Include task_id to block on style violations this task introduced.`,inputSchema:{...inputSchema,properties:{...properties,task_id:string}}};
  const mutation=!MUTATION_READS.has(name);
  return {name,description:mutation?`${description} Call docs_begin first and include task_id.`:description,inputSchema:mutation?{...inputSchema,properties:{...properties,task_id:string},required:[...(inputSchema.required as string[]??[]),'task_id']}:inputSchema};
 })];}
 /**
  * One page of the capabilities index. Scalar fields repeat on every page. The lists topics, projects and warnings
  * continue across pages in that order, and next_cursor is the offset of the next item, or null on the last page.
  * A page holds at least one item, so paging always ends.
  */
 async function capabilities(discovery:Discovery,cursor:unknown){
  const snapshot=await loadGuidance();const listed=listTools();
  const writes=listed.map(t=>t.name).filter(name=>!MUTATION_READS.has(name)&&!metadataTools.some(t=>t.name===name));
  const items:(readonly ['topics'|'projects'|'warnings',unknown])[]=[
   ...guidanceTopics(snapshot).map(t=>['topics',{id:t.topic,title:t.title,bytes:Buffer.byteLength(t.text),required_for:writes.filter(w=>requiredTopics(w).includes(t.topic))}] as const),
   ...discovery.projects.map(p=>['projects',{id:p.id,name:p.name}] as const),
   ...discovery.warnings.map(w=>['warnings',w] as const),
  ];
  const offset=cursor===undefined?0:typeof cursor==='string'&&/^\d+$/.test(cursor)?Number(cursor):-1;
  if(offset<0||offset>=items.length)throw new Error('Unknown cursor. Call docs_capabilities without a cursor for the first page.');
  const page=(end:number,next_cursor:string|null)=>{
   const pick=(list:string)=>items.slice(offset,end).filter(([name])=>name===list).map(([,value])=>value);
   return {ok:true,protocol_version:'1',server_version:manifest.version,tool_contract_hash:`sha256:${createHash('sha256').update(JSON.stringify(listed)).digest('hex')}`,guidance_snapshot:snapshot.snapshotId,scope:{workspace:discovery.workspace},guidance_tool:CAPABILITIES.guidance_tool,entry_tool:CAPABILITIES.entry_tool,completion_tools:CAPABILITIES.completion_tools,operations:CAPABILITIES.operations,topics:pick('topics'),discovery_tools:CAPABILITIES.discovery_tools,projects:pick('projects'),warnings:pick('warnings'),next_cursor};
  };
  // Measure with the widest cursor, so the page still fits once next_cursor is set.
  const fits=(end:number)=>Buffer.byteLength(JSON.stringify(page(end,String(items.length))))+CALL_ID_BYTES<=CAPABILITIES_PAGE_BYTES;
  let end=offset+1;while(end<items.length&&fits(end+1))end++;
  return page(end,end<items.length?String(end):null);
 }
 /** One tool call inside its own timing context, then one call-timings line for it. */
 async function call(workspace:string,name:string,args:Record<string,unknown>={}):Promise<DocsToolResult>{
  const started=performance.now();
  return runWithCallTiming(randomUUID(),async timing=>{
   let result:DocsToolResult|undefined;
   try{result=await dispatch(workspace,name,args);return named(result,timing.callId);}
   finally{await recordCallTiming({ts:new Date().toISOString(),tool:name,call_id:timing.callId,total_ms:round(performance.now()-started),store_lock_wait_ms:round(timing.storeLockWaitMs),jev_span_ms:round(timing.jevSpanMs),ok:result!==undefined&&result.isError!==true});}
  });
 }
 async function dispatch(workspace:string,name:string,args:Record<string,unknown>={}):Promise<DocsToolResult>{
  // The task this call resolved, pinned against expiry until the call returns.
  let pinned:Task|undefined;
  const pin=(task:Task|undefined)=>{if(task){task.inFlight++;pinned=task;}return task;};
  try{
   sweep();
   // Layout lints measure text with the exact HarfBuzz backend; hosts start it at launch, and this waits for it.
   await textMeasureReady();
   // The first docs_capabilities page rescans. A later page keeps the scan of its first page, so one page set stays consistent.
   const discovery=await discover(name==='docs_capabilities' && typeof args.workspace==='string'?args.workspace:workspace,name==='docs_capabilities'&&args.cursor===undefined);
   if(name==='docs_capabilities')return reply(await capabilities(discovery,args.cursor));
   if(name==='docs_begin'){
    if(!options.managed && await startupFingerprint!==await implementationFingerprint())throw new Error('Implementation changed. Stop and restart the Docs service before beginning a new task.');
    if(tasks.size>=maxTasks){
     const t0=now();const idlest=Math.max(...[...tasks.values()].map(t=>t.inFlight>0?0:t0-t.lastUsedAt));
     throw new Error(`Too many open authoring activities (${tasks.size}). The longest-idle one has been idle ${idlest<MINUTE?'under a minute':span(Math.floor(idlest/MINUTE)*MINUTE)}; tasks expire after ${span(idleMs)} without a docs call.`);
    }
    const snapshot=internSnapshot(await loadGuidance());const id=randomUUID();const t0=now();tasks.set(id,{workspace:discovery.workspace,snapshot,createdAt:t0,lastUsedAt:t0,inFlight:0,topicsRead:new Set(),baselines:new Map(),canvasBaselines:new Map()});
    return reply({ok:true,task_id:id,snapshot_id:snapshot.snapshotId,topics_read:[]});
   }
   if(name==='docs_guidance'){
    const task=pin(liveTask(args.task_id,discovery.workspace));
    if(args.task_id && !task)throw new Error('Unknown task for this workspace.');
    if(args.topic!==undefined&&args.component!==undefined)throw new Error('Pass topic or component, not both.');
    const snapshot=task?.snapshot??await loadGuidance();
    if(typeof args.component==='string'){
     const component=snapshot.components.find((c:any)=>c.name===args.component||c.ownedTypes?.includes(args.component));
     if(!component)throw new Error(`Unknown component ${args.component}`);
     return reply({ok:true,snapshot_id:snapshot.snapshotId,component,reference:servedText(snapshot.componentReferences[component.name]!)});
    }
    const topics=guidanceTopics(snapshot);
    if(args.topic===undefined)return reply({ok:true,snapshot_id:snapshot.snapshotId,topics:topicIndex(topics),next:STYLE_NEXT});
    if(args.topic==='standards')return reply({ok:true,snapshot_id:snapshot.snapshotId,topic:'standards',topics:topicIndex(topics.filter(t=>t.topic.startsWith('standards-'))),next:'The standards are split by page. Read the topics you need.'});
    const topic=topics.find(t=>t.topic===args.topic);if(!topic)throw new Error(`Unknown topic ${String(args.topic)}. Call docs_guidance without a topic for the index.`);
    task?.topicsRead.add(topic.topic);
    return reply({ok:true,snapshot_id:snapshot.snapshotId,topic:topic.topic,covers:topic.covers,chars:topic.text.length,guidance:topic.text,...(topic.topic==='all'?{components:snapshot.components,sources:snapshot.sources.map(({path,sha256})=>({path,sha256}))}:{})});
   }
   const tool=tools.find(t=>t.name===name);if(!tool)throw new Error(`Unknown tool ${name}`);
   if(typeof args.project!=='string'||!workspaces.get(discovery.workspace)?.has(args.project))throw new Error('Project is not in this workspace. Call docs_capabilities and use a returned project ID.');
   const {task_id,...toolArgs}=args;
   const taskId=typeof task_id==='string'?task_id:'';
   if(!MUTATION_READS.has(name)){
    const task=pin(liveTask(task_id,discovery.workspace));
    if(!task)throw new Error(task_id===undefined?'Call docs_begin in this workspace before editing, then include task_id.':'Unknown or ended task_id for this workspace. Call docs_begin in this workspace before editing and use its task_id.');
    if(!options.managed && await startupFingerprint!==await implementationFingerprint())throw new Error('Implementation changed during this task. Restart the Docs service and begin a new task before further edits.');
    // Only style gates writes today, so its refusal names the one recovery call.
    if(requiredTopics(name).some(topic=>!hasRead(task,topic)))throw new Error(STYLE_GATE);
    return await tool.execute(toolArgs,{taskId});
   }
   // docs_check with task_id blocks on style violations this task introduced. Other reads ignore task_id: they never look it up, fail on it, or refresh it.
   if(name==='docs_check'&&task_id!==undefined){
    if(!pin(liveTask(task_id,discovery.workspace)))throw new Error('Unknown task for this workspace.');
    return await tool.execute(toolArgs,{taskId});
   }
   return await tool.execute(toolArgs);
  }catch(error){return reply({ok:false,detail:error instanceof Error?error.message:String(error)},true);}
  finally{if(pinned){pinned.inFlight--;pinned.lastUsedAt=now();}}
 }
 /** Live tasks after a sweep, and ms since the most recent call naming one (0 while one is in a call; null with no tasks). */
 function stats(){
  sweep();const t0=now();
  const newestTaskUseMs=tasks.size?Math.min(...[...tasks.values()].map(t=>t.inFlight>0?0:t0-t.lastUsedAt)):null;
  return {projects:projects.size,workspaces:workspaces.size,discoveries:discoveries.size,tasks:tasks.size,newestTaskUseMs,textMeasure:textMeasureBackend(),drafts:[...projects.values()].reduce((count,p)=>count+createDocsStore(p.docsRoot).locks.activeCount(),0)};
 }
 async function uiRequest(projectId:string,request:Request){
  const project=projects.get(projectId);if(!project)return Response.json({error:'Unknown project. Discover it first.'},{status:404});
  let app=routes.get(projectId);if(!app){app=createDocsRoutes(createDocsStore(project.docsRoot,{exclude:project.exclude??[]}),{globalThemesRoot:options.globalThemesRoot,codeThemesRoot:options.codeThemesRoot});app.compile();routes.set(projectId,app);}
  const url=new URL(request.url);url.pathname=url.pathname.replace(`/projects/${projectId}`,'');
  return app.handle(new Request(url,request));
 }
 return {discover,listTools,call,uiRequest,globalThemesRoot:options.globalThemesRoot,project:(id:string)=>projects.get(id),stats,close:()=>{clearInterval(sweeper);for(const watcher of watchers.values())watcher.close();watchers.clear();for(const unwatch of treeWatches.values())unwatch();treeWatches.clear();}};
}
