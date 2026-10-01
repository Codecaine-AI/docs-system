import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BunPlugin, BuildConfig } from 'bun';
const packageRoot = resolve(import.meta.dir, '..');
// React reaches the bundles through symlinked and real paths (canvas and
// sequence resolve from their own checkouts). Pin every React import to one
// real file so react-dom and the embeds share a single React instance;
// otherwise hooks in the embeds see a null dispatcher.
export const singleReact: BunPlugin = {name:'single-react', setup(build) {
  build.onResolve({filter:/^react(?:-dom)?(?:\/.*)?$/}, args => ({path: realpathSync(Bun.resolveSync(args.path, resolve(packageRoot,'../..')))}));
}};
export const bundleConfig = (entry: string, target: 'node' | 'browser', outdir: string): BuildConfig => ({entrypoints:[`${packageRoot}/src/${entry}`], target, splitting: target === 'browser', outdir, minify: true, define: {'process.env.NODE_ENV': '"production"'}, plugins: [singleReact]});
