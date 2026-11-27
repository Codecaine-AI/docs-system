// The root marker and the one read-only guard of a docs server.
//
// A knowledge root carries `.knowledge-root.json` at its top: kind "knowledge-root", an id, and a role (live, mirror
// or backup). Settings, all unset by default:
//  - CODECAINE_DOCS_REQUIRED_ROOTS: root paths, separated by the path list delimiter. A project under a listed root
//    opens only when that root has a valid marker with role live or mirror. The server refuses to start (exit 78)
//    when a listed root has no valid marker.
//  - CODECAINE_DOCS_ROOT_ID: the marker id that each listed root must carry. Unlisted markers are not checked for it.
//  - CODECAINE_DOCS_READ_ONLY=1: every project opens read-only.
//  - CODECAINE_DOCS_CENTRAL_SITE: the central site that a read-only refusal names, such as a host name.
// The nearest marker at or above a docs root always counts. When no listed root holds it (no listed root, or a copy
// deeper inside a listed root), role mirror opens the project read-only, and role live or backup, or a marker that is
// not valid, refuses it, so this server can never write a live root or a copy by accident.
import { readFileSync, statSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { inside, realOrResolved } from './paths';

export const ROOT_MARKER = '.knowledge-root.json';
/** The exit code of a start check that fails (EX_CONFIG). */
export const ROOT_MARKER_EXIT = 78;
export type RootRole = 'live' | 'mirror' | 'backup';
export type RootMarker = { kind: 'knowledge-root'; id: string; role: RootRole; name?: string; created?: string };
/** open false: the server refuses the project. readOnly: each write is refused with 403. */
export type RootAccess = { open: false; reason: string } | { open: true; readOnly: boolean; reason?: string };

const ROLES: RootRole[] = ['live', 'mirror', 'backup'];
export const requiredRoots = (env: NodeJS.ProcessEnv = process.env) => (env.CODECAINE_DOCS_REQUIRED_ROOTS ?? '').split(delimiter).map(s => s.trim()).filter(Boolean).map(realOrResolved);
export const readOnlySetting = (env: NodeJS.ProcessEnv = process.env) => env.CODECAINE_DOCS_READ_ONLY === '1';

/** The marker in a folder: null when the folder has no marker file, else the marker or the reason it is not valid. */
export function readRootMarker(folder: string, env: NodeJS.ProcessEnv = process.env, checkId = true): { marker: RootMarker } | { problem: string } | null {
 const file = join(folder, ROOT_MARKER);
 let text: string;
 try { text = readFileSync(file, 'utf8'); } catch (error: any) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null; return { problem: `${file} cannot be read: ${error.code ?? error}` }; }
 let value: any;
 try { value = JSON.parse(text); } catch { return { problem: `${file} is not valid JSON` }; }
 if (value?.kind !== 'knowledge-root') return { problem: `${file} must have kind "knowledge-root"` };
 if (typeof value.id !== 'string' || !value.id) return { problem: `${file} has no id` };
 if (!ROLES.includes(value.role)) return { problem: `${file} must have role live, mirror or backup` };
 const expected = checkId ? env.CODECAINE_DOCS_ROOT_ID?.trim() : undefined;
 if (expected && value.id !== expected) return { problem: `${file} has id ${value.id}, not CODECAINE_DOCS_ROOT_ID ${expected}` };
 return { marker: value as RootMarker };
}

/** The start check: one problem for each listed root that is missing or has no valid marker with role live or mirror. */
export function rootMarkerProblems(env: NodeJS.ProcessEnv = process.env): string[] {
 const problems: string[] = [];
 for (const root of requiredRoots(env)) {
  let folder = false;
  try { folder = statSync(root).isDirectory(); } catch {}
  if (!folder) { problems.push(`Required root ${root} is missing`); continue; }
  const found = readRootMarker(root, env);
  if (!found) problems.push(`Required root ${root} has no ${ROOT_MARKER}`);
  else if ('problem' in found) problems.push(found.problem);
  else if (found.marker.role === 'backup') problems.push(`Required root ${root} is a backup; no docs server opens a backup`);
 }
 return problems;
}

