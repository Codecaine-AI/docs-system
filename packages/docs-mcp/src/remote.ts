// Remote mode: the docs tools call a docs server on another machine and never start a local one.
// Every setting is unset by default, and then the tools use the local daemon as before.
import { readFileSync } from 'node:fs';
import { delimiter, isAbsolute, relative, resolve, sep } from 'node:path';

export interface RemoteSettings {
 /** CODECAINE_DOCS_REMOTE_URL: the base URL of the remote docs server. */
 url: string;
 /** CODECAINE_DOCS_REMOTE_TOKEN_FILE: a file that holds the bearer token to send. Unset: send none (a gateway adds it). */
 token?: string;
 /** CODECAINE_DOCS_REMOTE_PATH_MAP: local=remote prefix pairs, separated by the path list delimiter (":" on macOS and Linux). */
 pathMap: [local: string, remote: string][];
 /** CODECAINE_DOCS_REMOTE_WORKSPACE: the remote workspace of a call with no mapped path. */
 workspace?: string;
 /** CODECAINE_DOCS_REMOTE_PROJECTS: project ids that use the remote route. Empty: every call uses it. */
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
 return { url: url.href.replace(/\/$/, ''), token, pathMap, workspace, projects: list(env.CODECAINE_DOCS_REMOTE_PROJECTS?.replaceAll(',', delimiter)) };
}

const under = (path: string, prefix: string) => { const rel = relative(prefix, path); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); };

/** The remote path of a local path under a mapped prefix (the longest prefix wins), or undefined. */
export function mapPath(settings: RemoteSettings, path: string): string | undefined {
 const absolute = resolve(path);
 const match = settings.pathMap.filter(([local]) => under(absolute, local)).sort((a, b) => b[0].length - a[0].length)[0];
 if (!match) return undefined;
 const rest = relative(match[0], absolute);
 return rest ? `${match[1]}${sep}${rest}` : match[1];
}

export type Route = { remote: true; workspace: string } | { remote: false; workspace: string };

/**
 * The route of one call. Remote: a workspace under a mapped local prefix (sent as its remote path), a workspace that is
 * already a remote path, or a call that names a remote project (sent with the default remote workspace). With no
 * remote projects set, every call is remote. Every other call keeps the local daemon and its local workspace.
 */
export function routeCall(settings: RemoteSettings | null, workspace: string, args: Record<string, unknown> = {}): Route {
 const local = resolve(workspace);
 if (!settings) return { remote: false, workspace: local };
 const named = typeof args.workspace === 'string' ? args.workspace : undefined;
 const target = named ?? local;
 const mapped = mapPath(settings, target);
 if (mapped) return { remote: true, workspace: mapped };
 const remotePath = settings.pathMap.some(([, remote]) => under(target, remote)) || (settings.workspace !== undefined && under(target, settings.workspace));
 if (remotePath) return { remote: true, workspace: target };
 const remoteProject = typeof args.project === 'string' && settings.projects.includes(args.project);
 if (remoteProject || settings.projects.length === 0) {
  if (named !== undefined && !settings.workspace) return { remote: true, workspace: named };
  return { remote: true, workspace: settings.workspace ?? local };
 }
 return { remote: false, workspace: local };
}

/** The arguments of a remote call: a docs_capabilities workspace argument goes as its remote path. */
export function remoteArguments(route: Route, args: Record<string, unknown>): Record<string, unknown> {
 return route.remote && typeof args.workspace === 'string' ? { ...args, workspace: route.workspace } : args;
}
