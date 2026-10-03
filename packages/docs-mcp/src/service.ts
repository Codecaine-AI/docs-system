import { createHash, randomUUID } from 'node:crypto';
import type { DocDocument } from '@codecaine-ai/docs-model';
import { createDocsStore } from '@codecaine-ai/docs-server/store';
import { createDocsRoutes } from '@codecaine-ai/docs-server/routes';
import { discoverProjects, type DocsProject } from './discovery';
import { createDocsTools, type DocsToolResult } from './tools';
import { GUIDANCE_TOPICS, guidanceTopics, loadGuidance, type GuidanceTopic } from './guidance';
import { STYLE_DIGEST } from './style-digest';
import { implementationFingerprint } from './lifecycle';
import { textMeasureBackend, textMeasureReady, watchDocsRoot } from '@codecaine-ai/docs-server';
import { defaultJudgmentEngine } from './jev-engine';
import type { JudgmentEngine } from './lint-feedback';

const reply = (data: Record<string,unknown>, error=false):DocsToolResult => ({content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data,...(error?{isError:true}:{})});
const schema=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
const string={type:'string',minLength:1};
const MUTATION_READS = new Set(['docs_tree','docs_read','docs_check','docs_annotations','docs_component_read','docs_search','docs_backlinks','docs_asset_read','docs_assets','docs_proposals','docs_changesets','docs_changeset_read']);
/** Tree, annotation, review-decision, asset, undo, restore, and lint-fix writes skip the style gate. Every other write is content. */
const STYLE_GATE_EXEMPT=new Set(['docs_create','docs_move','docs_rename','docs_delete','docs_set_title','docs_annotation_add','docs_annotation_reply','docs_annotation_resolve','docs_proposal_accept','docs_proposal_reject','docs_changeset_stage','docs_changeset_accept','docs_changeset_reject','docs_asset_upload','docs_asset_move','docs_asset_delete','docs_undo','docs_management_restore','docs_fix_lints']);
const STYLE_GATE='Read the style guide before your first edit: call docs_guidance with task_id and topic "style". Required once per task.';
const STYLE_NEXT='Read docs_guidance with task_id and topic "style" before your first edit. Writes are refused until you do.';
const topicIndex=(topics:GuidanceTopic[])=>topics.map(({topic,covers,text})=>({topic,covers,chars:text.length}));
/** First sentence of a manifest's whenToUse. docs_guidance topic "components" carries the rest. */
const oneLine=(text:string)=>/^[\s\S]*?[.!?](?=\s|$)/.exec(text)?.[0]??text;
/** globalThemesRoot: the shared global theme folder every project's theme API serves (reserved id `global`). codeThemesRoot: the central code-theme folder (`/api/code-themes`). */
/** judgmentEngine: Jev by default. It reads CODECAINE_DOCS_JUDGMENT on every call, so =off disables it without a restart. Pass null for none. */
export function createInteractionService(options: { managed?: boolean; projectIds?: Map<string, string>; watchFs?: boolean; globalThemesRoot?: string; codeThemesRoot?: string; judgmentEngine?: JudgmentEngine | null } = {}) {
 const startupFingerprint=options.managed && process.env.CODECAINE_DOCS_BUILD ? Promise.resolve(process.env.CODECAINE_DOCS_BUILD) : implementationFingerprint();
 const projects=new Map<string,DocsProject>();
 const workspaces=new Map<string,Set<string>>();
 const routes=new Map<string,ReturnType<typeof createDocsRoutes>>();
 const tasks=new Map<string,{workspace:string,snapshot:Awaited<ReturnType<typeof loadGuidance>>,createdAt:string,styleRead:boolean,baselines:Map<string,DocDocument|null>}>();
 const watchers=new Map<string,ReturnType<typeof watchDocsRoot>>();
 const tools=createDocsTools({resolveProject:async(id)=>{
  const project=projects.get(id);if(!project)throw new Error('Unknown project. Call docs_discover for the active workspace first.');return project;
 },
 // First-touch documents per task, freed with the task by docs_end. undefined: not captured yet. null: the doc did not exist at first touch.
 taskBaselines:{get:(taskId:string,key:string)=>tasks.get(taskId)?.baselines.get(key),set:(taskId:string,key:string,doc:DocDocument|null)=>{tasks.get(taskId)?.baselines.set(key,doc);}},
 judgmentEngine:options.judgmentEngine===null?undefined:options.judgmentEngine??defaultJudgmentEngine()});
 async function discover(workspace:string){
  const discovery=await discoverProjects(workspace);
  for (const project of discovery.projects) project.id = options.projectIds?.get(project.docsRoot) ?? project.id;
  for(const project of discovery.projects)projects.set(project.id,project);
  if(options.watchFs) for(const project of discovery.projects) if(!watchers.has(project.docsRoot)) {
   const store=createDocsStore(project.docsRoot);
   watchers.set(project.docsRoot,watchDocsRoot(project.docsRoot,event=>store.publishChange(event)));
  }
  workspaces.set(discovery.workspace,new Set(discovery.projects.map(p=>p.id)));
  return discovery;
 }
 const metadataTools=[
  {name:'docs_discover',description:'Discover normalized documentation in the active workspace and declared member projects. Call first; use returned explicit project IDs. No machine-wide scan.',inputSchema:schema({workspace:{...string,description:'Absolute active workspace path. Defaults to the connected client workspace.'}})},
  {name:'docs_begin',description:'Begin documentation authoring. Pins the current guidance snapshot and returns task_id, the style digest, a guidance topic index, and one-line component purposes. Read docs_guidance topic "style" with task_id before your first edit. Writes are refused until you do. No background agent starts.',inputSchema:schema({})},
  {name:'docs_guidance',description:'Read maintained guidance one topic at a time. Supply task_id to read the task\'s pinned snapshot. Without topic or component it lists topics and sizes. Reading topic "style" with task_id is required once per task before the first edit. Pass component for one component\'s full reference.',inputSchema:schema({task_id:string,topic:{type:'string',enum:[...GUIDANCE_TOPICS,'standards'],description:'Guidance topic. "standards" lists the per-page standards topics. "all" is the full unsplit text.'},component:string})},
  {name:'docs_end',description:'Finish an authoring activity after docs_check with task_id on each changed page. Releases its pinned guidance snapshot and edit baselines. It does not undo valid edits.',inputSchema:schema({task_id:string},['task_id'])},
 ];
 function listTools(){return [...metadataTools,...tools.map(({name,description,inputSchema})=>{
  const properties=inputSchema.properties as object;
  if(name==='docs_check')return {name,description:`${description} Include task_id to block on style violations this task introduced.`,inputSchema:{...inputSchema,properties:{...properties,task_id:string}}};
  const mutation=!MUTATION_READS.has(name);
  return {name,description:mutation?`${description} Call docs_begin first and include task_id.`:description,inputSchema:mutation?{...inputSchema,properties:{...properties,task_id:string},required:[...(inputSchema.required as string[]??[]),'task_id']}:inputSchema};
 })];}
 async function call(workspace:string,name:string,args:Record<string,unknown>={}):Promise<DocsToolResult>{
  try{
   // Layout lints measure text with the exact HarfBuzz backend; hosts start it at launch, and this waits for it.
   await textMeasureReady();
   const discovery=await discover(name==='docs_discover' && typeof args.workspace==='string'?args.workspace:workspace);
   if(name==='docs_discover')return reply({ok:true,...discovery,authoring:'Call docs_begin before editing. It returns the style digest and a guidance topic index. Read docs_guidance topic "style" with task_id before your first edit.'});
   if(name==='docs_begin'){
    if(!options.managed && await startupFingerprint!==await implementationFingerprint())throw new Error('Implementation changed. Stop and restart the Docs service before beginning a new task.');
    if(tasks.size>=1000)throw new Error('Too many open authoring activities. End existing tasks or restart the service.');
    const snapshot=await loadGuidance();const id=randomUUID();tasks.set(id,{workspace:discovery.workspace,snapshot,createdAt:new Date().toISOString(),styleRead:false,baselines:new Map()});
    // Clients may show only the first 2 KB of a large result, so the digest leads and full guidance stays behind docs_guidance topics.
    return reply({ok:true,task_id:id,style_digest:STYLE_DIGEST,next:STYLE_NEXT,topics:topicIndex(guidanceTopics(snapshot)),components:snapshot.components.map(({name,whenToUse})=>({name,when_to_use:oneLine(whenToUse)})),snapshot_id:snapshot.snapshotId,implementation_hash:await startupFingerprint,tool_contract_hash:createHash('sha256').update(JSON.stringify(listTools())).digest('hex'),projects:discovery.projects});
   }
   if(name==='docs_guidance'){
    const task=typeof args.task_id==='string'?tasks.get(args.task_id):undefined;
    if(args.task_id && (!task||task.workspace!==discovery.workspace))throw new Error('Unknown task for this workspace.');
    if(args.topic!==undefined&&args.component!==undefined)throw new Error('Pass topic or component, not both.');
    const snapshot=task?.snapshot??await loadGuidance();
    if(typeof args.component==='string'){
     const component=snapshot.components.find((c:any)=>c.name===args.component||c.ownedTypes?.includes(args.component));
     if(!component)throw new Error(`Unknown component ${args.component}`);
     return reply({ok:true,snapshot_id:snapshot.snapshotId,component,reference:snapshot.componentReferences[component.name]});
    }
    const topics=guidanceTopics(snapshot);
    if(args.topic===undefined)return reply({ok:true,snapshot_id:snapshot.snapshotId,topics:topicIndex(topics),next:STYLE_NEXT});
    if(args.topic==='standards')return reply({ok:true,snapshot_id:snapshot.snapshotId,topic:'standards',topics:topicIndex(topics.filter(t=>t.topic.startsWith('standards-'))),next:'The standards are split by page. Read the topics you need.'});
    const topic=topics.find(t=>t.topic===args.topic);if(!topic)throw new Error(`Unknown topic ${String(args.topic)}. Call docs_guidance without a topic for the index.`);
    if(task&&(topic.topic==='style'||topic.topic==='all'))task.styleRead=true;
    return reply({ok:true,snapshot_id:snapshot.snapshotId,topic:topic.topic,covers:topic.covers,chars:topic.text.length,guidance:topic.text,...(topic.topic==='all'?{components:snapshot.components,sources:snapshot.sources.map(({path,sha256})=>({path,sha256}))}:{})});
   }
   if(name==='docs_end'){
    const task=tasks.get(String(args.task_id));if(!task||task.workspace!==discovery.workspace)throw new Error('Unknown task for this workspace.');
    tasks.delete(String(args.task_id));return reply({ok:true,ended:true,snapshot_id:task.snapshot.snapshotId});
   }
   const tool=tools.find(t=>t.name===name);if(!tool)throw new Error(`Unknown tool ${name}`);
   if(typeof args.project!=='string'||!workspaces.get(discovery.workspace)?.has(args.project))throw new Error('Project is not in this workspace. Call docs_discover and use a returned project ID.');
   const {task_id,...toolArgs}=args;
   const taskId=typeof task_id==='string'?task_id:'';const task=tasks.get(taskId);
   if(!MUTATION_READS.has(name)){
    if(!task||task.workspace!==discovery.workspace)throw new Error(task_id===undefined?'Call docs_begin in this workspace before editing, then include task_id.':'Unknown or ended task_id for this workspace. Call docs_begin in this workspace before editing and use its task_id.');
    if(!options.managed && await startupFingerprint!==await implementationFingerprint())throw new Error('Implementation changed during this task. Restart the Docs service and begin a new task before further edits.');
    if(!task.styleRead&&!STYLE_GATE_EXEMPT.has(name))throw new Error(STYLE_GATE);
    return await tool.execute(toolArgs,{taskId});
   }
   // docs_check with task_id blocks on style violations this task introduced. Other reads ignore task_id.
   if(name==='docs_check'&&task_id!==undefined){
    if(!task||task.workspace!==discovery.workspace)throw new Error('Unknown task for this workspace.');
    return await tool.execute(toolArgs,{taskId});
   }
   return await tool.execute(toolArgs);
  }catch(error){return reply({ok:false,detail:error instanceof Error?error.message:String(error)},true);}
 }
 async function uiRequest(projectId:string,request:Request){
  const project=projects.get(projectId);if(!project)return Response.json({error:'Unknown project. Discover it first.'},{status:404});
  let app=routes.get(projectId);if(!app){app=createDocsRoutes(createDocsStore(project.docsRoot),{globalThemesRoot:options.globalThemesRoot,codeThemesRoot:options.codeThemesRoot});app.compile();routes.set(projectId,app);}
  const url=new URL(request.url);url.pathname=url.pathname.replace(`/projects/${projectId}`,'');
  return app.handle(new Request(url,request));
 }
 return {discover,listTools,call,uiRequest,globalThemesRoot:options.globalThemesRoot,project:(id:string)=>projects.get(id),stats:()=>({projects:projects.size,workspaces:workspaces.size,tasks:tasks.size,textMeasure:textMeasureBackend(),drafts:[...projects.values()].reduce((count,p)=>count+createDocsStore(p.docsRoot).locks.activeCount(),0)}),close:()=>{for(const watcher of watchers.values())watcher.close();watchers.clear();}};
}
