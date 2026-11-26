// Remote mode: the docs tools call a docs server on another machine and never start a local one for it.
// Every setting is unset by default, and then the tools use the local daemon as before.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { inside } from './paths';

export interface RemoteSettings {
 /** CODECAINE_DOCS_REMOTE_URL: the base URL of the remote docs server. A base path is kept. */
 url: string;
 /** CODECAINE_DOCS_REMOTE_TOKEN_FILE: a file that holds the bearer token to send. Unset: send none (a gateway adds it). */
 token?: string;
 /** CODECAINE_DOCS_REMOTE_PATH_MAP: local=remote prefix pairs, separated by the path list delimiter (":" on macOS and Linux). */
 pathMap: [local: string, remote: string][];
 /** CODECAINE_DOCS_REMOTE_WORKSPACE: the remote workspace of a call with no mapped path. */
 workspace?: string;
 /** CODECAINE_DOCS_REMOTE_PROJECTS: project ids that use the remote route (hybrid mode). Empty: every call uses it. */
 projects: string[];
}

const list = (value: string | undefined) => (value ?? '').split(delimiter).map(s => s.trim()).filter(Boolean);

/** The remote settings, or null when CODECAINE_DOCS_REMOTE_URL is unset. Read at call time. */
export function remoteSettings(env: NodeJS.ProcessEnv = process.env): RemoteSettings | null {
 const raw = env.CODECAINE_DOCS_REMOTE_URL?.trim();
 if (!raw) return null;
 const url = new URL(raw);
 if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('CODECAINE_DOCS_REMOTE_URL must be an http or https URL');
 let token: string | undefined;
 if (env.CODECAINE_DOCS_REMOTE_TOKEN_FILE) {
  token = readFileSync(env.CODECAINE_DOCS_REMOTE_TOKEN_FILE, 'utf8').trim();
  if (!token) throw new Error('CODECAINE_DOCS_REMOTE_TOKEN_FILE names an empty file');
 }
 const pathMap = list(env.CODECAINE_DOCS_REMOTE_PATH_MAP).map(pair => {
  const at = pair.indexOf('=');
  const local = pair.slice(0, at), remote = pair.slice(at + 1);
  if (at < 1 || !isAbsolute(local) || !isAbsolute(remote)) throw new Error(`CODECAINE_DOCS_REMOTE_PATH_MAP entry "${pair}" must be /local/path=/remote/path`);
  return [resolve(local), resolve(remote)] as [string, string];
 });
 const workspace = env.CODECAINE_DOCS_REMOTE_WORKSPACE?.trim() || undefined;
 if (workspace && !isAbsolute(workspace)) throw new Error('CODECAINE_DOCS_REMOTE_WORKSPACE must be an absolute path');
 return { url: url.href, token, pathMap, workspace: workspace && resolve(workspace), projects: list(env.CODECAINE_DOCS_REMOTE_PROJECTS?.replaceAll(',', delimiter)) };
}

/** An endpoint below a base URL, keeping the base path: https://host/docs + /rpc is https://host/docs/rpc. */
export function endpoint(base: string, pathname: string): URL {
 const url = new URL(base);
 if (!url.pathname.endsWith('/')) url.pathname += '/';
 return new URL(pathname.replace(/^\/+/, ''), url);
}

/** The remote path of a local path under a mapped prefix (the longest prefix wins), or undefined. */
export function mapPath(settings: RemoteSettings, path: string): string | undefined {
 const absolute = resolve(path);
 const match = settings.pathMap.filter(([local]) => inside(local, absolute)).sort((a, b) => b[0].length - a[0].length)[0];
 return match ? join(match[1], relative(match[0], absolute)) : undefined;
}

export type Route = { remote: boolean; workspace: string };

/** A workspace that routes remote: its mapped path, or itself when it is already a remote path. */
function remoteWorkspace(settings: RemoteSettings, workspace: string): string | undefined {
 const mapped = mapPath(settings, workspace);
 if (mapped) return mapped;
 const remotePath = settings.pathMap.some(([, remote]) => inside(remote, workspace)) || (settings.workspace !== undefined && inside(settings.workspace, workspace));
 return remotePath ? workspace : undefined;
}

