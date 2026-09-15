import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
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
