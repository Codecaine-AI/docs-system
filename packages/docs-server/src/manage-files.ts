import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { copyFile, lstat, open } from 'node:fs/promises';
import { dirname, extname, join, relative, sep } from 'node:path';
import { canonicalBundleSrc } from '@codecaine-ai/docs-model/bundle-src';
import { validateDocDocument, serializeDocDocument } from '@codecaine-ai/docs-model/doc-schema';
import { rescanAll } from '@codecaine-ai/docs-index/backlinks';
import { guardWholeFolderOperation } from '@codecaine-ai/docs-index/subtree-guard';
import { checkDocsPath, docsFs, type DocsPreflightTarget } from '@codecaine-ai/docs-index/safe-path';
import { getBacklinksDb } from './backlinks-cache';
import { withPathLock } from './path-mutex';
import { draftLockStore } from './draft-locks';
import { extractManagedRefs, holdsManagedRefs, isDoc, resolveAssetTarget } from './managed-refs';
import { referenceCache } from './reference-cache';

export type ManageFilesInput = {
  kind: 'page' | 'asset' | 'title'; path: string; to?: string; title?: string;
  expected_hash: string; preview?: boolean; expected_tree_hash?: string; recursive?: boolean;
};
const hash = (b: Uint8Array|string) => createHash('sha256').update(b).digest('hex');
const under = (file:string, dir:string) => file === dir || file.startsWith(dir+'/');
const safe = (p:string) => p.length>0 && !p.includes('\\') && !p.includes('\0') && !p.startsWith('/') && p.split('/').every(x=>x!=='.'&&x!=='..'&&x.length>0&&!x.startsWith('.'));
const failure = (detail:string,status=409) => ({ok:false as const,status,detail});
/** A 403 refusal from the docs-root chokepoint (excluded lexically or on disk, or carried out of the root). */
const refused403 = (root:string,p:string) => {const c=checkDocsPath(root,p,'read');return !c.ok&&c.status===403?c:null;};
/** Every target of a management mutation, before its first change. */
const preflight = (root:string,targets:DocsPreflightTarget[]) => {const r=docsFs(root).preflight(targets);return r.ok?null:{...failure(r.detail,r.status),refused:r.refused.map(x=>x.path)};};

/** Snapshot the corpus, excluding service-owned metadata and the project's `exclude` paths. Reject symlinks before any read.
 * Every listing and read goes through the docs-root chokepoint, which also omits entries excluded at their canonical location. */
async function capture(root:string) {
  const files=new Map<string,Buffer>(), fs=docsFs(root);
  async function walk(dir:string) {
    for(const entry of await fs.readdirEntries(dir)) {
      if(!dir && ['.index','.changesets','.git'].includes(entry.name))continue;
      const p=dir?`${dir}/${entry.name}`:entry.name;
      // Excluded paths are not corpus: never read, fingerprinted, rewritten or restored.
      if(entry.isSymbolicLink())throw Error(`Symbolic links are unsupported for corpus management: ${p}`);
      if(entry.isDirectory())await walk(p);
      else if(entry.isFile())files.set(p,await fs.readFile(p));
      else throw Error(`Unsupported filesystem entry: ${p}`);
    }
  }
  await walk('');
  const h=createHash('sha256');
  for(const [p,b] of [...files].sort(([a],[b])=>a.localeCompare(b)))h.update(p).update('\0').update(b).update('\0');
  return {files,hash:h.digest('hex')};
}
/** Metadata-only twin of capture(): the same walk and refusals, but it records identity and size and reads no file bytes. */
type InventoryEntry = { size:bigint; dev:bigint; ino:bigint };
async function inventoryAssets(root:string) {
  const entries=new Map<string,InventoryEntry>(), fs=docsFs(root);
  async function walk(dir:string) {
    for(const entry of await fs.readdirEntries(dir)) {
      if(!dir && ['.index','.changesets','.git'].includes(entry.name))continue;
      const p=dir?`${dir}/${entry.name}`:entry.name;
      if(entry.isSymbolicLink())throw Error(`Symbolic links are unsupported for corpus management: ${p}`);
      if(entry.isDirectory())await walk(p);
      else if(entry.isFile()){const s=await lstat(fs.guard(p,'inspect').canonical,{bigint:true});entries.set(p,{size:s.size,dev:s.dev,ino:s.ino});}
      else throw Error(`Unsupported filesystem entry: ${p}`);
    }
  }
  await walk('');
  return {entries};
}
/** Stream one inventoried file through sha256 without following anything swapped in since the walk.
 * The docs-root chokepoint resolves and confines the path; the open refuses a final symlink and never blocks on a FIFO,
 * and the opened file must be the same regular file the walk saw. One 1 MB buffer at a time.
 */
