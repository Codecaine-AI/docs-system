/** Uses the connected Docs authority; never writes native storage directly. */
import {ensureDaemon,daemonFetch} from '../packages/docs-mcp/src/lifecycle';
const daemon=await ensureDaemon();
const audit:any[]=await Bun.file('/tmp/interaction-docs-audit.json').json();
const results:any[]=[];
const rpc=async(workspace:string,name:string,args:any={})=>{const r:any=await(await daemonFetch(daemon,'/rpc',{workspace,name,arguments:args})).json();if((r.isError||r.structuredContent?.ok===false)&&name!=='docs_check')throw Error(name+': '+JSON.stringify(r.structuredContent??r));return r.structuredContent;};
for(const workspace of [...new Set(audit.map(d=>d.workspace))]){
 await rpc(workspace,'docs_discover');let task=await rpc(workspace,'docs_begin');
 for(const old of audit.filter(d=>d.workspace===workspace)){
  const {project,path}=old;const current=await rpc(workspace,'docs_read',{project,path});const doc=current.doc,ops:any[]=[];
  if(doc.blocks["approved-design-record"]) continue;
  const update=(id:string,text:string)=>ops.push({type:'updateBlock',blockId:id,text:[{insert:text}]});
  const insert=(id:string,type:string,props:any,text?:string)=>ops.push({type:'insertBlock',blockId:id,parentId:doc.root,index:doc.blocks[doc.root].children.length-ops.filter(o=>o.type==='deleteBlock'&&doc.blocks[doc.root].children.includes(o.blockId)).length+ops.filter(o=>o.type==='insertBlock').length,blockType:type,props,...(text?{text:[{insert:text}]}:{})});
  const shapeBlocks:any[]=Object.values(doc.blocks).filter((b:any)=>b.type==='state-shape');
  for(const b of Object.values(doc.blocks) as any[]){if(b.type!=='interaction-surface')continue;
   const operations=structuredClone(b.props.operations);
   for(const op of operations){op.kind??='action';
    const match=op.returns?.match(/^props patch: \{ (.+) \}$/);
    if(match){const keys=match[1].split(', ');const state=shapeBlocks.find(b=>keys.every((k:string)=>b.props.fields.some((f:any)=>f.name===k)));
     if(state){op.returnShape={fields:structuredClone(state.props.fields.filter((f:any)=>keys.includes(f.name)))};op.returns=state.props.name.replace(/State$/,'')+'Patch';}
    }
    if(b.id==='worked-operation-signature'&&op.name==='state-shape.addField'){const out=doc.blocks['worked-operation-return'].props;op.returnShape={fields:out.fields,example:out.example};}
    if(path.endsWith('/60-interaction-surface')&&b.id==='b-22-interaction-surface-example-block'){
     const out=doc.blocks['worked-operation-return'].props;op.returns='FileTreeEntriesPatch';op.returnShape={fields:out.fields,example:op.name.endsWith('addEntry')?out.example:JSON.stringify({entries:[]},null,2)};
     op.description=op.name.endsWith('addEntry')?'Duplicate paths are rejected. Returns the props patch, not the action success envelope.':'Removes only the exact matching path. Returns the props patch.';
    }
    if(op.name==='interaction-surface.addOperation'&&path.endsWith('/60-interaction-surface')){op.params.push({name:'returnShape',type:'ReturnShape',required:false,fields:[{name:'fields',type:'Field[]'},{name:'example',type:'string',required:false}]});op.description='Rejects duplicate operation names.';}
    if(op.name==='interaction-surface.updateOperation')op.description='Renames in place; null clears description, params, returns, returnShape, or kind.';
   }
   if(JSON.stringify(operations)!==JSON.stringify(b.props.operations))ops.push({type:'updateBlock',blockId:b.id,props:{operations}});
  }
  if(path.endsWith('/60-interaction-surface')){
   update('b-22-interaction-surface-example-intro','This example starts with one file-tree entry. Adding src/config.ts returns the complete entries props patch inside its operation card. Removing src/index.ts from the same starting state returns an empty entries list. Each example starts independently from FileTreeState.');
   ops.push({type:'deleteBlock',blockId:'worked-operation-return',mode:'subtree'});
   const state=structuredClone(doc.blocks['b-22-interaction-surface-shape-4'].props);const fields=state.fields.find((f:any)=>f.name==='operations').fields;
   fields.find((f:any)=>f.name==='kind').description='Omitted means action. All three kinds have an explicit badge.';
   fields.find((f:any)=>f.name==='description').description='Only constraints or behavior not already clear from the signature.';
   fields.push({name:'returnShape',type:'ReturnShape',required:false,description:'Known object result; omit for void, primitive values, or an unsubscribe function.',fields:[{name:'fields',type:'Field[]',description:'Uses the same recursive field nodes as State Shape.'},{name:'example',type:'string',required:false,description:'JSON instance of the returned object.'}]});
   ops.push({type:'updateBlock',blockId:'b-22-interaction-surface-shape-4',props:state});
   const texts:Record<string,string>={
    'b-22-is-fam-docr-cards-li':'Each operation has a separate rounded card. The overall title uses title case above the stack. Card order follows authored operation order.',
    'b-22-is-fam-docr-header-li':'Each card header shows the operation name and an explicit Action, Query, or Event badge. Action is amber, Query is green-teal, and Event is violet. A restrained curved texture stays in the header.',
    'b-22-is-fam-docr-sig-li':'Inputs use Field and Type columns on the left and the linked signature on the right. Aligned mini headers and a thin divider preserve the State Shape reading pattern.',
    'b-22-is-fam-docr-notes-li':'Descriptions appear only when they add information. Nested fields retain their tree branches. A separate output section shows the actual returned object name, recursive fields on the left, and JSON example on the right. Its header has a softer matching tint and a return cue.',
    'b-22-is-fam-agentr-detail-li':'Described or nested parameters add indented field lines beneath the signature. A returnShape adds a named Returns section, recursive fields, and the supplied example. Full operation names remain searchable.',
    'b-22-is-fam-theme-linking-p':'Content uses the approved State Shape palette, typography, chips, mini headers, and separators. Only operation and return headers vary by kind. Linking still uses the shared linked-panels behavior.',
   };
   for(const [id,text] of Object.entries(texts)){update(id,text);for(const child of doc.blocks[id].children)ops.push({type:'deleteBlock',blockId:child,mode:'subtree'});}
   update('b-22-is-fam-agentr-names-li','Operation names remain fully dotted in the agent projection. Human-readable card headings do not change stored operation identities.');
   const table=doc.blocks['b-22-interaction-surface-theming-table'];ops.push({type:'updateBlock',blockId:table.id,props:{columns:['Key','CSS variable','Use'],rows:[...['action','query','event'].flatMap(kind=>[[''+kind+'HeaderBg','--docs-operation-'+kind+'-header-bg','Card header background; light and dark values'],[kind+'HeaderInk','--docs-operation-'+kind+'-header-ink','Curved texture and return cue']]),['State Shape tokens','--docs-shape-*','Shared content colors, hierarchy, and separators'],['Legacy interaction tokens','--docs-interaction-*','Retained for compatibility; shared content follows State Shape']]}});
   insert('operation-kinds','heading',{level:2},'Operation Kinds');
   insert('operation-kinds-rule','paragraph',{},'Action changes state or requests work. Query reads state without changing it. Event describes notifications or observation. These are presentation categories, not new execution mechanisms. A subscription can return an unsubscribe function; that return value is different from the event payload delivered to its callback.');
   insert('query-example-context','paragraph',{},'The query example uses the real DocsStore.docGet operation from packages/docs-server/src/store.ts and agent-tools.ts. Its success result includes the document, revision hash, Markdown projection, and bundle path. Failure returns ok: false, status, and detail. The example below is a successful read of a minimal document.');
   const exampleDoc={schemaVersion:1,id:'example',title:'Example',root:'root',blocks:{root:{id:'root',type:'paragraph',props:{},text:[{insert:'Example state.'}],children:[]}}};
   insert('query-example-state','state-shape',{name:'DocDocument',fields:[{name:'schemaVersion',type:'1'},{name:'id',type:'string'},{name:'title',type:'string'},{name:'root',type:'string',description:'ID of the root block.'},{name:'blocks',type:'Record<string, DocBlock>'}],example:JSON.stringify(exampleDoc,null,2)});
   const queryExample=await Bun.file('/tmp/doc-get-worked-example.json').json();
   insert('query-event-examples','interaction-surface',{title:'Document Observation',operations:[{name:'DocsStore.docGet',kind:'query',params:[{name:'path',type:'string',description:'Bundle path relative to this store\'s docs root.'}],returns:'DocGetResult',returnShape:{fields:[{name:'ok',type:'true'},{name:'doc',type:'DocDocument'},{name:'hash',type:'string',description:'Use as the expected revision for a subsequent edit.'},{name:'markdown',type:'string'},{name:'bundlePath',type:'string'}],example:JSON.stringify(queryExample,null,2)}},{name:'DocsStore.subscribeChanges',kind:'event',description:'Receives notifications in this process. Call the returned function to unsubscribe.',params:[{name:'listener',type:'(event: DocsChangeEvent) => void',fields:[{name:'event',type:'DocsChangeEvent',fields:[{name:'path',type:'string'},{name:'changedIds',type:'string[]'},{name:'patchId',type:'string'},{name:'actor',type:'string'}]}]}],returns:'() => void'}]});
   insert('event-example-payload','state-shape',{name:'DocsChangeEvent',fields:[{name:'path',type:'string'},{name:'changedIds',type:'string[]'},{name:'patchId',type:'string'},{name:'actor',type:'string'}],example:JSON.stringify({path:'example',changedIds:['root'],patchId:'example-edit',actor:'external-agent'},null,2)});
   insert('event-example-note','paragraph',{},'DocsChangeEvent is the callback payload, not the subscription return object. The example uses the in-process publishChange and subscribeChanges contract in packages/docs-server/src/docs-events.ts.');
   insert('approved-design','heading',{level:2},'Approved Design and Reuse');
   insert('approved-design-record','paragraph',{},'Approved in Variator on 2026-09-15 from Tapered Tree List, revision 13c3f549-e558-4eec-b1bc-144d8a3d86ee. Apply d72f0fe6-cbdd-48a4-9b63-4dba3fb2c19a used a real Kernel agent and passed 40 exact visual comparisons. The component design/approval.json package retains the original feedback, scoped decisions, revisions, and events. Earlier all-amber headers and blue Query styling are historical, superseded choices.');
   insert('approved-design-scope','paragraph',{},'Reuse the State Shape content palette, typography, spacing, restrained texture, and thin separators. Do not turn its blue identity or field-only layout into a rule for every component. Operation cards, kind colors, inputs before outputs, and softly tinted return headers are Interaction Surface decisions. Exact green-teal and violet tones and the 48 percent return tint were implementer choices accepted with the final design.');
  }
  if(ops.length){const result=await rpc(workspace,'docs_apply_ops',{project,path,task_id:task.task_id,expected_hash:current.hash,ops});results.push({project,path,operations:ops.length,hash:result.hash});}
 }
 for(const item of audit.filter(d=>d.workspace===workspace)){const checked=await rpc(workspace,'docs_check',{project:item.project,path:item.path});results.push({workspace,path:item.path,check:checked});}await rpc(workspace,'docs_end',{task_id:task.task_id});
}
await Bun.write('/tmp/interaction-docs-update-results.json',JSON.stringify(results,null,2));console.log(results.map(r=>({project:r.project,path:r.path,operations:r.operations,check:r.check?.ok})));
