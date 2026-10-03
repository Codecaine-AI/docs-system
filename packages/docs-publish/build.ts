import { mkdir, writeFile, rm, readFile, cp, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { bundleConfig } from './src/bundle';
const root = import.meta.dir;
await rm(`${root}/dist`, {recursive:true,force:true});
await mkdir(`${root}/dist/browser`, {recursive:true});
for (const [entry, target, outdir] of [['publish.tsx','node','dist/node'],['search.ts','browser','dist'],['search-widget.ts','browser','dist/browser'],['viewers.tsx','browser','dist/browser'],['editor.tsx','browser','dist/browser']] as const) {
  const result = await Bun.build(bundleConfig(entry, target, `${root}/${outdir}`));
  if (!result.success) throw new AggregateError(result.logs, `Failed ${entry}`);
}
// The measured fonts: dist/fonts.css (@font-face for hosts and the viewers) and
// dist/fonts/ (woff2 for browsers, the TTFs the Node publisher shapes with,
// OFL licenses). dist/node/publish.js finds the TTFs at ../fonts and HarfBuzz's
// WASM next to itself.
const textMeasure = dirname(Bun.resolveSync('@codecaine-ai/text-measure/fonts.css', `${root}/src`));
await cp(`${textMeasure}/fonts`, `${root}/dist/fonts`, {recursive:true});
await copyFile(`${textMeasure}/fonts.css`, `${root}/dist/fonts.css`);
await copyFile(resolve(dirname(Bun.resolveSync('harfbuzzjs', textMeasure)), 'harfbuzz.wasm'), `${root}/dist/node/harfbuzz.wasm`);
const {build} = await import('../docs-workbench/node_modules/vite/dist/node/index.js');
const {default:tailwind} = await import('../docs-workbench/node_modules/@tailwindcss/vite/dist/index.mjs');
await build({configFile:false, root, plugins:[tailwind()], build:{outDir:'dist/styles', emptyOutDir:true, rollupOptions:{input:{docs:resolve(root,'src/styles.css'),editor:resolve(root,'src/editor.css')},output:{assetFileNames:'[name].css'}}}});
const git = (...args:string[]) => execFileSync('git', args, {cwd:resolve(root,'../..'),encoding:'utf8'}).trim();
await writeFile(`${root}/dist/provenance.json`, JSON.stringify({version:JSON.parse(await readFile(`${root}/package.json`,'utf8')).version,docsCommit:git('rev-parse','HEAD'),dirty:!!git('status','--porcelain'),canvasCommit:git('-C','external/canvas','rev-parse','HEAD'),sequenceCommit:git('-C','external/sequence','rev-parse','HEAD'),note:'Local compatibility artifact; package bytes are pinned by the consuming lockfile. Release from clean tagged sources before production.'},null,2));
