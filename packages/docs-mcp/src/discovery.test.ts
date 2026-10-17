import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverProjects } from './discovery';

test('discovers declared projects, skips disabled products, returns stable explicit identities', async () => {
 const root=await mkdtemp(join(tmpdir(),'docs-discovery-'));
 try {
  await writeFile(join(root,'members.json'),JSON.stringify([{dir:'a'},{dir:'b'},{dir:'c'}]));
  for(const name of ['a','b','c']) {await mkdir(join(root,name,'docs','page'),{recursive:true});await writeFile(join(root,name,'docs','page','doc.json'),JSON.stringify({schemaVersion:1,id:'test',title:'Test',root:'root',blocks:{root:{id:'root',type:'paragraph',props:{},children:[]}}}));}
  await writeFile(join(root,'c','codecaine.docs.json'),JSON.stringify({products:['prompts']}));
  const result=await discoverProjects(root);expect(result.projects.map(p=>p.name)).toEqual(['a','b']);
  expect((await discoverProjects(root)).projects).toEqual(result.projects);
  expect((await discoverProjects(join(root,'a'))).projects[0]?.id).toBe(result.projects[0]?.id);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('rejects project traversal and escaping symlinks', async()=>{
 const root=await mkdtemp(join(tmpdir(),'docs-discovery-'));const outside=await mkdtemp(join(tmpdir(),'docs-outside-'));
 try{
  await writeFile(join(root,'codecaine.docs.json'),JSON.stringify({projects:['../outside']}));await expect(discoverProjects(root)).rejects.toThrow('escapes');
  await writeFile(join(root,'codecaine.docs.json'),JSON.stringify({projects:['linked']}));await symlink(outside,join(root,'linked'));await expect(discoverProjects(root)).rejects.toThrow('symlink');
 }finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});

const page={schemaVersion:1,id:'test',title:'Test',root:'root',blocks:{root:{id:'root',type:'paragraph',props:{},children:[]}}};
async function knowledgeBase(config:Record<string,unknown>){
 const root=await mkdtemp(join(tmpdir(),'docs-discovery-kb-'));
 await writeFile(join(root,'codecaine.docs.json'),JSON.stringify({name:'knowledge-base',docsRoot:'.',...config}));
 await mkdir(join(root,'sessions/s1/outputs/inputs/spec-pages/p1'),{recursive:true});
 await writeFile(join(root,'sessions/s1/outputs/inputs/spec-pages/p1/doc.json'),JSON.stringify(page));
 return root;
}
test('an excluded doc.json alone does not make a corpus', async()=>{
 const root=await knowledgeBase({exclude:['sessions/*/outputs/inputs/**']});
 try{
  const result=await discoverProjects(root);
  expect(result.projects).toEqual([]);
  expect(result.warnings.some(w=>w.startsWith('No normalized doc.json corpus found'))).toBe(true);
  await mkdir(join(root,'notes/seed'),{recursive:true});await writeFile(join(root,'notes/seed/doc.json'),JSON.stringify(page));
  const found=await discoverProjects(root);
  expect(found.projects).toHaveLength(1);
  expect(found.projects[0]).toMatchObject({name:'knowledge-base',docsRoot:found.workspace,root:found.workspace,exclude:['sessions/*/outputs/inputs/**']});
 }finally{await rm(root,{recursive:true,force:true});}
});
test('exclude is optional, normalized, and absent from projects that do not set it', async()=>{
 const root=await knowledgeBase({exclude:['./sessions/*/outputs/inputs/**']});
 try{
  await mkdir(join(root,'notes/seed'),{recursive:true});await writeFile(join(root,'notes/seed/doc.json'),JSON.stringify(page));
  expect((await discoverProjects(root)).projects[0]?.exclude).toEqual(['sessions/*/outputs/inputs/**']);
  await writeFile(join(root,'codecaine.docs.json'),JSON.stringify({name:'knowledge-base',docsRoot:'.'}));
  expect('exclude' in (await discoverProjects(root)).projects[0]!).toBe(false);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('an invalid exclude throws', async()=>{
 const root=await knowledgeBase({});
 try{
  for(const exclude of ['sessions/**',[1],['/abs/**'],['../outside/**'],['a/../b'],[''],['./']]){
   await writeFile(join(root,'codecaine.docs.json'),JSON.stringify({name:'knowledge-base',docsRoot:'.',exclude}));
   await expect(discoverProjects(root)).rejects.toThrow('Invalid exclude');
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
test('a workspace inside a docsRoot "." project yields no projects and names the enclosing project', async()=>{
 const root=await realpath(await knowledgeBase({exclude:['sessions/*/outputs/inputs/**']}));
 try{
  await mkdir(join(root,'notes/seed'),{recursive:true});await writeFile(join(root,'notes/seed/doc.json'),JSON.stringify(page));
  await mkdir(join(root,'places/area-a/docs/overview'),{recursive:true});
  await writeFile(join(root,'places/area-a/docs/overview/doc.json'),JSON.stringify(page));
  const place=await discoverProjects(join(root,'places/area-a'));
  expect(place.projects).toEqual([]);
  expect(place.warnings).toContain(`Inside docs project ${root}: ${join(root,'places/area-a')}`);
  // A symlink to the Place canonicalizes into the knowledge base too.
  const outside=await realpath(await mkdtemp(join(tmpdir(),'docs-discovery-link-')));
  try{
   await symlink(join(root,'places/area-a'),join(outside,'area'));
   expect((await discoverProjects(join(outside,'area'))).projects).toEqual([]);
  }finally{await rm(outside,{recursive:true,force:true});}
  // The knowledge base itself still discovers as one project.
  expect((await discoverProjects(root)).projects.map(p=>p.root)).toEqual([root]);
 }finally{await rm(root,{recursive:true,force:true});}
});