async function hashInventoried(fs:ReturnType<typeof docsFs>,p:string,seen:InventoryEntry) {
  const file=fs.guard(p,'read').canonical;
  let handle;
  try{handle=await open(file,fsConstants.O_RDONLY|fsConstants.O_NOFOLLOW|fsConstants.O_NONBLOCK);}
  catch(e:any){if(e.code==='ELOOP')throw Error(`Symbolic links are unsupported for corpus management: ${p}`);throw e;}
  try{
    const s=await handle.stat({bigint:true});
    if(!s.isFile())throw Error(`Unsupported filesystem entry: ${p}`);
    if(s.dev!==seen.dev||s.ino!==seen.ino)throw Error(`Corpus changed while listing assets: ${p}`);
    const h=createHash('sha256'), buffer=Buffer.allocUnsafe(1<<20);
    for(let n;(n=(await handle.read(buffer,0,buffer.length,null)).bytesRead)>0;)h.update(buffer.subarray(0,n));
    return h.digest('hex');
  }finally{await handle.close();}
}
/** The streamed sha256 of one corpus file, null when nothing is there; refusals as hashInventoried. */
async function streamHash(fs:ReturnType<typeof docsFs>,p:string):Promise<string|null> {
  let s;
  try{s=await lstat(fs.guard(p,'inspect').canonical,{bigint:true});}
  catch(e:any){if(e.code==='ENOENT'||e.code==='ENOTDIR')return null;throw e;}
  return hashInventoried(fs,p,{size:s.size,dev:s.dev,ino:s.ino});
}
/** A kernel copy between two guarded paths; neither file passes through memory. */
const copy=async(fs:ReturnType<typeof docsFs>,from:string,to:string)=>copyFile(fs.guard(from,'read').canonical,fs.guard(to,'write').canonical);
/** One read-set file of a plan: its content hash and the hash of what the plan writes there. */
type PlanEntry = { path:string; content:string|null; output:string|null };
type Plan = { ok:true; hash:string; entries:PlanEntry[]; moving:string[]; children:string[]; outputs:Map<string,Buffer>; affected:Set<string> };
async function confined(root:string,path:string) {
  const fs=docsFs(root);let current='';
  for(const segment of path.split('/')){
    current=current?`${current}/${segment}`:segment;
    try { if((await fs.lstat(current)).isSymbolicLink())throw Error(`Symbolic link: ${path}`); }
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
    for(const p of [input.path,input.to]){const r=p===undefined?null:refused403(root,p);if(r)return failure(r.detail,403);}
    const isPage=input.kind==='page', sourceFile=input.kind==='asset'?input.path:input.path+'/doc.json';
    if(input.kind==='asset' && !input.path.includes('/assets/'))return failure('Asset paths must be inside a bundle assets directory.',400);
    if(input.kind==='asset' && input.to && !input.to.includes('/assets/'))return failure('Asset destination must be inside a bundle assets directory.',400);
    if(input.to && (under(input.to,input.path)||under(input.path,input.to)))return failure('Source and destination must not overlap.',400);
    await confined(root,input.path);if(input.to)await confined(root,input.to);
    await confined(root,'.changesets');await confined(root,'.index');
    // A page move, rename or delete carries the whole physical folder. Refuse before any read
    // when it holds a knowledge-base record file or an excluded path (the capture below skips
    // excluded paths, so neither the preview nor the journal would account for them), or when
    // part of it would land on an excluded path.
    if(isPage){
      const guard=await guardWholeFolderOperation(root,input.path,{operation:input.to?'move':'delete',destination:input.to});
      if(!guard.ok)return {...failure(guard.detail,guard.status),records:guard.findings.records,excluded:guard.findings.excluded,excluded_at_destination:guard.findings.excludedAtDestination};
    }
    const map=(p:string)=>input.to&&(isPage?under(p,input.path):p===input.path)?input.to+p.slice(input.path.length):p;
    /** The operation planned from its read set: the files it moves plus every file whose references reach one of them.
     * tree_hash covers each read-set path with its content hash and planned output, so a write elsewhere never changes it. */
    async function plan():Promise<Plan|(Record<string,any>&{ok:false})>{
      let lookup;
      try{lookup=await referenceCache(root).lookup();}catch(e:any){if(e?.status===422)return failure(e.message,422);throw e;}
      const {files}=lookup, fs=docsFs(root);
      if(!files.has(sourceFile))return failure('Source not found.',404);
      const sourceHash=await streamHash(fs,sourceFile);
      if(sourceHash!==input.expected_hash)return {...failure('Source changed. Read again.'),current_hash:sourceHash};
      if(input.to){try {await fs.lstat(input.to);return failure('Destination already exists.');}catch(e:any){if(e.code!=='ENOENT')throw e;}}
      if(input.kind==='asset' && input.to && (extname(input.path)!==extname(input.to) || ['canvas','sequence'].some(kind=>input.path.endsWith(`.${kind}.json`) && (!input.to!.endsWith(`.${kind}.json`) || !input.to!.includes(`/assets/${kind==='canvas'?'canvases':'sequences'}/`)))))return failure('Asset relocation must preserve its file type and component asset directory.',400);
      if(input.kind==='asset' && input.to){const owner=input.to.split('/assets/')[0];if(!files.has(owner+'/doc.json'))return failure('Destination must belong to an existing page.');}
      const moving=[...files].filter(p=>isPage?under(p,input.path):p===sourceFile), movingSet=new Set(moving);
      const children=moving.filter(p=>isDoc(p)&&p!==sourceFile);
      if(isPage&&!input.to&&children.length&&!input.recursive)return {...failure('Subtree deletion requires recursive:true.'),children};
      if(input.kind==='title' && (!input.title?.trim() || input.to))return failure('Supply a nonempty title without a destination.',400);
      const hasFile=(p:string)=>files.has(p), isMoving=(p:string)=>movingSet.has(p);
      const outputs=new Map<string,Buffer>(), affected=new Set<string>(), inbound=new Set<string>(), content=new Map<string,string|null>();
      for(const [file,cached] of lookup.refs) {
        // Only a moving file or one with a reference into the moving set can change. Every reference is still resolved,
        // so an ambiguous one anywhere refuses as before.
        if(!isMoving(file)&&!cached.some(ref=>ref.form==='doc'?isPage&&under(ref.target,input.path):isMoving(resolveAssetTarget(ref,hasFile,isMoving)?.target??'')))continue;
        // Parse again from this read: the cached data is shared and never written through.
        const bytes=await fs.readFile(file);content.set(file,hash(bytes));
        let data:any;try{data=JSON.parse(bytes.toString());}catch{return failure(`Malformed JSON: ${file}`,422);}
        let changed=false;
        // Doc refs, then document media, attachment links, component assets and annotation canvas targets.
        for(const ref of extractManagedRefs(file,data,root)){
          if(ref.form==='doc'){
            if(!isPage||!under(ref.target,input.path))continue;
            if(!input.to){if(!under(file,input.path))inbound.add(file);}
            else {ref.holder[ref.key]=map(ref.target);changed=true;}
            continue;
          }
          const resolved=resolveAssetTarget(ref,hasFile,isMoving);
          if(!resolved)continue;
          const {target}=resolved;
          if(!input.to&&input.kind!=='title'&&isMoving(target)&&!isMoving(file)){inbound.add(file);continue;}
          if(!input.to)continue;
          const nextTarget=map(target),nextFile=map(file);
          if(target===nextTarget&&file===nextFile)continue;
          ref.holder[ref.key]=(resolved.relative?canonicalBundleSrc(relative(dirname(nextFile),nextTarget).split(sep).join('/')):nextTarget)+ref.suffix;changed=true;
        }
        if(input.kind==='title'&&file===sourceFile){data.title=input.title;changed=true;}
        if(changed){
          if(isDoc(file)){const valid=validateDocDocument(data);if(!valid.ok)return {...failure(`Invalid rewritten document: ${file}`,422),issues:valid.issues};outputs.set(file,Buffer.from(serializeDocDocument(valid.document)));}
          else outputs.set(file,Buffer.from(JSON.stringify(data,null,2)+'\n'));
          affected.add(file);
        }
      }
      if(inbound.size)return {...failure('Other pages still reference the page or its assets. Relocate assets or repair links first.'),inbound:[...inbound]};
      for(const file of moving){affected.add(file);if(!content.has(file))content.set(file,await streamHash(fs,file));}
      const entries=[...content].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([path,c]):PlanEntry=>({path,content:c,output:outputs.has(path)?hash(outputs.get(path)!):null}));
      return {ok:true,hash:hash(JSON.stringify(entries)),entries,moving,children,outputs,affected};
    }
    const planned=await plan();
    if(!planned.ok)return planned;
    const {moving,children,outputs,affected}=planned;
    const preview={ok:true,preview:true,path:input.path,to:input.to,tree_hash:planned.hash,files:moving,children,rewritten_sources:[...outputs.keys()].map(map),undo_available:true,undo_tool:'docs_management_restore'};
    if(input.preview!==false)return preview;
    if(input.expected_tree_hash!==planned.hash)return failure('Corpus changed or preview missing. Preview this operation again.');
    // Lock the read set and every destination: any of them may be the source of a concurrent edit.
    const lockOrder=(p:string)=>p.endsWith('/proposals.json')?0:p.endsWith('/doc.json')?1:p.endsWith('/annotations.json')?3:2;
    const locks=[...new Set([...planned.entries.map(e=>e.path),...moving.map(map)].map(p=>join(root,p)))].sort((a,b)=>lockOrder(a)-lockOrder(b)||a.localeCompare(b));
    const acquire=(n:number):Promise<Record<string,any>>=>n===locks.length?commit():withPathLock(locks[n],()=>acquire(n+1));
    async function commit():Promise<Record<string,any>>{
      const again=await plan();
      if(!again.ok)return again;
      if(again.hash!==planned.hash)return failure('Corpus changed while waiting for locks. Preview again.');
      for(const file of affected){
        const kind=isDoc(file)?'doc':file.endsWith('.canvas.json')?'canvas':file.endsWith('.sequence.json')?'sequence':null;
        if(kind){const locked=draftLockStore.forRoot(root).checkForMutation({kind,path:kind==='doc'?file.slice(0,-9):file});if(locked.blocked)return {...failure(`Draft in progress: ${file}`,423),held_by:locked.heldBy};}
      }
      const id=randomUUID(), journal=join(root,'.changesets','file-management',id), fs=docsFs(root);
      // Every journal file, the relocation and every rewritten output, inside the locks and before the first change.
      const blocked=preflight(root,[
        {path:join(journal,'backup'),intent:'mkdir'},
        {path:join(journal,'manifest.json'),intent:'write'},
        ...[...affected].map(file=>({path:join(journal,'backup',file),intent:'write' as const})),
        ...(input.to?[{path:input.path,intent:'rename-from' as const},{path:input.to,intent:'rename-to' as const},{path:dirname(input.to),intent:'mkdir' as const}]
          :input.kind!=='title'?[{path:input.path,intent:'rename-from' as const},{path:join(journal,'deleted'),intent:'rename-to' as const}]:[]),
        ...[...outputs.keys()].filter(file=>!(!input.to&&input.kind!=='title'&&moving.includes(file))).map(file=>({path:map(file),intent:'write' as const})),
      ]);
      if(blocked)return blocked;
      await fs.mkdir(join(journal,'backup'),{recursive:true});
      // Streamed copies, inside the locks: the plan just checked each affected file's content.
      for(const file of affected){await fs.mkdir(dirname(join(journal,'backup',file)),{recursive:true});await copy(fs,file,join(journal,'backup',file));}
      const manifest={id,input,files:[...affected],status:'prepared'};
      await fs.writeFile(join(journal,'manifest.json'),JSON.stringify(manifest,null,2));
      let relocated=false;
      try{
        if(input.to){await fs.mkdir(dirname(join(root,input.to)),{recursive:true});await fs.rename(join(root,input.path),join(root,input.to));relocated=true;}
        else if(input.kind!=='title'){await fs.rename(join(root,input.path),join(journal,'deleted'));relocated=true;}
        for(const [file,bytes] of outputs){if(!input.to&&input.kind!=='title'&&moving.includes(file))continue;await fs.atomicWrite(join(root,map(file)),bytes.toString());}
        await rescanAll(root,await getBacklinksDb(root));
        const after_hashes:Record<string,string|null>={};
        for(const p of new Set([...affected,...[...affected].map(map)]))after_hashes[p]=await streamHash(fs,p);
        await fs.writeFile(join(journal,'manifest.json'),JSON.stringify({...manifest,status:'applied',after_hashes},null,2));
        return {ok:true,applied:true,path:input.to??input.path,previous_path:input.path,rewritten_sources:[...outputs.keys()].map(map),files:moving,tree_change_id:id,recovery_journal:relative(root,journal),undo_available:true,undo_tool:'docs_management_restore'};
      }catch(error){
        try{
          if(relocated){if(input.to)await fs.rename(join(root,input.to),join(root,input.path));else await fs.rename(join(journal,'deleted'),join(root,input.path));}
          for(const file of affected){await fs.mkdir(dirname(join(root,file)),{recursive:true});await copy(fs,join(journal,'backup',file),join(root,file));}
          await rescanAll(root,await getBacklinksDb(root));
          await fs.writeFile(join(journal,'manifest.json'),JSON.stringify({...manifest,status:'rolled-back'},null,2));
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
   const fs=docsFs(root);
   const manifest=JSON.parse(await fs.readFile(join(journal,'manifest.json'),'utf8'));
   if(manifest.status!=='applied'||!manifest.after_hashes)return failure('Journal is not an applied, restorable change.');
   const before=await capture(root);
   for(const [file,expected] of Object.entries(manifest.after_hashes)){
    if(file.startsWith('/')||file.split('/')[0].startsWith('.')||file.split('/').some(p=>p==='..'||p==='.'||!p)||file.includes('\\'))return failure('Invalid journal path.',422);
    if((before.files.has(file)?hash(before.files.get(file)!):null)!==expected)return failure(`Cannot restore after subsequent edits: ${file}`);
   }
   const input=manifest.input as ManageFilesInput;
   if(!safe(input.path)||(input.to&&!safe(input.to)))return failure('Invalid journal paths.',422);
   for(const p of [input.path,input.to]){const r=p===undefined?null:refused403(root,p);if(r)return failure(r.detail,403);}
   // Restoring a page move renames the whole folder back: the same whole-folder guard applies.
   // Restoring a deletion puts the journaled folder back; only its landing paths are checked.
   if(input.kind==='page'){
    const guard=input.to
      ?await guardWholeFolderOperation(root,input.to,{operation:'restore',destination:input.path})
      :await guardWholeFolderOperation(root,`${rel}/deleted`,{operation:'restore',destination:input.path});
    if(!guard.ok&&(input.to||guard.status===403))return {...failure(guard.detail,guard.status),records:guard.findings.records,excluded:guard.findings.excluded,excluded_at_destination:guard.findings.excludedAtDestination};
   }
   if(input.kind!=='title'){try{await fs.lstat(input.path);return failure('Original path is occupied.');}catch(error:any){if(error.code!=='ENOENT')throw error;}}
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
    for(const file of manifest.files){if(!(file in manifest.after_hashes))return failure('Invalid backup entry.',422);await confined(root,`${rel}/backup/${file}`);backups.set(file,await fs.readFile(join(journal,'backup',file)));}
    // Every target the restore changes, inside the locks and before the first change.
    const blocked=preflight(root,[
     ...(input.to?[{path:input.to,intent:'rename-from' as const},{path:input.path,intent:'rename-to' as const},{path:dirname(input.path),intent:'mkdir' as const}]
       :input.kind!=='title'?[{path:join(journal,'deleted'),intent:'rename-from' as const},{path:input.path,intent:'rename-to' as const},{path:dirname(input.path),intent:'mkdir' as const}]:[]),
     ...[...backups.keys()].map(file=>({path:file,intent:'write' as const})),
     {path:join(journal,'manifest.json'),intent:'write'},
    ]);
    if(blocked)return blocked;
    if(input.to){await fs.mkdir(dirname(join(root,input.path)),{recursive:true});await fs.rename(join(root,input.to),join(root,input.path));}
    else if(input.kind!=='title'){await fs.mkdir(dirname(join(root,input.path)),{recursive:true});await fs.rename(join(journal,'deleted'),join(root,input.path));}
    for(const [file,bytes] of backups){await fs.mkdir(dirname(join(root,file)),{recursive:true});await fs.writeFile(join(root,file),bytes);}
    await rescanAll(root,await getBacklinksDb(root));
    await fs.writeFile(join(journal,'manifest.json'),JSON.stringify({...manifest,status:'restored'},null,2));
    return {ok:true,restored:true,path:input.path,recovery_journal:rel};
   }
   return await acquire(0);
  }catch(error){return {...failure(String(error),500),detail:`Restore failed: ${String(error)}. Inspect the retained journal before retrying.`};}
 });
}

/** Asset inventory for agents, including orphaned files that no document currently embeds. */
export async function listManagedAssets(root:string,path?:string):Promise<Record<string,any>>{
 try{if(path!==undefined&&!safe(path))return failure('Invalid page path.',400);const fs=docsFs(root),snapshot=await inventoryAssets(root);
 const picked=[...snapshot.entries].filter(([p])=>p.includes('/assets/')&&(!path||under(p,path)));
 // Hash one file at a time: listing holds one read buffer, never the corpus.
 const assets=[];for(const [p,e] of picked)assets.push({path:p,size:Number(e.size),hash:await hashInventoried(fs,p,e)});
 return {ok:true,assets};
 }catch(error){return failure(String(error),400);}
}
