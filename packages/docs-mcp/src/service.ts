import { createHash, randomUUID } from 'node:crypto';
import { createDocsStore } from '@codecaine-ai/docs-server/store';
import { createDocsRoutes } from '@codecaine-ai/docs-server/routes';
import { discoverProjects, type DocsProject } from './discovery';
import { createDocsTools, type DocsToolResult } from './tools';
import { loadGuidance } from './guidance';
import { implementationFingerprint } from './lifecycle';
import { watchDocsRoot } from '@codecaine-ai/docs-server';

const reply = (data: Record<string,unknown>, error=false):DocsToolResult => ({content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data,...(error?{isError:true}:{})});
const schema=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
const string={type:'string',minLength:1};
const MUTATION_READS = new Set(['docs_tree','docs_read','docs_check','docs_annotations','docs_component_read','docs_search','docs_backlinks','docs_asset_read','docs_assets','docs_proposals','docs_changesets','docs_changeset_read']);
export function createInteractionService(options: { managed?: boolean; projectIds?: Map<string, string>; watchFs?: boolean } = {}) {
 const startupFingerprint=options.managed && process.env.CODECAINE_DOCS_BUILD ? Promise.resolve(process.env.CODECAINE_DOCS_BUILD) : implementationFingerprint();
 const projects=new Map<string,DocsProject>();
 const workspaces=new Map<string,Set<string>>();
 const routes=new Map<string,ReturnType<typeof createDocsRoutes>>();
 const tasks=new Map<string,{workspace:string,snapshot:Awaited<ReturnType<typeof loadGuidance>>,createdAt:string}>();
 const watchers=new Map<string,ReturnType<typeof watchDocsRoot>>();
 const tools=createDocsTools({resolveProject:async(id)=>{
  const project=projects.get(id);if(!project)throw new Error('Unknown project. Call docs_discover for the active workspace first.');return project;
 }});
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
  {name:'docs_begin',description:'Begin documentation authoring. Loads the shared writing standards and complete component-selection catalog automatically. Returns task_id for edits; keep this snapshot for the task. No background agent starts.',inputSchema:schema({})},
  {name:'docs_guidance',description:'Read maintained writing standards and component guidance. Supply a task_id to read its pinned snapshot or component to focus the result.',inputSchema:schema({task_id:string,component:string})},
  {name:'docs_end',description:'Finish an authoring activity after docs_check on each changed page. Releases its pinned guidance snapshot; it does not undo valid edits.',inputSchema:schema({task_id:string},['task_id'])},
 ];
 function listTools(){return [...metadataTools,...tools.map(({name,description,inputSchema})=>{
  const mutation=!MUTATION_READS.has(name);
  return {name,description:mutation?`${description} Call docs_begin first and include task_id.`:description,inputSchema:mutation?{...inputSchema,properties:{...(inputSchema.properties as object),task_id:string},required:[...(inputSchema.required as string[]??[]),'task_id']}:inputSchema};
 })];}
 async function call(workspace:string,name:string,args:Record<string,unknown>={}):Promise<DocsToolResult>{
  try{
   const discovery=await discover(name==='docs_discover' && typeof args.workspace==='string'?args.workspace:workspace);
   if(name==='docs_discover')return reply({ok:true,...discovery,authoring:'Call docs_begin before editing. It loads standards and all component purposes.'});
   if(name==='docs_begin'){
    if(!options.managed && await startupFingerprint!==await implementationFingerprint())throw new Error('Implementation changed. Stop and restart the Docs service before beginning a new task.');
    if(tasks.size>=1000)throw new Error('Too many open authoring activities. End existing tasks or restart the service.');
    const snapshot=await loadGuidance();const id=randomUUID();tasks.set(id,{workspace:discovery.workspace,snapshot,createdAt:new Date().toISOString()});
    return reply({ok:true,task_id:id,snapshot_id:snapshot.snapshotId,implementation_hash:await startupFingerprint,tool_contract_hash:createHash('sha256').update(JSON.stringify(listTools())).digest('hex'),projects:discovery.projects,guidance:snapshot.text,components:snapshot.components});
   }
   if(name==='docs_guidance'){
    const task=typeof args.task_id==='string'?tasks.get(args.task_id):undefined;
    if(args.task_id && (!task||task.workspace!==discovery.workspace))throw new Error('Unknown task for this workspace.');
    const snapshot=task?.snapshot??await loadGuidance();
    if(typeof args.component==='string'){
     const component=snapshot.components.find((c:any)=>c.name===args.component||c.ownedTypes?.includes(args.component));
     if(!component)throw new Error(`Unknown component ${args.component}`);
     return reply({ok:true,snapshot_id:snapshot.snapshotId,component,reference:snapshot.componentReferences[component.name]});
    }
    return reply({ok:true,snapshot_id:snapshot.snapshotId,guidance:snapshot.text,components:snapshot.components,sources:snapshot.sources.map(({path,sha256})=>({path,sha256}))});
   }
   if(name==='docs_end'){
    const task=tasks.get(String(args.task_id));if(!task||task.workspace!==discovery.workspace)throw new Error('Unknown task for this workspace.');
    tasks.delete(String(args.task_id));return reply({ok:true,ended:true,snapshot_id:task.snapshot.snapshotId});
   }
   const tool=tools.find(t=>t.name===name);if(!tool)throw new Error(`Unknown tool ${name}`);
   if(typeof args.project!=='string'||!workspaces.get(discovery.workspace)?.has(args.project))throw new Error('Project is not in this workspace. Call docs_discover and use a returned project ID.');
   const {task_id,...toolArgs}=args;
   if(!MUTATION_READS.has(name)){
    const task=typeof task_id==='string'?tasks.get(task_id):undefined;
    if(!task||task.workspace!==discovery.workspace)throw new Error('Call docs_begin in this workspace before editing, then include task_id.');
    if(!options.managed && await startupFingerprint!==await implementationFingerprint())throw new Error('Implementation changed during this task. Restart the Docs service and begin a new task before further edits.');
   }
   return await tool.execute(toolArgs);
  }catch(error){return reply({ok:false,detail:error instanceof Error?error.message:String(error)},true);}
 }
 async function uiRequest(projectId:string,request:Request){
  const project=projects.get(projectId);if(!project)return Response.json({error:'Unknown project. Discover it first.'},{status:404});
  let app=routes.get(projectId);if(!app){app=createDocsRoutes(createDocsStore(project.docsRoot));app.compile();routes.set(projectId,app);}
  const url=new URL(request.url);url.pathname=url.pathname.replace(`/projects/${projectId}`,'');
  return app.handle(new Request(url,request));
 }
 return {discover,listTools,call,uiRequest,project:(id:string)=>projects.get(id),stats:()=>({projects:projects.size,workspaces:workspaces.size,tasks:tasks.size,drafts:[...projects.values()].reduce((count,p)=>count+createDocsStore(p.docsRoot).locks.activeCount(),0)}),close:()=>{for(const watcher of watchers.values())watcher.close();watchers.clear();}};
}
