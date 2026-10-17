/** Enumerate local corpus candidates without rewriting them. Registration stays in the shared runtime. */
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';

// Scan user data, not operating-system trees or generated/vendor copies.
const excluded = new Set(['node_modules', 'vendor', 'external', 'dist', 'build', 'target', 'coverage', 'output', 'outputs', 'cache', 'caches', 'artifacts', 'logs', 'runs', 'Library', 'Applications', 'System', 'private', 'dev', 'proc', 'sys', 'lost+found', 'backup', 'backups', 'archive', 'archives', 'proposals', 'fixtures', '__fixtures__', 'orbstack', 'venv', '__pycache__']);
function skipDirectory(name: string) {
  const lower = name.toLowerCase();
  return name.startsWith('.') || lower === 'docs' || excluded.has(name) || excluded.has(lower) || /(^|[-_])(backups?|archives?)([-_]|$)/.test(lower) || /\.(app|photoslibrary|photolibrary)$/.test(lower);
}
/** A folder holding this marker file is skipped with its whole subtree (for example a view of symlinks). */
export const SCAN_IGNORE_MARKER = '.codecaine-docs-ignore';
/** codecaine.docs.json with docsRoot "." makes the whole folder one docs project: nothing below it registers. */
const wholeFolderProject = (config: any) => config?.docsRoot === '.' || config?.docsRoot === './';
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

/**
 * True when some component of the absolute path `path` (the path itself
 * included) is a symbolic link. Missing components end the check: there is
 * nothing to follow below them.
 */
async function reachedThroughSymlink(path: string, signal?: AbortSignal): Promise<boolean> {
  const parts = resolve(path).split(sep).filter(Boolean);
  let current: string = sep;
  for (const part of parts) {
    current = join(current, part);
    try { if ((await filesystemRead(lstat(current), signal)).isSymbolicLink()) return true; }
    catch (e: any) { if (e?.code === 'ENOENT' || e?.code === 'ENOTDIR') return false; throw e; }
  }
  return false;
}

/**
 * Walk real directories once without modifying them, and never follow a
 * symbolic link: a link found while walking is skipped (directory entries
 * carry lstat types), and an explicit root reached through a link component
 * is refused before it is canonicalized, so a link in a view (for example
 * ~/kb-view/repo -> an ordinary repo elsewhere) can never register its target.
 * A folder with the ignore marker is skipped with its subtree. A folder whose
 * codecaine.docs.json sets docsRoot "." registers as one project and its
 * children are not walked. A root whose lexical or canonical ancestor is an
 * ignored folder, such a project, or one of `corpusRoots` (the registered
 * projects whose root is their docsRoot) is skipped.
 */
export async function scanDevice(
  scan: DeviceScan,
  register: (workspace: string) => Promise<void>,
  signal?: AbortSignal,
  corpusRoots: Iterable<string> = [],
) {
  const seen = new Set<string>();
  const queue = [...scan.roots];
  const boundaries = (await Promise.all(scan.roots.map(async root => {
    try { return await filesystemRead(realpath(root), signal); } catch { return root; }
  }))).sort((a, b) => b.length - a.length);
  // Canonical folder -> whether it is ignored (marker) or a whole-folder docs project.
  const folders = new Map<string, { ignored: boolean; corpus: boolean }>();
  for (const root of corpusRoots) {
    try { folders.set(await filesystemRead(realpath(root), signal), { ignored: false, corpus: true }); } catch { /* An unavailable project has nothing to hide. */ }
  }
  const readProjectConfig = async (folder: string) => {
    try { return wholeFolderProject(JSON.parse(await filesystemRead(readFile(join(folder, 'codecaine.docs.json'), 'utf8'), signal))); }
    catch { return false; }
  };
  const folderFlags = async (folder: string) => {
    let flags = folders.get(folder);
    if (!flags) {
      let ignored = false;
      try { await filesystemRead(lstat(join(folder, SCAN_IGNORE_MARKER)), signal); ignored = true; } catch { /* No marker. */ }
      flags = { ignored, corpus: await readProjectConfig(folder) };
      folders.set(folder, flags);
    }
    return flags;
  };
  // True when an ancestor of `path` is ignored or is a whole-folder docs project.
  const hiddenByAncestor = async (path: string) => {
    for (let folder = dirname(path); ; folder = dirname(folder)) {
      const flags = await folderFlags(folder);
      if (flags.ignored || flags.corpus) return true;
      if (folder === dirname(folder)) return false;
    }
  };
  for (let index = 0; index < queue.length; index++) {
    signal?.throwIfAborted();
    const input = queue[index]!;
    scan.currentPath = input;
    if (index < scan.roots.length) {
      // An explicit root: refuse a symbolic-link component before canonicalizing it, and
      // honor its lexical ancestors (a marked view, a docsRoot "." project) as well.
      try {
        if (await reachedThroughSymlink(input, signal)) { scanWarning(scan, `Skipped ${input}: scan roots are never reached through a symbolic link`); continue; }
      } catch (e: any) { scanWarning(scan, `Cannot access ${input}: ${e?.code ?? e?.message ?? String(e)}`); continue; }
      const lexical = resolve(input);
      if (folders.get(lexical)?.ignored || await hiddenByAncestor(lexical)) continue;
    }
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
    if (folders.get(path)?.ignored || await hiddenByAncestor(path)) continue;
    let entries;
    try { entries = await filesystemRead(readdir(path, { withFileTypes: true }), signal); }
    catch (e: any) { scanWarning(scan, `Cannot read ${path}: ${e.code ?? e.message}`); continue; }
    scan.folders++;
    const ignored = entries.some(e => e.name === SCAN_IGNORE_MARKER);
    const hasConfig = entries.some(e => e.name === 'codecaine.docs.json');
    const corpus = !ignored && (folders.get(path)?.corpus === true || (hasConfig && await readProjectConfig(path)));
    folders.set(path, { ignored, corpus });
    if (ignored) continue;
    if (hasConfig || entries.some(e => e.name === 'docs' && (e.isDirectory() || e.isSymbolicLink()))) {
      scan.candidates++;
      try { await register(path); }
      catch (e) { scanWarning(scan, `Cannot register ${path}: ${String(e)}`); }
    }
    if (corpus) continue;
    for (const entry of entries) {
      if (skipDirectory(entry.name)) continue;
      // Dirent types are lstat types: a symbolic link is never a directory here, so it is never followed.
      if (entry.isDirectory()) queue.push(join(path, entry.name));
    }
  }
}
