import { createInteractionService } from './service';
import { loadGuidance } from './guidance';
import type { DocsProject } from './discovery';
import { handlePdfExport } from '@codecaine-ai/docs-workbench/pdf-export';

const token = process.env.CODECAINE_DOCS_RUNTIME_TOKEN!;
const supervisorPid = process.ppid;
setInterval(() => { try { process.kill(supervisorPid, 0); } catch { process.exit(0); } }, 2000).unref();
if (!token) throw new Error('Managed runtime requires a private token');
const registry = await Bun.file(process.env.CODECAINE_DOCS_REGISTRY!).json() as { workspaces: string[]; projects: DocsProject[] };
const service = createInteractionService({ managed: true, watchFs: true, projectIds: new Map(registry.projects.map(p => [p.docsRoot, p.id])) });
for (const workspace of registry.workspaces) {
  try { await service.discover(workspace); } catch (error) { console.error(`Unavailable workspace ${workspace}: ${error}`); }
}
await loadGuidance();
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, idleTimeout: 120, async fetch(request) {
  if (request.headers.get('authorization') !== `Bearer ${token}`) return new Response('Unauthorized', { status: 401 });
  const url = new URL(request.url);
  try {
    if (url.pathname === '/health') return Response.json({ service: 'codecaine-docs-runtime', build: process.env.CODECAINE_DOCS_BUILD, ...service.stats() });
    if (url.pathname === '/tools') return Response.json({ tools: service.listTools() });
    if (url.pathname === '/rpc' && request.method === 'POST') {
      const body = await request.json() as any;
      return Response.json(await service.call(body.workspace, body.name, body.arguments ?? {}));
    }
    const match = url.pathname.match(/^\/projects\/([^/]+)\/api(?:\/|$)/);
    if (match) {
      const project = service.project(match[1]!);
      if (!project) return Response.json({ detail: 'Unknown project; register its workspace first.' }, { status: 404 });
      if (url.pathname.endsWith('/api/export-pdf')) return handlePdfExport(request);
      if (url.pathname.endsWith('/api/serve-config')) return Response.json({ themeLocked: false });
      if (url.pathname.endsWith('/api/lab-config')) return Response.json({ kernelUrl: 'http://127.0.0.1:4840', corpus: project.name });
      return service.uiRequest(match[1]!, request);
    }
    return new Response('Not found', { status: 404 });
  } catch (error) { return Response.json({ detail: String(error) }, { status: 500 }); }
} });
console.log(JSON.stringify({ ready: true, port: server.port }));
process.on('SIGTERM', () => { service.close(); server.stop(true); process.exit(0); });
