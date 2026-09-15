import {test,expect,afterAll} from 'bun:test';
import {mkdtempSync,writeFileSync,mkdirSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publishCollection,confinedFile} from './publish';
import {search} from './search';
const root=mkdtempSync(join(tmpdir(),'docs-publish-'));
afterAll(()=>rmSync(root,{recursive:true,force:true}));
const post={path:'post',slug:'post',date:'2026-09-12',description:'Public description',tags:['project']};
mkdirSync(join(root,'post'));
function fixture(block:any={id:'body',type:'paragraph',props:{},text:[{insert:'The snake loads after the logo.'}],children:[]}) {
 writeFileSync(join(root,'post/doc.json'),JSON.stringify({schemaVersion:1,id:'test',title:'Snake Loading',root:'root',blocks:{root:{id:'root',type:'paragraph',props:{privateNote:'secret'},children:['body']},body:block}}));
}
test('real renderer emits article HTML and only public search entries',()=>{
 fixture(); const r=publishCollection({root,posts:[post,{...post,path:'absent',slug:'draft',draft:true}],basePath:'/project/docs/'});
 expect(r.posts[0].html).toContain('The snake loads after the logo.</p>');expect(r.posts[0].url).toBe('/project/docs/post/');expect(r.searchIndex).toHaveLength(1);expect(r.searchIndex[0].text).not.toContain('secret');
});
test('bad dates, duplicate slugs, bad tags and invalid base paths fail',()=>{
 for (const bad of [{date:'2026-02-30'},{slug:'../escape'},{tags:['Bad Tag']}]) expect(()=>publishCollection({root,posts:[{...post,...bad}]})).toThrow();
 expect(()=>publishCollection({root,posts:[post,post]})).toThrow('Duplicate');expect(()=>publishCollection({root,posts:[],basePath:'//evil/'})).toThrow();
});
test('reject escaping paths and symlinks before reading assets',()=>{
 symlinkSync('/etc/passwd',join(root,'outside'));
 for(const path of ['../outside','/etc/passwd','outside','post/%2e%2e/key'])expect(()=>confinedFile(root,path)).toThrow();
});
test('Studio-only references cannot be published',()=>{
 fixture({id:'body',type:'canvas',props:{canvasId:'local-studio'},children:[]});expect(()=>publishCollection({root,posts:[post]})).toThrow('portable sidecar');
});
test('search handles query filler, partial words, typo and tag filters',()=>{
 const entries=[{url:'/snake/',title:'Snake loading',description:'',tags:['project'],text:'Animation'}, {url:'/other/',title:'Notes',description:'',tags:['notes'],text:'snake'}];
 expect(search(entries,'what was that thing about snak')[0].url).toBe('/snake/');expect(search(entries,'snke')[0].url).toBe('/snake/');expect(search(entries,'snake','notes')).toHaveLength(1);expect(search(entries,'missing')).toHaveLength(0);
});

test('diagrams publish as fitted images without a source-download placeholder',()=>{
 writeFileSync(join(root,'post/canvas.json'),JSON.stringify({schemaVersion:1,id:'canvas',mode:'diagram',objects:[{id:'box',type:'rectangle',text:'Public diagram',geometry:{x:10,y:10,width:180,height:80}}],connections:[]}));
 fixture({id:'body',type:'canvas',props:{src:'./canvas.json',title:'Public diagram'},children:[]});
 const result=publishCollection({root,posts:[post]});
 expect(result.posts[0].html).toContain('docs-diagram-preview');
 expect(result.posts[0].html).toContain('<img');
 expect(result.posts[0].html).not.toContain('Download diagram source');
 expect([...result.files.keys()]).toHaveLength(2);
 expect([...result.files.keys()][0]).toEndWith('.svg');
 expect(new TextDecoder().decode([...result.files.values()][0])).toContain('Public diagram');
});

test('image grids bundle every image and index headings, captions and alt text',()=>{
 const images=Array.from({length:6},(_,i)=>{writeFileSync(join(root,`post/grid-${i}.png`),`image-${i}`);return {src:`./grid-${i}.png`,heading:`Stage ${i}`,alt:`Variant ${i}`,caption:`Caption ${i}`};});
 fixture({id:'body',type:'image-grid',props:{images,columns:3},children:[]});
 const result=publishCollection({root,posts:[post],basePath:'/project/docs/'});
 expect(result.files.size).toBe(6);
 expect(result.posts[0].html.match(/<img /g)).toHaveLength(6);
 expect(result.posts[0].html).toContain('/project/docs/assets/');
 expect(result.posts[0].html).not.toContain('src="./');
 for(const label of ['Stage 5','Variant 5','Caption 5'])expect(result.searchIndex[0].text).toContain(label);
 fixture({id:'body',type:'image-grid',props:{images:[{src:'../outside.txt'}]},children:[]});
 expect(()=>publishCollection({root,posts:[post]})).toThrow();
});
