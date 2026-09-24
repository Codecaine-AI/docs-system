import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { canonicalBundleSrc } from '@codecaine-ai/docs-model/bundle-src';
import { validateDocDocument, serializeDocDocument } from '@codecaine-ai/docs-model/doc-schema';
import { normalizeDocRefPath } from '@codecaine-ai/docs-index/ref-match';
import { rescanAll } from '@codecaine-ai/docs-index/backlinks';
import { getBacklinksDb } from './backlinks-cache';
import { withPathLock } from './path-mutex';
import { draftLockStore } from './draft-locks';
import { atomicWriteFile } from './atomic-write';

export type ManageFilesInput = {
  kind: 'page' | 'asset' | 'title'; path: string; to?: string; title?: string;
  expected_hash: string; preview?: boolean; expected_tree_hash?: string; recursive?: boolean;
};
const hash = (b: Uint8Array|string) => createHash('sha256').update(b).digest('hex');
const isDoc = (p:string) => p.endsWith('/doc.json') && !p.includes('/assets/');
const under = (file:string, dir:string) => file === dir || file.startsWith(dir+'/');
const safe = (p:string) => p.length>0 && !p.includes('\\') && !p.includes('\0') && !p.startsWith('/') && p.split('/').every(x=>x!=='.'&&x!=='..'&&x.length>0&&!x.startsWith('.'));
const failure = (detail:string,status=409) => ({ok:false,status,detail});

/** Snapshot the corpus, excluding service-owned metadata. Reject symlinks before any read. */
async function capture(root:string) {
  const files=new Map<string,Buffer>();
  async function walk(dir:string) {
    for(const entry of await readdir(join(root,dir),{withFileTypes:true})) {
      if(!dir && ['.index','.changesets','.git'].includes(entry.name))continue;
      const p=dir?`${dir}/${entry.name}`:entry.name;
      if(entry.isSymbolicLink())throw Error(`Symbolic links are unsupported for corpus management: ${p}`);
      if(entry.isDirectory())await walk(p);
      else if(entry.isFile())files.set(p,await readFile(join(root,p)));
      else throw Error(`Unsupported filesystem entry: ${p}`);
    }
  }
  await walk('');
  const h=createHash('sha256');
  for(const [p,b] of [...files].sort(([a],[b])=>a.localeCompare(b)))h.update(p).update('\0').update(b).update('\0');
  return {files,hash:h.digest('hex')};
}
async function confined(root:string,path:string) {
  let current=root;
  for(const segment of path.split('/')){
    current=join(current,segment);
    try { if((await lstat(current)).isSymbolicLink())throw Error(`Symbolic link: ${path}`); }
    catch(e:any){if(e.code==='ENOENT')return;throw e;}
  }
}

/** Plan and apply typed page/asset relocations. This is a store operation, not raw MCP filesystem access.
 * A reviewed corpus fingerprint guards all descendants and reference sources. Per-file locks are shared
 * with normal edits. Rollback restores captured bytes; a journal remains for crash/manual recovery.
 */
