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
  const response = await fetch(new URL('/rpc', origin), { method: 'POST', headers, body: JSON.stringify({ workspace: dirname(canonical), name: 'docs_discover', arguments: {} }) });
  const result = await response.json() as any;
  if (result.isError) throw new Error(result.structuredContent?.detail ?? 'Docs registration failed');
  const project = result.structuredContent.projects.find((p: any) => p.docsRoot === canonical);
  if (!project) throw new Error(`No normalized Docs corpus discovered at ${canonical}. Migrate it or configure its project docsRoot first.`);
  return new URL(`/projects/${encodeURIComponent(project.id)}/docs/`, origin).href;
}
