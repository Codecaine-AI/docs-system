import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
const root = process.env.CODECAINE_DOCS_SOURCE_ROOT;
const webRoot = join(root, 'packages/docs-workbench/web');
const require = createRequire(join(webRoot, 'package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const parent = process.ppid;
setInterval(() => { try { process.kill(parent, 0); } catch { process.exit(0); } }, 2000).unref();
const vite = await createServer({
  configFile: join(webRoot, 'vite.config.ts'), base: '/__viewer/',
  server: { host: '127.0.0.1', strictPort: true, fs: { allow: [resolve(root, '..')] }, hmr: { clientPort: Number(process.env.CODECAINE_DOCS_PUBLIC_PORT), path: '/hmr' } },
  optimizeDeps: { exclude: ['@codecaine-ai/docs-model', '@codecaine-ai/docs-viewer', '@codecaine-ai/canvas', '@codecaine-ai/sequence', '@codecaine-ai/annotations'] },
});
// Listen directly so port zero means an OS-assigned port, never Vite's default 5173.
await new Promise((resolve, reject) => { vite.httpServer.once('error', reject); vite.httpServer.listen(0, '127.0.0.1', resolve); });
console.log(JSON.stringify({ ready: true, port: vite.httpServer.address().port }));
process.on('SIGTERM', async () => { await vite.close(); process.exit(0); });
