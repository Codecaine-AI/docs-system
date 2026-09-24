import { createHash, randomBytes } from 'node:crypto';
import { watch, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename, copyFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { localBrowserRequest, mergeDiscovery, projectRoute, readRegistry, writeRegistry } from './registry';
import { directoryHtml } from './home';
import { deviceSearchRoots, emptyDeviceScan, scanDevice, scanWarning, type DeviceScan } from './device-discovery';

type Config = { sourceRoot: string; workspace: string; port: number; stateDirectory: string; legacyPort?: number };
type Runtime = { process: ReturnType<typeof Bun.spawn>; url: string; hash: string; file: string };
const configFile = process.env.CODECAINE_DOCS_BACKGROUND_CONFIG ?? join(homedir(), '.local/state/codecaine-docs/background.json');
const config = JSON.parse(await readFile(configFile, 'utf8')) as Config;
const stateDir = config.stateDirectory;
const packageRoot = join(config.sourceRoot, 'packages/docs-mcp');
const coreRoot = resolve(config.sourceRoot, '..');
const webRoot = join(config.sourceRoot, 'packages/docs-workbench/web');
const registryFile = join(stateDir, 'projects.json');
const builds = join(stateDir, 'builds');
await mkdir(builds, { recursive: true, mode: 0o700 });
let registry = await readRegistry(registryFile, config.workspace);
await writeRegistry(registryFile, registry);
const tokenFile = join(stateDir, 'service-token');
let token: string;
try { token = (await readFile(tokenFile, 'utf8')).trim(); } catch { token = randomBytes(32).toString('hex'); await writeFile(tokenFile, token, { mode: 0o600 }); }
let active: Runtime | undefined;
let candidate: Runtime | undefined;
let busy = false;
let queued = false;
let activeRequests = 0;
let requestRevision = 0;
let error: string | null = null;
let buildState = 'starting';
let viewer: ReturnType<typeof Bun.spawn> | undefined;
let viteUrl = '';
let closing = false;
let activating = false;
let registryRevision = 0;
let previousBuild: { hash: string; file: string } | undefined;
process.on('exit', () => { active?.process.kill(); candidate?.process.kill(); viewer?.kill(); });
let persist = Promise.resolve();
const watchers: ReturnType<typeof watch>[] = [];
const version = (await Bun.file(join(packageRoot, 'package.json')).json()).version;
const startedAt = new Date().toISOString();
function status() { return { service: 'codecaine-docs', pid: process.pid, version, startedAt, packageRoot, central: true, ready: !!active && !!viteUrl, build: active?.hash, buildState, error, port: server.port, projects: registry.projects.length, sourceRoot: config.sourceRoot }; }
async function runtimeFetch(runtime: Runtime, path: string, body?: unknown) {
  return fetch(new URL(path, runtime.url), { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
}
async function remember(discovery: any) {
  if (!discovery?.ok || typeof discovery.workspace !== 'string' || !Array.isArray(discovery.projects)) return;
  registry = mergeDiscovery(registry, discovery.workspace, discovery.projects);
  registryRevision++;
  persist = persist.then(() => writeRegistry(registryFile, registry));
  await persist;
}
async function buildRuntime(): Promise<{ hash: string; file: string }> {
  const sourcePaths = ['authoring-guidance.ts', 'visual-component-guidance.ts', 'project-markdown.ts'].map(p => `packages/docs-model/src/${p}`);
  for await (const path of new Bun.Glob('packages/docs-model/src/components/*/manifest.ts').scan(config.sourceRoot)) sourcePaths.push(path);
  const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, createHash('sha256').update(await readFile(join(config.sourceRoot, path))).digest('hex')])));
  const result = await Bun.build({ entrypoints: [join(packageRoot, 'src/managed-runtime.ts')], target: 'bun', format: 'esm', packages: 'bundle', define: { __DOCS_RUNTIME_SOURCES__: JSON.stringify(sourceHashes) } });
  if (!result.success) throw new Error(result.logs.map(String).join('\n'));
  if (result.outputs.length !== 1) throw new Error('Managed runtime must produce one JavaScript artifact');
  const bytes = await result.outputs[0]!.arrayBuffer();
  const hash = createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
  const file = join(builds, `runtime-${hash}.mjs`);
  if (!existsSync(file)) await Bun.write(file, bytes);
  return { hash, file };
}
async function startRuntime(build: { hash: string; file: string }): Promise<Runtime> {
  const child = Bun.spawn([process.execPath, build.file], { cwd: config.sourceRoot, env: { ...process.env, CODECAINE_DOCS_PACKAGE_ROOT: packageRoot, CODECAINE_DOCS_MANAGED: '1', CODECAINE_DOCS_RUNTIME_TOKEN: token, CODECAINE_DOCS_REGISTRY: registryFile, CODECAINE_DOCS_BUILD: build.hash }, stdout: 'pipe', stderr: 'inherit' });
  const reader = (child.stdout as ReadableStream<Uint8Array>).getReader();
  let buffer = '';
  let timeout: ReturnType<typeof setTimeout>;
  try {
    const port = await Promise.race([
      (async () => { for (;;) { const part = await reader.read(); if (part.done) throw new Error(`Runtime exited before ready (${await child.exited})`); buffer += new TextDecoder().decode(part.value); for (const line of buffer.split('\n').slice(0, -1)) { try { const value = JSON.parse(line); if (value.ready && Number.isInteger(value.port)) return value.port as number; } catch {} } buffer = buffer.slice(buffer.lastIndexOf('\n') + 1); } })(),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Runtime startup timed out')), 30000); }),
    ]);
    clearTimeout(timeout!);
    const runtime = { process: child, url: `http://127.0.0.1:${port}`, ...build };
    const health = await (await runtimeFetch(runtime, '/health')).json() as any;
    if (health.service !== 'codecaine-docs-runtime' || health.build !== build.hash) throw new Error('Replacement runtime failed its health check');
    // Continue draining stdout without retaining child output in memory.
    void (async () => { while (!(await reader.read()).done) {} })().catch(() => {});
    return runtime;
  } catch (e) { clearTimeout(timeout!); child.kill(); throw e; }
}
async function activate() {
  if (!candidate || activeRequests || closing || activating) return;
  activating = true;
  const next = candidate;
  try {
  const revision = registryRevision;
  for (const workspace of registry.workspaces) {
    if (!existsSync(workspace)) { console.error(`[docs] Registered workspace unavailable: ${workspace}`); continue; }
    const result = await (await runtimeFetch(next, '/rpc', { workspace, name: 'docs_discover', arguments: {} })).json() as any;
    if (result.isError) throw new Error('Replacement could not rediscover registered workspace');
  }
  const requests = requestRevision;
  if (active) {
    const health = await (await runtimeFetch(active, '/health')).json() as any;
    if (health.tasks > 0 || health.drafts > 0) { buildState = 'waiting-for-authoring-tasks'; return; }
  }
  if (activeRequests || requests !== requestRevision || revision !== registryRevision || candidate !== next || closing) return;
  const previous = active;
  active = candidate; candidate = undefined;
  if (previous) previousBuild = { hash: previous.hash, file: previous.file };
  buildState = 'ready'; error = null;
  await writeFile(join(stateDir, 'last-good-runtime.json'), JSON.stringify({ hash: active.hash, file: active.file }), { mode: 0o600 });
  if (previous) previous.process.kill(); // Closes old SSE streams; tabs reconnect to the same public URL.
  console.error(`[docs] Activated ${active.hash.slice(0, 12)}`);
  } finally { activating = false; }
}
async function rebuild() {
  if (busy) { queued = true; return; }
  busy = true; buildState = 'building';
  try {
    const build = await buildRuntime();
    if (build.hash === active?.hash) { buildState = 'ready'; error = null; return; }
    const next = await startRuntime(build);
    candidate?.process.kill(); candidate = next;
    await activate();
  } catch (e) { error = String(e); buildState = active ? 'build-failed-serving-previous' : 'failed'; console.error(`[docs] ${error}`); }
  finally { busy = false; if (queued) { queued = false; void rebuild(); } }
}
async function proxyRuntime(request: Request, pathname: string) {
  if (closing) return Response.json({ detail: 'Docs is restarting. Retry shortly.' }, { status: 503 });
  if (!active) return Response.json({ detail: 'Docs is starting.', ...status() }, { status: 503 });
  const runtime = active;
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.set('authorization', `Bearer ${token}`);
  headers.delete('host'); headers.delete('origin');
  activeRequests++;
  requestRevision++;
  try {
    const response = await fetch(`${runtime.url}${pathname}${url.search}`, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, signal: request.signal, redirect: 'error' });
    if (pathname === '/rpc' && response.ok) {
      const body = await response.json() as any;
      await remember(body.structuredContent);
      return Response.json(body, { status: response.status });
    }
    return response;
  } catch (e) { return Response.json({ detail: `Docs runtime unavailable: ${e}` }, { status: 502 }); }
  finally { activeRequests--; }
}
const scanFile = join(stateDir, 'device-discovery.json');
let deviceScan: DeviceScan = emptyDeviceScan();
try {
  const saved = JSON.parse(await readFile(scanFile, 'utf8')) as DeviceScan;
  if (Array.isArray(saved.roots) && Array.isArray(saved.warnings)) deviceScan = saved;
  if (deviceScan.phase === 'scanning') deviceScan.phase = 'interrupted';
} catch { /* A missing scan history starts with discovery on the first home visit. */ }
const scanAbort = new AbortController();
async function registerDevice() {
  if (deviceScan.phase === 'scanning' || closing || !active) return;
  const runtime = active;
  const initialRoots = new Set(registry.projects.map(p => p.docsRoot));
  const scan: DeviceScan = { ...emptyDeviceScan(), phase: 'scanning', roots: deviceSearchRoots(registry.workspaces), startedAt: new Date().toISOString() };
  deviceScan = scan;
  // Keep the same write authority throughout the scan and its registration requests.
  activeRequests++;
  requestRevision++;
  try {
    await writeFile(scanFile, JSON.stringify(scan), { mode: 0o600 });
    await scanDevice(scan, async workspace => {
      const response = await runtimeFetch(runtime, '/rpc', { workspace, name: 'docs_discover', arguments: {} });
      const result = await response.json() as any;
      const discovery = result.structuredContent;
      if (!response.ok || result.isError || !discovery?.ok) throw new Error(discovery?.detail ?? result.detail ?? 'Discovery failed');
      for (const warning of discovery.warnings ?? []) scanWarning(scan, warning);
      // Do not retain every Markdown-only directory as a registered workspace.
      if (discovery.projects.length) await remember(discovery);
      scan.added = registry.projects.filter(p => !initialRoots.has(p.docsRoot)).length;
    }, scanAbort.signal);
    scan.phase = 'complete';
  } catch (e) { scan.phase = scanAbort.signal.aborted ? 'interrupted' : 'failed'; scanWarning(scan, String(e)); }
  finally {
    scan.finishedAt = new Date().toISOString();
    try { await writeFile(scanFile, JSON.stringify(scan), { mode: 0o600 }); }
    catch (e) { scan.phase = 'failed'; scanWarning(scan, `Could not save scan history: ${e}`); }
    activeRequests--;
  }
}
type SocketData = { url: string; upstream?: WebSocket; pending: (string | Buffer)[] };
const handler = async (request: Request, host: Bun.Server<SocketData>): Promise<Response | undefined> => {
  const url = new URL(request.url);
  if (!localBrowserRequest(request)) return new Response('Forbidden origin', { status: 403 });
  const authenticated = request.headers.get('authorization') === `Bearer ${token}`;
  if (['/rpc', '/tools', '/health', '/shutdown'].includes(url.pathname) || /^\/projects\/[^/]+\/api\//.test(url.pathname)) {
    if (!authenticated) return new Response('Unauthorized', { status: 401 });
    if (url.pathname === '/health') {
      const runtimeHealth = active ? await (await runtimeFetch(active, '/health')).json() as any : {};
      return Response.json({ ...status(), tasks: runtimeHealth.tasks ?? 0, drafts: runtimeHealth.drafts ?? 0 });
    }
    if (url.pathname === '/shutdown') return Response.json({ stopped: false, reason: 'Managed by the background service; use the background stop command.' }, { status: 409 });
    return proxyRuntime(request, url.pathname);
  }
  if (url.pathname === '/api/status') return Response.json(status(), { headers: { 'cache-control': 'no-store' } });
  if (url.pathname === '/api/projects') return Response.json({ projects: registry.projects }, { headers: { 'cache-control': 'no-store' } });
  if (url.pathname === '/api/discovery') {
    if (request.method === 'GET') return Response.json(deviceScan, { headers: { 'cache-control': 'no-store' } });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, POST' } });
    // Browser mutations require an exact Origin; CLI callers use the existing bearer grant.
    if (!authenticated && request.headers.get('origin') !== url.origin) return new Response('Forbidden origin', { status: 403 });
    if (!active || closing) return Response.json({ detail: 'Docs is starting. Retry shortly.' }, { status: 503 });
    void registerDevice();
    return Response.json(deviceScan, { status: 202, headers: { 'cache-control': 'no-store' } });
  }
  if (url.pathname === '/') return new Response(directoryHtml(registry.projects, version), { headers: { 'content-type': 'text/html', 'cache-control': 'no-store' } });
  const project = projectRoute(url.pathname);
  if (project) {
    if (!registry.projects.some(p => p.id === project.id)) return new Response('Project is not registered.', { status: 404 });
    if (project.redirect) return Response.redirect(new URL(project.redirect, url), 307);
    if (project.apiPath) return proxyRuntime(request, project.apiPath);
    if (!viteUrl) return new Response('Viewer is starting.', { status: 503 });
    const response = await fetch(`${viteUrl}/__viewer/`);
    return new Response(await response.text(), { headers: { 'content-type': 'text/html', 'cache-control': 'no-store' } });
  }
  if (url.pathname.startsWith('/__viewer/') || url.pathname.startsWith('/@')) {
    if (!viteUrl) return new Response('Viewer is starting.', { status: 503 });
    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const upstream = new URL(url.pathname + url.search, viteUrl); upstream.protocol = 'ws:';
      if (host.upgrade(request, { data: { url: upstream.href, pending: [] } })) return;
      return new Response('Upgrade failed', { status: 400 });
    }
    const response = await fetch(new URL(url.pathname + url.search, viteUrl), { headers: { accept: request.headers.get('accept') ?? '*/*' }, signal: request.signal });
    return new Response(response.body, { status: response.status, headers: response.headers });
  }
  return new Response('Not found', { status: 404 });
};
const socketHandlers = {
  open(ws: Bun.ServerWebSocket<SocketData>) {
    const upstream = new WebSocket(ws.data.url, 'vite-hmr'); ws.data.upstream = upstream;
    upstream.addEventListener('open', () => { for (const message of ws.data.pending) upstream.send(message); ws.data.pending.length = 0; });
    upstream.addEventListener('message', event => { if (typeof event.data === 'string') ws.send(event.data); });
    upstream.addEventListener('close', () => ws.close());
    upstream.addEventListener('error', () => ws.close());
  },
  message(ws: Bun.ServerWebSocket<SocketData>, message: string | Buffer) { if (ws.data.upstream?.readyState === WebSocket.OPEN) ws.data.upstream.send(message); else ws.data.pending.push(message); },
  close(ws: Bun.ServerWebSocket<SocketData>) { ws.data.upstream?.close(); },
};
const server = Bun.serve<SocketData>({ hostname: '127.0.0.1', port: config.port, idleTimeout: 120, fetch: handler, websocket: socketHandlers });
let legacy: Bun.Server<SocketData> | undefined;
if (config.legacyPort && config.legacyPort !== server.port) {
  try { legacy = Bun.serve<SocketData>({ hostname: '127.0.0.1', port: config.legacyPort, idleTimeout: 120, fetch: handler, websocket: socketHandlers }); } catch (e) { console.error(`[docs] Legacy bridge endpoint unavailable: ${e}`); }
}
await rebuild();
if (!active) {
  try { const last = await Bun.file(join(stateDir, 'last-good-runtime.json')).json(); active = await startRuntime(last); buildState = 'build-failed-serving-previous'; } catch {}
}
if (!active) throw new Error(`No working Docs runtime: ${error}`);
async function startViewer() {
  const bundledNode = join(dirname(process.execPath), 'node');
  const node = existsSync(bundledNode) ? bundledNode : Bun.which('node');
  if (!node) throw new Error('Node is required for the Docs viewer');
  const entry = join(stateDir, 'viewer-current.mjs');
  await copyFile(join(packageRoot, 'src/background/viewer.mjs'), entry);
  viewer = Bun.spawn([node, entry], { cwd: config.sourceRoot, env: { ...process.env, CODECAINE_DOCS_SOURCE_ROOT: config.sourceRoot, CODECAINE_DOCS_PUBLIC_PORT: String(server.port) }, stdout: 'pipe', stderr: 'inherit' });
  const child = viewer;
  const reader = (child.stdout as ReadableStream<Uint8Array>).getReader();
  const timeout = setTimeout(() => { child.kill(); }, 30000);
  let buffer = '';
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) throw new Error('Viewer exited before ready');
      buffer += new TextDecoder().decode(part.value);
      for (const line of buffer.split('\n').slice(0, -1)) {
        let value: any; try { value = JSON.parse(line); } catch { continue; }
        if (value.ready && Number.isInteger(value.port)) {
          viteUrl = `http://127.0.0.1:${value.port}`;
          void (async () => { while (!(await reader.read()).done) {} })().catch(() => {});
          return;
        }
      }
      buffer = buffer.slice(buffer.lastIndexOf('\n') + 1);
    }
  } finally { clearTimeout(timeout); }
}
await startViewer();
for (const workspace of registry.workspaces) {
  const result = await (await runtimeFetch(active!, '/rpc', { workspace, name: 'docs_discover', arguments: {} })).json() as any;
  await remember(result.structuredContent);
}
await writeFile(join(stateDir, 'daemon.json'), JSON.stringify({ url: `http://127.0.0.1:${server.port}`, token, pid: process.pid, packageRoot, startedAt }), { mode: 0o600 });
console.log(JSON.stringify({ ready: true, port: server.port, build: active!.hash }));
let debounce: ReturnType<typeof setTimeout>;
const runtimeRoots = ['packages/docs-mcp/src', 'packages/docs-model/src', 'packages/docs-server/src', 'packages/docs-index/src'].map(p => join(config.sourceRoot, p));
runtimeRoots.push(join(coreRoot, 'canvas/packages/canvas/src'), join(coreRoot, 'sequence/packages/sequence/src'), join(coreRoot, 'annotations/src'));
let selfQueued = false;
let selfPending = false;
async function updateSupervisor() {
  if (selfQueued) return; selfQueued = true;
  try {
    if (activeRequests || busy || activating) return;
    if (active) {
      const health = await (await runtimeFetch(active, '/health')).json() as any;
      if (health.tasks > 0 || health.drafts > 0) { buildState = 'waiting-for-authoring-tasks'; return; }
    }
    const result = await Bun.build({ entrypoints: [join(packageRoot, 'src/background/supervisor.ts')], target: 'bun', format: 'esm' });
    if (!result.success) throw new Error(result.logs.map(String).join('\n'));
    // Requests may have started while building. Retry once the authority is idle.
    if (activeRequests) return;
    const requests = requestRevision;
    if (active) {
      const health = await (await runtimeFetch(active, '/health')).json() as any;
      if (health.tasks > 0 || health.drafts > 0) return;
    }
    if (activeRequests || requests !== requestRevision) return;
    closing = true;
    const current = join(stateDir, 'background-current.mjs');
    const temporary = current + '.tmp';
    await Bun.write(temporary, result.outputs[0]!);
    if (existsSync(current)) await copyFile(current, join(stateDir, 'background-previous.mjs'));
    await rename(temporary, current);
    buildState = 'restarting-service';
    closing = false;
    await shutdown(75);
  } catch (e) { closing = false; error = String(e); buildState = 'build-failed-serving-previous'; selfPending = false; }
  finally { selfQueued = false; }
}
for (const root of runtimeRoots) if (existsSync(root)) {
  const watcher = watch(root, { recursive: true }, (_, filename) => {
    const file = String(filename ?? '');
    if (!/\.(ts|tsx|json|mjs)$/.test(file) || /(^|\/)(__tests__|__fixtures__)\//.test(file) || /\.test\./.test(file)) return;
    clearTimeout(debounce);
    if (root.endsWith('docs-mcp/src') && file.startsWith('background/')) selfPending = true;
    debounce = setTimeout(() => { if (selfPending) void updateSupervisor(); else void rebuild(); }, 1000);
  }); watcher.on('error', e => console.error(e)); watchers.push(watcher);
}
const configFiles = [join(coreRoot, 'bun.lock'), join(config.sourceRoot, 'bun.lock'), join(config.sourceRoot, 'package.json'), join(webRoot, 'vite.config.ts')];
for await (const file of new Bun.Glob('packages/*/package.json').scan(config.sourceRoot)) configFiles.push(join(config.sourceRoot, file));
for (const product of ['canvas', 'sequence', 'annotations']) {
  for await (const file of new Bun.Glob('{package.json,packages/*/package.json}').scan(join(coreRoot, product))) configFiles.push(join(coreRoot, product, file));
}
for (const file of configFiles.filter(existsSync)) {
  const watcher = watch(file, () => { selfPending = true; clearTimeout(debounce); debounce = setTimeout(() => void updateSupervisor(), 1000); }); watchers.push(watcher);
}
const maintenance = setInterval(() => {
  if (viewer?.exitCode !== null && viewer?.exitCode !== undefined && viteUrl) { viteUrl = ''; void startViewer().catch(e => { error = String(e); }); }
  if (selfPending) void updateSupervisor();
  if (candidate) void activate().catch(e => { error = String(e); });
  if (active?.process.exitCode !== null && active?.process.exitCode !== undefined && !busy) {
    const crashed = active;
    active = undefined; busy = true;
    void startRuntime(previousBuild ?? crashed).then(runtime => { active = runtime; buildState = 'recovered-after-runtime-exit'; }).catch(e => { error = String(e); }).finally(() => { busy = false; if (!active) void rebuild(); });
  }
}, 1000);
async function shutdown(code = 0) {
  if (closing) return; closing = true;
  clearInterval(maintenance); clearTimeout(debounce);
  for (const watcher of watchers) watcher.close();
  scanAbort.abort();
  // Let requests that already entered the write authority finish.
  for (let i = 0; activeRequests && i < 100; i++) await Bun.sleep(100);
  viewer?.kill(); active?.process.kill(); candidate?.process.kill();
  server.stop(true); legacy?.stop(true); process.exit(code);
}
process.on('SIGTERM', () => void shutdown()); process.on('SIGINT', () => void shutdown());
