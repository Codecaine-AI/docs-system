import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = import.meta.dir;
await rm(`${root}/dist`, {recursive:true,force:true});
await mkdir(`${root}/dist/browser`, {recursive:true});
for (const [entry, target, outdir] of [['publish.tsx','node','dist'],['search.ts','browser','dist'],['search-widget.ts','browser','dist/browser'],['viewers.tsx','browser','dist/browser']] as const) {
  const result = await Bun.build({entrypoints:[`${root}/src/${entry}`], target, splitting: target === 'browser', outdir:`${root}/${outdir}`, minify: true, define: {'process.env.NODE_ENV': '"production"'}});
  if (!result.success) throw new AggregateError(result.logs, `Failed ${entry}`);
}
const {build} = await import('../docs-workbench/node_modules/vite/dist/node/index.js');
const {default:tailwind} = await import('../docs-workbench/node_modules/@tailwindcss/vite/dist/index.mjs');
await build({configFile:false, root, plugins:[tailwind()], build:{outDir:'dist/styles', emptyOutDir:true, rollupOptions:{input:resolve(root,'src/styles.css'),output:{assetFileNames:'docs.css'}}}});
const git = (...args:string[]) => execFileSync('git', args, {cwd:resolve(root,'../..'),encoding:'utf8'}).trim();
await writeFile(`${root}/dist/provenance.json`, JSON.stringify({version:JSON.parse(await readFile(`${root}/package.json`,'utf8')).version,docsCommit:git('rev-parse','HEAD'),dirty:!!git('status','--porcelain'),canvasCommit:git('-C','external/canvas','rev-parse','HEAD'),sequenceCommit:git('-C','external/sequence','rev-parse','HEAD'),note:'Local compatibility artifact; package bytes are pinned by the consuming lockfile. Release from clean tagged sources before production.'},null,2));
