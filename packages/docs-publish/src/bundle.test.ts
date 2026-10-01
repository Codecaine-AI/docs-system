import {test,expect,afterAll} from 'bun:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {bundleConfig} from './bundle';
const out=mkdtempSync(join(tmpdir(),'docs-publish-bundle-'));
afterAll(()=>rmSync(out,{recursive:true,force:true}));
// A second React copy leaves embed hooks with a null dispatcher ("reading 'useRef'").
test('the diagram viewer bundle contains exactly one React copy',async()=>{
 const result=await Bun.build({...bundleConfig('viewers.tsx','browser',out),minify:false});
 expect(result.success).toBe(true);
 const copies=new Set<string>();
 for(const o of result.outputs) for(const m of (await o.text()).matchAll(/^\/\/ (.*\/react\/cjs\/react\.production\.js)$/gm)) copies.add(m[1]);
 expect([...copies]).toHaveLength(1);
},60000);