/**
 * The route of one call. `workspace` is the current workspace, `localWorkspace` the client's own one (default: the same).
 * - A call with a remembered task route follows its task.
 * - A named workspace (the docs_capabilities argument) routes by that path.
 * - In hybrid mode (a remote project list), a call that names a listed project goes remote, a call that names another
 *   project stays local on the local workspace, and a call with no project routes by the current workspace.
 * - With no remote project list, every call is remote.
 * A remote call sends a mapped path, a remote path, or the default remote workspace.
 */
export function routeCall(settings: RemoteSettings | null, workspace: string, args: Record<string, unknown> = {}, options: { localWorkspace?: string; known?: Route } = {}): Route {
 const current = resolve(workspace), local = resolve(options.localWorkspace ?? workspace);
 if (!settings) return { remote: false, workspace: current };
 if (options.known) return options.known;
 const hybrid = settings.projects.length > 0;
 if (typeof args.workspace === 'string') {
  const named = resolve(args.workspace);
  const remote = remoteWorkspace(settings, named);
  if (remote) return { remote: true, workspace: remote };
  return hybrid ? { remote: false, workspace: named } : { remote: true, workspace: settings.workspace ?? named };
 }
 const routed = remoteWorkspace(settings, current);
 if (hybrid && typeof args.project === 'string') {
  if (!settings.projects.includes(args.project)) return { remote: false, workspace: local };
  return { remote: true, workspace: routed ?? settings.workspace ?? current };
 }
 if (routed) return { remote: true, workspace: routed };
 return hybrid ? { remote: false, workspace: current } : { remote: true, workspace: settings.workspace ?? current };
}

/** The arguments of a call: a docs_capabilities workspace goes as its routed path, and the docs_begin project hint stays on the client. */
export function routedArguments(name: string, route: Route, args: Record<string, unknown>): Record<string, unknown> {
 let out = args;
 if (typeof out.workspace === 'string') out = { ...out, workspace: route.workspace };
 if (name === 'docs_begin' && 'project' in out) { const { project: _hint, ...rest } = out; out = rest; }
 return out;
}

/** Result fields that name a file on the server that answered. A client on another machine cannot open them. */
const SERVER_FILE_FIELDS = ['svg_path'];

/**
 * A tool reply as a client sees it. A reply from the remote server drops the fields that name a server file,
 * and keeps its image content. A local reply stays as it is.
 */
export function clientReply<T>(result: T, route: Route): T {
 const reply = result as { structuredContent?: Record<string, unknown>; content?: { type: string }[] };
 const data = reply?.structuredContent;
 if (!route.remote || !data || !SERVER_FILE_FIELDS.some((field) => field in data)) return result;
 const kept = Object.fromEntries(Object.entries(data).filter(([field]) => !SERVER_FILE_FIELDS.includes(field)));
 const content = [{ type: 'text', text: JSON.stringify(kept) }, ...(reply.content ?? []).filter((item) => item.type !== 'text')];
 return { ...reply, structuredContent: kept, content } as T;
}

/**
 * Task routes: the route of each docs_begin, so docs_guidance and every later call with its task_id reach the same
 * server. The MCP bridge keeps them in memory. The CLI runs one process per call, so it keeps them in a file.
 */
export function taskRoutes(file?: string) {
 const routes = new Map<string, Route>();
 const load = () => { if (!file) return; try { for (const [id, route] of Object.entries(JSON.parse(readFileSync(file, 'utf8')) as Record<string, Route>)) routes.set(id, route); } catch {} };
 load();
 let latest: Route | undefined;
 return {
  get: (id: unknown) => typeof id === 'string' ? routes.get(id) : undefined,
  /** The route of the most recent task of this process, for a guidance read with no task_id. */
  latest: () => latest,
  set(id: string, route: Route) {
   routes.set(id, route); latest = route;
   if (!file) return;
   const kept = [...routes].slice(-200);
   mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
   writeFileSync(file, JSON.stringify(Object.fromEntries(kept)), { mode: 0o600 });
  },
 };
}