/** Exit 78 before the server takes a lock or writes a file when the start check fails. */
export function exitOnRootMarkerProblems(env: NodeJS.ProcessEnv = process.env) {
 const problems = rootMarkerProblems(env);
 if (!problems.length) return;
 for (const problem of problems) console.error(`[docs] ${problem}`);
 process.exit(ROOT_MARKER_EXIT);
}

/** The nearest marker at or above a folder, with the folder that holds it. */
function nearestMarker(docsRoot: string, env: NodeJS.ProcessEnv) {
 for (let folder = docsRoot; ; folder = dirname(folder)) {
  const found = readRootMarker(folder, env, false);
  if (found) return { folder, found };
  if (dirname(folder) === folder) return null;
 }
}

/** How this server may open a docs root, read at each call so a lost or changed marker counts at once. */
export function rootAccess(docsRoot: string, env: NodeJS.ProcessEnv = process.env): RootAccess {
 const real = realOrResolved(docsRoot);
 const setting = readOnlySetting(env);
 const writable: RootAccess = setting ? { open: true, readOnly: true, reason: 'setting' } : { open: true, readOnly: false };
 const listed = requiredRoots(env).filter(root => inside(root, real)).sort((a, b) => b.length - a.length)[0];
 const nearest = nearestMarker(real, env);
 if (listed && nearest?.folder === listed) {
  // The listed root's own marker, with the id check.
  const found = readRootMarker(listed, env)!;
  if ('problem' in found) return { open: false, reason: found.problem };
  if (found.marker.role === 'backup') return { open: false, reason: `${listed} is a backup copy; no docs server opens it` };
  return found.marker.role === 'mirror' ? { open: true, readOnly: true, reason: 'mirror' } : writable;
 }
 if (listed && !(nearest && inside(listed, nearest.folder))) return { open: false, reason: `${listed} is a required root and has no ${ROOT_MARKER}` };
 if (!nearest) return writable;
 // A marker that no listed root holds: no root of it is named, so only a mirror opens, read-only.
 const { folder, found } = nearest;
 if ('problem' in found) return { open: false, reason: found.problem };
 if (found.marker.role === 'backup') return { open: false, reason: `${folder} is a backup copy; no docs server opens it` };
 if (found.marker.role === 'live') return { open: false, reason: `${folder} is a live root, and CODECAINE_DOCS_REQUIRED_ROOTS does not name it` };
 return { open: true, readOnly: true, reason: 'mirror' };
}

/** The refusal text of a write under the read-only guard. */
export function readOnlyMessage(access: RootAccess, env: NodeJS.ProcessEnv = process.env): string {
 const site = env.CODECAINE_DOCS_CENTRAL_SITE?.trim();
 const where = site ? ` Make the change through ${/^https?:\/\//.test(site) ? site : `https://${site}`}.` : ' Make the change through the central docs server.';
 if (!access.open) return `This docs server refuses the project: ${access.reason}.`;
 if (access.reason === 'mirror') return `This copy of the knowledge base is a read-only mirror, so this docs server refuses each write.${where}`;
 return `This docs server is read-only (CODECAINE_DOCS_READ_ONLY=1), so it refuses each write.${where}`;
}

/** The refusal text of a write to a root that lost its marker, or whose marker changed, since it opened (503). */
export function lostRootMessage(access: RootAccess & { open: false }): string {
 return `The docs root is lost or changed: ${access.reason}. This docs server refuses each write until the root marker is back.`;
}

/** A write to a closed root answers 503 with lostRootMessage. A read-only root answers 403 with readOnlyMessage. */
export function writeRefusal(access: RootAccess, env: NodeJS.ProcessEnv = process.env): { status: 503 | 403; detail: string } | null {
 if (!access.open) return { status: 503, detail: lostRootMessage(access) };
 return access.readOnly ? { status: 403, detail: readOnlyMessage(access, env) } : null;
}
