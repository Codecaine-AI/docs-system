/** Serve the design-system package the home page links, at /@codecaine-ai/design-system/<package path>. */
import { realpathSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, sep } from 'node:path';

export const DESIGN_SYSTEM_PREFIX = '/@codecaine-ai/design-system/';
/** Package paths under the prefix: the manifest and the folders its exports reach. */
const SERVED = ['package.json', 'css/', 'fonts/', 'dist/'];
/** The page needs stylesheets and fonts; anything that could run on this origin (html, js, svg) goes out as bytes. */
const TYPES: Record<string, string> = { '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const respond = (body: BodyInit | null, status: number, headers: Record<string, string> = {}) => new Response(body, { status, headers: { ...headers, 'x-content-type-options': 'nosniff' } });
const notFound = () => respond('Not found', 404);
/** A package-relative path (/-separated) under SERVED, with no empty segment, dot segment or dotfile. */
const servable = (path: string) => SERVED.some(served => served.endsWith('/') ? path.startsWith(served) : path === served) && !path.includes('\\') && !path.split('/').some(part => !part || part.startsWith('.'));

/** The real folder of the design-system package that an import from `fromDir` resolves. */
export function designSystemPackage(fromDir: string) {
  return realpathSync(dirname(Bun.resolveSync('@codecaine-ai/design-system/package.json', fromDir)));
}

/**
 * Answers GET and HEAD under DESIGN_SYSTEM_PREFIX with the package's own bytes, from the package `fromDir`
 * resolves (the supervisor passes the docs-mcp source folder: its bundle runs from the state folder).
 * Both the requested path and the file's real path must be SERVED paths inside the package, with no dot
 * segment or dotfile, so a symlink cannot reach another folder; everything else is 404.
 * Files are read per request, so a design-system rebuild reaches the page on its next load.
 */
export function designSystemAssets(fromDir: string) {
  let root: string | undefined;
  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith(DESIGN_SYSTEM_PREFIX)) return notFound();
    if (request.method !== 'GET' && request.method !== 'HEAD') return respond('Method not allowed', 405, { allow: 'GET, HEAD' });
    let path: string;
    try { path = decodeURIComponent(pathname.slice(DESIGN_SYSTEM_PREFIX.length)); } catch { return notFound(); }
    if (!servable(path)) return notFound();
    try { root ??= designSystemPackage(fromDir); } catch { return respond('The design-system package does not resolve.', 503); }
    let file: string;
    try { file = realpathSync(join(root, path)); } catch { return notFound(); }
    const inside = relative(root, file);
    if (isAbsolute(inside) || !servable(inside.split(sep).join('/')) || !statSync(file).isFile()) return notFound();
    const headers = { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' };
    return respond(request.method === 'HEAD' ? null : Bun.file(file), 200, headers);
  };
}
