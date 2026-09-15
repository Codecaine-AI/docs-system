import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { manageFiles } from '../manage-files';

test('asset moves rewrite image-grid entries and deletion detects inbound grids', async () => {
 const root=await mkdtemp(join(tmpdir(),'image-grid-assets-'));
 try {
  for(const page of ['source','target','reader']){
   await mkdir(join(root,page,'assets/images'),{recursive:true});
   await writeFile(join(root,page,'doc.json'),JSON.stringify({schemaVersion:1,id:page,title:page,root:'root',blocks:{root:{id:'root',type:'paragraph',props:{},children:page==='reader'?['grid']:[]},...(page==='reader'?{grid:{id:'grid',type:'image-grid',props:{images:[{src:'source/assets/images/a.png',heading:'Original',alt:'Wall'}]},children:[]}}:{})}}));
  }
  const bytes=Buffer.from('fixture image');const hash=createHash('sha256').update(bytes).digest('hex');
  await writeFile(join(root,'source/assets/images/a.png'),bytes);
  const input={kind:'asset' as const,path:'source/assets/images/a.png',expected_hash:hash};
  expect((await manageFiles(root,input)).ok).toBe(false);
  const move={...input,to:'target/assets/images/a.png'};const preview=await manageFiles(root,move);
  expect(preview.ok).toBe(true);
  expect((await manageFiles(root,{...move,preview:false,expected_tree_hash:preview.tree_hash})).ok).toBe(true);
  const reader=JSON.parse(await readFile(join(root,'reader/doc.json'),'utf8'));
  expect(reader.blocks.grid.props.images[0]).toEqual({src:'target/assets/images/a.png',heading:'Original',alt:'Wall'});
 } finally { await rm(root,{recursive:true,force:true}); }
});