export async function manageFiles(root:string,input:ManageFilesInput):Promise<Record<string,any>> {
 return withPathLock(join(root,'.changesets','.management-lock'),async()=>{
  try {
    if(!safe(input.path) || (input.to!==undefined&&!safe(input.to)))return failure('Use canonical docs-root-relative paths.',400);
    const isPage=input.kind==='page', sourceFile=input.kind==='asset'?input.path:input.path+'/doc.json';
    if(input.kind==='asset' && !input.path.includes('/assets/'))return failure('Asset paths must be inside a bundle assets directory.',400);
    if(input.kind==='asset' && input.to && !input.to.includes('/assets/'))return failure('Asset destination must be inside a bundle assets directory.',400);
    if(input.to && (under(input.to,input.path)||under(input.path,input.to)))return failure('Source and destination must not overlap.',400);
    await confined(root,input.path);if(input.to)await confined(root,input.to);
    await confined(root,'.changesets');await confined(root,'.index');
    const before=await capture(root), source=before.files.get(sourceFile);
    if(!source)return failure('Source not found.',404);
    if(hash(source)!==input.expected_hash)return {...failure('Source changed. Read again.'),current_hash:hash(source)};
    if(input.to){try {await lstat(join(root,input.to));return failure('Destination already exists.');}catch(e:any){if(e.code!=='ENOENT')throw e;}}
    if(input.kind==='asset' && input.to && (extname(input.path)!==extname(input.to) || ['canvas','sequence'].some(kind=>input.path.endsWith(`.${kind}.json`) && (!input.to!.endsWith(`.${kind}.json`) || !input.to!.includes(`/assets/${kind==='canvas'?'canvases':'sequences'}/`)))))return failure('Asset relocation must preserve its file type and component asset directory.',400);
    if(input.kind==='asset' && input.to){const owner=input.to.split('/assets/')[0];if(!before.files.has(owner+'/doc.json'))return failure('Destination must belong to an existing page.');}
    const moving=[...before.files.keys()].filter(p=>isPage?under(p,input.path):p===sourceFile);
    const children=moving.filter(p=>isDoc(p)&&p!==sourceFile);
    if(isPage&&!input.to&&children.length&&!input.recursive)return {...failure('Subtree deletion requires recursive:true.'),children};
    if(input.kind==='title' && (!input.title?.trim() || input.to))return failure('Supply a nonempty title without a destination.',400);
    const map=(p:string)=>input.to&&(isPage?under(p,input.path):p===input.path)?input.to+p.slice(input.path.length):p;
    const outputs=new Map<string,Buffer>(), affected=new Set<string>(), inbound=new Set<string>();
    for(const [file,bytes] of before.files) {
      // Only typed document data and component sidecars contain maintained references.
      if(!isDoc(file)&&!file.endsWith('/annotations.json')&&!file.endsWith('.canvas.json')&&!file.endsWith('.sequence.json'))continue;
      let data:any;try{data=JSON.parse(bytes.toString());}catch{return failure(`Malformed JSON: ${file}`,422);}
      let changed=false;
      function visit(v:any){
        if(!v||typeof v!=='object')return;
        if(isPage&&v.kind==='doc'&&typeof v.path==='string'){
          const target=normalizeDocRefPath(v.path);
          if(under(target,input.path)){
            if(!input.to){if(!under(file,input.path))inbound.add(file);}
            else {v.path=map(target);changed=true;}
          }
        }
        for(const child of Object.values(v))visit(child);
      }
      visit(data);
      // Preserve document media, attachment links, and annotation canvas targets.
      function assetReference(holder:any,key:string){
          const src=holder?.[key];if(typeof src!=='string'||/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src))return;
          const suffix=src.match(/[?#].*$/)?.[0]??'', plain=src.slice(0,src.length-suffix.length).replaceAll('\\','/');
          const rel=relative(root,resolve(root,dirname(file),plain)).split(sep).join('/');
          const rooted=plain.replace(/^\//,'').replace(/^\.\//,'');
          const relativeExists=before.files.has(rel),rootExists=before.files.has(rooted);
          if(relativeExists&&rootExists&&rel!==rooted&&(moving.includes(rel)||moving.includes(rooted)||moving.includes(file)))throw Error(`Ambiguous asset path in ${file}: ${src}`);
          const target=relativeExists?rel:rootExists?rooted:undefined;
          if(!target || !target.includes('/assets/'))return;
          if(!input.to&&input.kind!=='title'&&moving.includes(target)&&!moving.includes(file)){inbound.add(file);return;}
          if(!input.to)return;
          const nextTarget=map(target),nextFile=map(file);
          if(target===nextTarget&&file===nextFile)return;
          holder[key]=(relativeExists?canonicalBundleSrc(relative(dirname(nextFile),nextTarget).split(sep).join('/')):nextTarget)+suffix;changed=true;
      }
      if(isDoc(file))for(const block of Object.values(data.blocks??{}) as any[]){
        for(const key of ['src','poster'])assetReference(block.props,key);
        if(block.type==='image-grid')for(const image of block.props?.images??[])assetReference(image,'src');
        for(const span of block.text??[])assetReference(span.attributes,'link');
        // Structured-table cell links have the same inline attribute shape.
        for(const row of block.props?.rows??[])if(Array.isArray(row))for(const cell of row)if(Array.isArray(cell))for(const span of cell)assetReference(span?.attributes,'link');
      }
      if(file.endsWith('.canvas.json')||file.endsWith('.sequence.json')){
        function componentAssets(value:any){if(!value||typeof value!=='object')return;for(const key of ['src','url','href','imageUrl'])assetReference(value,key);for(const child of Object.values(value))componentAssets(child);}
        componentAssets(data);
      }
      if(file.endsWith('/annotations.json'))for(const annotation of data.annotations??[])assetReference(annotation.target,'canvasSrc');
      if(input.kind==='title'&&file===sourceFile){data.title=input.title;changed=true;}
      if(changed){
        if(isDoc(file)){const valid=validateDocDocument(data);if(!valid.ok)return {...failure(`Invalid rewritten document: ${file}`,422),issues:valid.issues};outputs.set(file,Buffer.from(serializeDocDocument(valid.document)));}
        else outputs.set(file,Buffer.from(JSON.stringify(data,null,2)+'\n'));
        affected.add(file);
      }
    }
    if(inbound.size)return {...failure('Other pages still reference the page or its assets. Relocate assets or repair links first.'),inbound:[...inbound]};
    for(const file of moving)affected.add(file);
    const preview={ok:true,preview:true,path:input.path,to:input.to,tree_hash:before.hash,files:moving,children,rewritten_sources:[...outputs.keys()].map(map),undo_available:true,undo_tool:'docs_management_restore'};
    if(input.preview!==false)return preview;
    if(input.expected_tree_hash!==before.hash)return failure('Corpus changed or preview missing. Preview this operation again.');
    // Lock all captured files because any may contain a reference or be a source of a concurrent edit.
    const lockOrder=(p:string)=>p.endsWith('/proposals.json')?0:p.endsWith('/doc.json')?1:p.endsWith('/annotations.json')?3:2;
    const locks=[...new Set([...before.files.keys(),...moving.map(map)].map(p=>join(root,p)))].sort((a,b)=>lockOrder(a)-lockOrder(b)||a.localeCompare(b));
    const acquire=(n:number):Promise<Record<string,any>>=>n===locks.length?commit():withPathLock(locks[n],()=>acquire(n+1));
    async function commit():Promise<Record<string,any>>{
      if((await capture(root)).hash!==before.hash)return failure('Corpus changed while waiting for locks. Preview again.');
      for(const file of affected){
        const kind=isDoc(file)?'doc':file.endsWith('.canvas.json')?'canvas':file.endsWith('.sequence.json')?'sequence':null;
        if(kind){const locked=draftLockStore.forRoot(root).checkForMutation({kind,path:kind==='doc'?file.slice(0,-9):file});if(locked.blocked)return {...failure(`Draft in progress: ${file}`,423),held_by:locked.heldBy};}
      }
      const id=randomUUID(), journal=join(root,'.changesets','file-management',id);
      await mkdir(join(journal,'backup'),{recursive:true});
      for(const file of affected){await mkdir(dirname(join(journal,'backup',file)),{recursive:true});await writeFile(join(journal,'backup',file),before.files.get(file)!);}
      const manifest={id,input,files:[...affected],status:'prepared'};
      await writeFile(join(journal,'manifest.json'),JSON.stringify(manifest,null,2));
      let relocated=false;
      try{
        if(input.to){await mkdir(dirname(join(root,input.to)),{recursive:true});await rename(join(root,input.path),join(root,input.to));relocated=true;}
        else if(input.kind!=='title'){await rename(join(root,input.path),join(journal,'deleted'));relocated=true;}
        for(const [file,bytes] of outputs){if(!input.to&&input.kind!=='title'&&moving.includes(file))continue;await atomicWriteFile(join(root,map(file)),bytes.toString());}
        await rescanAll(root,await getBacklinksDb(root));
        const after=await capture(root);
        const after_hashes=Object.fromEntries([...new Set([...affected,...[...affected].map(map)])].map(p=>[p,after.files.has(p)?hash(after.files.get(p)!):null]));
        await writeFile(join(journal,'manifest.json'),JSON.stringify({...manifest,status:'applied',after_hashes},null,2));
        return {ok:true,applied:true,path:input.to??input.path,previous_path:input.path,rewritten_sources:[...outputs.keys()].map(map),files:moving,tree_change_id:id,recovery_journal:relative(root,journal),undo_available:true,undo_tool:'docs_management_restore'};
      }catch(error){
        try{
          if(relocated){if(input.to)await rename(join(root,input.to),join(root,input.path));else await rename(join(journal,'deleted'),join(root,input.path));}
          for(const file of affected){await mkdir(dirname(join(root,file)),{recursive:true});await writeFile(join(root,file),before.files.get(file)!);}
          await rescanAll(root,await getBacklinksDb(root));
          await writeFile(join(journal,'manifest.json'),JSON.stringify({...manifest,status:'rolled-back'},null,2));
          return {...failure(String(error),500),rolled_back:true,recovery_journal:relative(root,journal)};
        }catch(rollback){return {...failure(String(error),500),rolled_back:false,rollback_error:String(rollback),recovery_journal:relative(root,journal)};}
      }
    }
    return acquire(0);
  }catch(error){return failure(error instanceof Error?error.message:String(error),400);}
 });
}

/** Restore one management journal only while every affected path still matches its applied state. */
export async function restoreManagedFiles(root:string,id:string,preview=true,expectedTreeHash?:string):Promise<Record<string,any>>{
 return withPathLock(join(root,'.changesets','.management-lock'),async()=>{
  try{
   if(!/^[0-9a-f-]{36}$/.test(id))return failure('Invalid management ID.',400);
   const rel=`.changesets/file-management/${id}`,journal=join(root,rel);
   await confined(root,rel);
   const manifest=JSON.parse(await readFile(join(journal,'manifest.json'),'utf8'));
   if(manifest.status!=='applied'||!manifest.after_hashes)return failure('Journal is not an applied, restorable change.');
   const before=await capture(root);
   for(const [file,expected] of Object.entries(manifest.after_hashes)){
    if(file.startsWith('/')||file.split('/')[0].startsWith('.')||file.split('/').some(p=>p==='..'||p==='.'||!p)||file.includes('\\'))return failure('Invalid journal path.',422);
    if((before.files.has(file)?hash(before.files.get(file)!):null)!==expected)return failure(`Cannot restore after subsequent edits: ${file}`);
   }
   const input=manifest.input as ManageFilesInput;
   if(!safe(input.path)||(input.to&&!safe(input.to)))return failure('Invalid journal paths.',422);
   if(input.kind!=='title'){try{await lstat(join(root,input.path));return failure('Original path is occupied.');}catch(error:any){if(error.code!=='ENOENT')throw error;}}
   for(const file of before.files.keys())if((under(file,input.path)||(input.to&&under(file,input.to)))&&!(file in manifest.after_hashes))return failure(`Cannot restore after files were added: ${file}`);
   if(preview)return {ok:true,preview:true,tree_hash:before.hash,files:manifest.files,restores:input.path};
   if(expectedTreeHash!==before.hash)return failure('Corpus changed or restore preview missing. Preview again.');
   const ordered=Object.keys(manifest.after_hashes).sort((a,b)=>Number(!a.endsWith('/doc.json'))-Number(!b.endsWith('/doc.json'))||a.localeCompare(b));
   const acquire=(n:number):Promise<Record<string,any>>=>n===ordered.length?commit():withPathLock(join(root,ordered[n]),()=>acquire(n+1));
   async function commit(){
    if((await capture(root)).hash!==before.hash)return failure('Corpus changed while waiting. Preview restore again.');
    for(const file of ordered){const kind=isDoc(file)?'doc':file.endsWith('.canvas.json')?'canvas':file.endsWith('.sequence.json')?'sequence':null;
     if(kind&&draftLockStore.forRoot(root).checkForMutation({kind,path:kind==='doc'?file.slice(0,-9):file}).blocked)return failure(`Draft in progress: ${file}`,423);
    }
    // Load every recovery byte before changing anything.
    const backups=new Map<string,Buffer>();
    for(const file of manifest.files){if(!(file in manifest.after_hashes))return failure('Invalid backup entry.',422);await confined(root,`${rel}/backup/${file}`);backups.set(file,await readFile(join(journal,'backup',file)));}
    if(input.to){await mkdir(dirname(join(root,input.path)),{recursive:true});await rename(join(root,input.to),join(root,input.path));}
    else if(input.kind!=='title'){await mkdir(dirname(join(root,input.path)),{recursive:true});await rename(join(journal,'deleted'),join(root,input.path));}
    for(const [file,bytes] of backups){await mkdir(dirname(join(root,file)),{recursive:true});await writeFile(join(root,file),bytes);}
    await rescanAll(root,await getBacklinksDb(root));
    await writeFile(join(journal,'manifest.json'),JSON.stringify({...manifest,status:'restored'},null,2));
    return {ok:true,restored:true,path:input.path,recovery_journal:rel};
   }
   return await acquire(0);
  }catch(error){return {...failure(String(error),500),detail:`Restore failed: ${String(error)}. Inspect the retained journal before retrying.`};}
 });
}

/** Asset inventory for agents, including orphaned files that no document currently embeds. */
export async function listManagedAssets(root:string,path?:string):Promise<Record<string,any>>{
 try{if(path!==undefined&&!safe(path))return failure('Invalid page path.',400);const snapshot=await capture(root);
 return {ok:true,assets:[...snapshot.files].filter(([p])=>p.includes('/assets/')&&(!path||under(p,path))).map(([p,bytes])=>({path:p,size:bytes.length,hash:hash(bytes)}))};
 }catch(error){return failure(String(error),400);}
}
