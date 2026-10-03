import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { createServer as createProbe } from 'node:net';
const root = process.env.CODECAINE_DOCS_SOURCE_ROOT;
const webRoot = join(root, 'packages/docs-workbench/web');
const require = createRequire(join(webRoot, 'package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const parent = process.ppid;
setInterval(() => { try { process.kill(parent, 0); } catch { process.exit(0); } }, 2000).unref();
// Reserve an OS-assigned port up front and pin it in the config. Vite restarts
// its server on config/dependency changes and re-listens on the configured
// port; leaving vite.config.ts's 4801 there strands the supervisor, which
// proxies to the port reported once below.
const port = await new Promise((resolvePort, reject) => {
  const probe = createProbe();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolvePort(port)); });
});
const vite = await createServer({
  configFile: join(webRoot, 'vite.config.ts'), base: '/__viewer/',
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [resolve(root, '..')] }, hmr: { clientPort: Number(process.env.CODECAINE_DOCS_PUBLIC_PORT), path: '/hmr' } },
  optimizeDeps: { exclude: ['@codecaine-ai/docs-model', '@codecaine-ai/docs-viewer', '@codecaine-ai/canvas', '@codecaine-ai/sequence', '@codecaine-ai/annotations'] },
});
await vite.listen();
console.log(JSON.stringify({ ready: true, port }));
process.on('SIGTERM', async () => { await vite.close(); process.exit(0); });
