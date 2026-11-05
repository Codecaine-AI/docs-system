import { createInteractionService } from './service';
import { createRpcRecorder, serveRpc } from './action-record';
import { ledgerStats, textMeasureReady } from '@codecaine-ai/docs-server';
import { loadGuidance } from './guidance';
import { memoryReport, startMemoryLog } from './runtime-health';
import type { DocsProject } from './discovery';
import { handlePdfExport } from '@codecaine-ai/docs-workbench/pdf-export';
import { dirname, join, resolve } from 'node:path';

const token = process.env.CODECAINE_DOCS_RUNTIME_TOKEN!;
const supervisorPid = process.ppid;
setInterval(() => { try { process.kill(supervisorPid, 0); } catch { process.exit(0); } }, 2000).unref();
if (!token) throw new Error('Managed runtime requires a private token');
const registry = await Bun.file(process.env.CODECAINE_DOCS_REGISTRY!).json() as { workspaces: string[]; projects: DocsProject[] };
// One shared global theme for every project this runtime serves: the
// supervisor passes CODECAINE_DOCS_GLOBAL_THEMES; older supervisors only pass
// the registry, which lives in the state directory, so derive it from there.
const globalThemesRoot = resolve(process.env.CODECAINE_DOCS_GLOBAL_THEMES || join(dirname(process.env.CODECAINE_DOCS_REGISTRY!), 'themes'));
// The central code-theme folder sits beside it: <state dir>/code-themes.
const codeThemesRoot = resolve(process.env.CODECAINE_DOCS_CODE_THEMES || join(dirname(process.env.CODECAINE_DOCS_REGISTRY!), 'code-themes'));
// Layout lints measure with text-measure's exact HarfBuzz backend: load it before serving (health reports it as textMeasure).
await textMeasureReady();
const service = createInteractionService({ managed: true, watchFs: true, globalThemesRoot, codeThemesRoot, projectIds: new Map(registry.projects.map(p => [p.docsRoot, p.id])), registryFile: process.env.CODECAINE_DOCS_REGISTRY! });
for (const workspace of registry.workspaces) {
  try { await service.discover(workspace); } catch (error) { console.error(`Unavailable workspace ${workspace}: ${error}`); }
}
await loadGuidance();
const record = createRpcRecorder();
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, idleTimeout: 120, async fetch(request) {
  if (request.headers.get('authorization') !== `Bearer ${token}`) return new Response('Unauthorized', { status: 401 });
  const url = new URL(request.url);
  try {
    if (url.pathname === '/health') {
      // newestTaskUseMs: ms since the most recent authoring-task call (null without tasks). patches: undo-ledger counts.
      // memory and jscHeapSize: process.memoryUsage() and JavaScriptCore's heap size in bytes (runtime-health.ts).
      const stats: ReturnType<typeof service.stats> & { newestTaskUseMs?: number | null } = service.stats();
      return Response.json({ service: 'codecaine-docs-runtime', build: process.env.CODECAINE_DOCS_BUILD, ...stats, newestTaskUseMs: stats.newestTaskUseMs ?? null, patches: ledgerStats(), ...memoryReport() });
    }
    if (url.pathname === '/tools') return Response.json({ tools: service.listTools() });
    if (url.pathname === '/rpc' && request.method === 'POST') {
      const body = await request.json() as any;
      return Response.json(await serveRpc(service, record, body));
    }
    const match = url.pathname.match(/^\/projects\/([^/]+)\/api(?:\/|$)/);
    if (match) {
      const project = service.project(match[1]!);
      if (!project) return Response.json({ detail: 'Unknown project; register its workspace first.' }, { status: 404 });
      if (url.pathname.endsWith('/api/export-pdf')) return handlePdfExport(request);
      if (url.pathname.endsWith('/api/serve-config')) return Response.json({ themeLocked: false, globalTheme: true });
      return service.uiRequest(match[1]!, request);
    }
    return new Response('Not found', { status: 404 });
  } catch (error) { return Response.json({ detail: String(error) }, { status: 500 }); }
} });
console.log(JSON.stringify({ ready: true, port: server.port }));
// One memory line every 10 minutes in the supervisor's background.log.
startMemoryLog();
process.on('SIGTERM', () => { service.close(); server.stop(true); process.exit(0); });
