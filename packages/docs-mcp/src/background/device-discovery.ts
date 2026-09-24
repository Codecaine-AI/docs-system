/** Enumerate local corpus candidates without rewriting them. Registration stays in the shared runtime. */
import { readdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative, sep } from 'node:path';

// Scan user data, not operating-system trees or generated/vendor copies.
const excluded = new Set(['node_modules', 'vendor', 'external', 'dist', 'build', 'target', 'coverage', 'output', 'outputs', 'cache', 'caches', 'artifacts', 'logs', 'runs', 'Library', 'Applications', 'System', 'private', 'dev', 'proc', 'sys', 'lost+found', 'backup', 'backups', 'archive', 'archives', 'proposals', 'fixtures', '__fixtures__', 'orbstack', 'venv', '__pycache__']);
function skipDirectory(name: string) {
  const lower = name.toLowerCase();
  return name.startsWith('.') || lower === 'docs' || excluded.has(name) || excluded.has(lower) || /(^|[-_])(backups?|archives?)([-_]|$)/.test(lower) || /\.(app|photoslibrary|photolibrary)$/.test(lower);
}
export function deviceSearchRoots(workspaces: string[]): string[] {
  const volumes = process.platform === 'darwin' ? ['/Users/Shared', '/Volumes'] : ['/mnt', '/media'];
  return [...new Set([homedir(), ...volumes, ...workspaces])];
}
export type DeviceScan = {
  phase: 'idle' | 'scanning' | 'complete' | 'interrupted' | 'failed';
  roots: string[];
  folders: number;
  candidates: number;
  added: number;
  skipped: number;
  warnings: string[];
  startedAt?: string;
  finishedAt?: string;
  currentPath?: string;
};
export const emptyDeviceScan = (): DeviceScan => ({ phase: 'idle', roots: [], folders: 0, candidates: 0, added: 0, skipped: 0, warnings: [] });
export function scanWarning(scan: DeviceScan, warning: string) {
  scan.skipped++;
  if (scan.warnings.length < 100) scan.warnings.push(warning);
}

async function filesystemRead<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  let abort: () => void = () => {};
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Folder access timed out; it may be offline or waiting for macOS permission')), 2500);
      abort = () => reject(signal?.reason ?? new Error('Scan cancelled'));
      if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    })]);
  } finally { clearTimeout(timer!); signal?.removeEventListener('abort', abort); }
}

/** Walk canonical directories once, including symlinked checkouts, without modifying them. */
export async function scanDevice(
  scan: DeviceScan,
  register: (workspace: string) => Promise<void>,
  signal?: AbortSignal,
) {
  const seen = new Set<string>();
  const queue = [...scan.roots];
  const boundaries = (await Promise.all(scan.roots.map(async root => {
    try { return await filesystemRead(realpath(root), signal); } catch { return root; }
  }))).sort((a, b) => b.length - a.length);
  for (let index = 0; index < queue.length; index++) {
    signal?.throwIfAborted();
    const input = queue[index]!;
    scan.currentPath = input;
    let path: string;
    try { path = await filesystemRead(realpath(input), signal); }
    catch (e: any) { if (e.code !== 'ENOENT') scanWarning(scan, `Cannot access ${input}: ${e.code ?? e.message}`); continue; }
    // macOS exposes the boot volume under /Volumes as a symlink to /.
    if (path === '/' || seen.has(path)) continue;
    seen.add(path);
    // Aliases must not bypass exclusions by pointing into generated or protected trees.
    // Explicitly registered roots remain searchable even when an ancestor is excluded.
    const boundary = boundaries.find(root => path === root || path.startsWith(root + sep));
    const components = boundary ? relative(boundary, path).split(sep) : path.split(sep);
    if (components.some(part => part && skipDirectory(part))) continue;
    let entries;
    try { entries = await filesystemRead(readdir(path, { withFileTypes: true }), signal); }
    catch (e: any) { scanWarning(scan, `Cannot read ${path}: ${e.code ?? e.message}`); continue; }
    scan.folders++;
    if (entries.some(e => e.name === 'codecaine.docs.json' || (e.name === 'docs' && (e.isDirectory() || e.isSymbolicLink())))) {
      scan.candidates++;
      try { await register(path); }
      catch (e) { scanWarning(scan, `Cannot register ${path}: ${String(e)}`); }
    }
    for (const entry of entries) {
      if (skipDirectory(entry.name)) continue;
      const child = join(path, entry.name);
      if (entry.isDirectory()) queue.push(child);
      else if (entry.isSymbolicLink()) {
        try { if ((await filesystemRead(stat(child), signal)).isDirectory()) queue.push(child); }
        catch (e: any) { if (e.code !== 'ENOENT') scanWarning(scan, `Cannot follow ${child}: ${e.code ?? e.message}`); }
      }
    }
  }
}
