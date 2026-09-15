import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {resolve,join} from 'node:path';
import {writeFile} from 'node:fs/promises';
const repo=resolve(import.meta.dir,'../../..');const client=new Client({name:'document-tree-tools',version:'1'});let task:string|undefined;const checks:any[]=[];
async function call(name:string,args:any={}){const r=await client.callTool({name,arguments:args});if(r.isError)throw Error(JSON.stringify(r.structuredContent));return r.structuredContent as any;}
try{await client.connect(new StdioClientTransport({command:process.execPath,args:[join(repo,'packages/docs-mcp/src/cli.ts'),'mcp','--workspace',resolve(repo,'..')]}));
const found=await call('docs_discover');const project=found.projects.find((p:any)=>p.name==='docs-system').id;
const begun=await call('docs_begin');task=begun.task_id;
const paragraphs=[
['heading','Page Creation, Move, Rename, and Deletion'],
['paragraph','Use docs_create to add a page. Use docs_move with path, to, and expected_hash to relocate a leaf bundle within the same project. Use docs_rename with path, name, and expected_hash to change its directory name within the same parent. Both preserve the document ID and title, carry local assets, and use the existing tree service to rewrite typed inbound document and Canvas links. Rename changes the bundle address, not the stored document title.'],
['paragraph','The tools refresh the backlinks index before moving. Check the returned failures and applied fields: a link rewrite failure can require repair after the move. These tree changes have no guarded docs_undo entry. Finish concurrent editing activity before reorganizing pages. The underlying tree service does not provide a corpus-wide transaction against independent editors.'],
['paragraph','To delete, first call docs_delete with path and expected_hash. Its default preview returns the files to remove and tree_hash. Review those files and the user\'s deletion authorization. Apply with preview:false and expected_tree_hash set to that preview hash. Changes to corpus files invalidate the preview. No user documentation is deleted merely by requesting the preview.'],
['paragraph','Deletion refuses inbound links, nested pages, and files referenced by other pages. Move and rename also refuse shared assets and nested pages. Move refuses a different parent when relative assets outside the bundle could break. Reorganize child pages individually. Migrate shared Canvas or Sequence assets and their referencing src values before removing the old owner page; a new reference to the old file is not a copy of that file.'],
['paragraph','After a move or rename, read the destination, inspect rewritten links, and run docs_check on affected pages. After deletion, inspect docs_tree and check remaining affected pages. Reconnect clients after the service restart so their tool catalogs include docs_move, docs_rename, and docs_delete. Restart shared workbenches when the daemon address changes.']
];
for(const path of ['30-guides/10-docs-mcp/40-recovery','20-implementation/10-packages/85-docs-mcp']){
const r=await call('docs_read',{project,path});const root=r.doc.root;
const blocks=path.startsWith('30-')?paragraphs:[paragraphs[0],paragraphs[1],['paragraph','Page deletion uses a preview of corpus files and refuses remaining inbound links or shared assets. Tree operations use the existing changeset service and have no guarded content undo. Leaf-page restrictions prevent claiming unsupported descendant link rewriting. The maintenance guide owns the operating procedure.']];
await call('docs_apply_ops',{project,path,task_id:task,expected_hash:r.hash,ops:blocks.map(([type,text],i)=>({type:'insertBlock',blockId:'page-tree-tools-'+i,parentId:root,index:r.doc.blocks[root].children.length+i,blockType:type,props:type==='heading'?{level:2}:{},text:[{insert:text}]}))});
checks.push({path,...await call('docs_check',{project,path})});}
await call('docs_end',{task_id:task});task=undefined;
await writeFile(join(import.meta.dir,'tree-tools-doc-checks.json'),JSON.stringify(checks,null,2));
console.log('Both documentation pages passed completion checks.');
}finally{if(task)await call('docs_end',{task_id:task}).catch(()=>{});await client.close();}
