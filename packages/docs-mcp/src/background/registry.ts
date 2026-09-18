import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DocsProject } from '../discovery';

export type Registry = { schemaVersion: 1; workspaces: string[]; projects: DocsProject[] };
export async function readRegistry(file: string, workspace: string): Promise<Registry> {
  try {
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (value.schemaVersion !== 1 || !Array.isArray(value.workspaces) || !Array.isArray(value.projects)) throw new Error('Invalid Docs project registry');
    return value;
  } catch (error: any) {
    if (error.code !== 'ENOENT') throw error;
    return { schemaVersion: 1, workspaces: [workspace], projects: [] };
  }
}
export async function writeRegistry(file: string, registry: Registry) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(registry, null, 2) + '\n', { mode: 0o600 });
  await rename(temporary, file);
}
export function mergeDiscovery(registry: Registry, workspace: string, projects: DocsProject[]): Registry {
  const next = new Map(registry.projects.map(p => [p.docsRoot, p]));
  for (const p of projects) next.set(p.docsRoot, { ...p, id: next.get(p.docsRoot)?.id ?? p.id });
  return { schemaVersion: 1, workspaces: [...new Set([...registry.workspaces, workspace])], projects: [...next.values()] };
}
export function projectRoute(pathname: string): { id: string; apiPath?: string; redirect?: string } | null {
  const match = pathname.match(/^\/projects\/([a-z0-9-]+)\/docs(\/.*)?$/);
  if (!match) return null;
  if (!match[2]) return { id: match[1]!, redirect: `${pathname}/` };
  return { id: match[1]!, ...(match[2].startsWith('/api/') ? { apiPath: `/projects/${match[1]}/api/${match[2].slice(5)}` } : {}) };
}
export function localBrowserRequest(request: Request): boolean {
  const url = new URL(request.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return false;
  const origin = request.headers.get('origin');
  return (!origin || origin === url.origin) && !['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site') ?? '');
}
