/** Serve the design-system package the home page links, at /@codecaine-ai/design-system/<package path>. */
import { realpathSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative } from 'node:path';

export const DESIGN_SYSTEM_PREFIX = '/@codecaine-ai/design-system/';
/** Package paths under the prefix: the manifest and the folders its exports reach. */
const SERVED = ['package.json', 'css/', 'fonts/', 'dist/'];
const TYPES: Record<string, string> = { '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8', '.ts': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml' };
const notFound = () => new Response('Not found', { status: 404 });

/** The real folder of the design-system package that an import from `fromDir` resolves. */
export function designSystemPackage(fromDir: string) {
  return realpathSync(dirname(Bun.resolveSync('@codecaine-ai/design-system/package.json', fromDir)));
}

/**
 * Answers GET and HEAD under DESIGN_SYSTEM_PREFIX with the package's own bytes, from the package `fromDir`
 * resolves (the supervisor passes the docs-mcp source folder: its bundle runs from the state folder).
 * Only SERVED paths answer; dot segments, dotfiles and anything whose real path leaves the package are 404.
 * Files are read per request, so a design-system rebuild reaches the page on its next load.
 */
export function designSystemAssets(fromDir: string) {
  let root: string | undefined;
  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith(DESIGN_SYSTEM_PREFIX)) return notFound();
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    let path: string;
    try { path = decodeURIComponent(pathname.slice(DESIGN_SYSTEM_PREFIX.length)); } catch { return notFound(); }
    if (!SERVED.some(served => served.endsWith('/') ? path.startsWith(served) : path === served)) return notFound();
    if (path.includes('\\') || path.split('/').some(part => !part || part.startsWith('.'))) return notFound();
    try { root ??= designSystemPackage(fromDir); } catch { return new Response('The design-system package does not resolve.', { status: 503 }); }
    let file: string;
    try { file = realpathSync(join(root, path)); } catch { return notFound(); }
    const inside = relative(root, file);
    if (inside.startsWith('..') || isAbsolute(inside) || !statSync(file).isFile()) return notFound();
    const headers = { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' };
    return new Response(request.method === 'HEAD' ? null : Bun.file(file), { headers });
  };
}
