import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { PACKAGE_ROOT } from './lifecycle';
import { loadGuidance } from './guidance';

const coreRoot=resolve(PACKAGE_ROOT,'../../..');
const packagePaths=['docs-system/packages/docs-mcp','docs-system/packages/docs-model','docs-system/packages/docs-server','docs-system/packages/docs-index','docs-system/packages/docs-workbench','canvas/packages/canvas','sequence/packages/sequence','annotations'];
async function git(root:string,args:string[]){const run=Bun.spawn(['git','-C',root,...args],{stdout:'pipe',stderr:'pipe'});const text=await new Response(run.stdout).text();return await run.exited===0?text.trim():null;}
export async function runtimePackages(){
 return Promise.all(packagePaths.map(async path=>{
  const root=join(coreRoot,path);const manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
  const hash=createHash('sha256');hash.update(await readFile(join(root,'package.json')));
  const sources=[...new Bun.Glob('src/**/*.{ts,tsx,json}').scanSync({cwd:root,onlyFiles:true})].filter(f=>!f.includes('__tests__')&&!f.includes('__fixtures__')&&!f.endsWith('.test.ts')&&!f.endsWith('.test.tsx')).sort();
  for(const file of sources)hash.update(file).update(await readFile(join(root,file)));
  return {name:manifest.name,version:manifest.version,path,sourceHash:hash.digest('hex'),dependencies:manifest.dependencies??{}};
 }));
}
export async function runtimeHash(){const packages=await runtimePackages();return createHash('sha256').update(JSON.stringify(packages)).digest('hex');}
export async function createDevelopmentSnapshot(toolContract?:unknown){
 const guidance=await loadGuidance();const packages=await runtimePackages();
 const repositories=await Promise.all(['docs-system','canvas','sequence','annotations','agent-kernel','prompt-kit'].map(async name=>({name,commit:await git(join(coreRoot,name),['rev-parse','HEAD']),dirty:!!await git(join(coreRoot,name),['status','--porcelain','--untracked-files=normal'])})));
 const body={schemaVersion:1,kind:'local-development',packages,repositories,guidanceSnapshot:guidance.snapshotId,guidanceSources:guidance.sources,toolContractHash:toolContract?createHash('sha256').update(JSON.stringify(toolContract)).digest('hex'):null,clients:['codex','claude','pi']};
 return {...body,snapshotId:createHash('sha256').update(JSON.stringify(body)).digest('hex'),createdAt:new Date().toISOString()};
}
