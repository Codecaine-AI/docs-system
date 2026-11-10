import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { realpath } from 'node:fs/promises';

/** Connect ordinary serve commands to the installed service without a reverse package dependency. */
export async function centralProjectUrl(docsRoot: string): Promise<string | null> {
  const directory = process.env.CODECAINE_DOCS_STATE_DIR ?? join(homedir(), '.local/state/codecaine-docs');
  if (!await Bun.file(join(directory, 'background.json')).exists()) return null;
  const state = await Bun.file(join(directory, 'daemon.json')).json();
  const origin = new URL(state.url);
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1') throw new Error('Invalid local Docs service address');
  const headers = { authorization: `Bearer ${state.token}`, 'content-type': 'application/json' };
  const health = await fetch(new URL('/health', origin), { headers, signal: AbortSignal.timeout(3000) });
  if (!health.ok || !(await health.json() as any).central) throw new Error('Start the installed Docs background service before opening this project.');
  const canonical = await realpath(docsRoot);
  const response = await fetch(new URL('/rpc', origin), { method: 'POST', headers, body: JSON.stringify({ workspace: dirname(canonical), name: 'docs_capabilities', arguments: {} }) });
  const result = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(`Docs registration failed (${response.status}): ${result.detail ?? 'no detail'}`);
  if (result.isError) throw new Error(result.structuredContent?.detail ?? 'Docs registration failed');
  // docs_capabilities registered the workspace's projects. The registry lists each one with its docs root.
  const { projects } = await (await fetch(new URL('/api/projects', origin), { headers })).json() as { projects: { id: string; docsRoot: string }[] };
  const project = projects.find(p => p.docsRoot === canonical);
  if (!project) throw new Error(`No normalized Docs corpus discovered at ${canonical}. Migrate it or configure its project docsRoot first.`);
  return new URL(`/projects/${encodeURIComponent(project.id)}/docs/`, origin).href;
}
