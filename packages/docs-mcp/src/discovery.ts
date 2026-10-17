import { createHash } from 'node:crypto';
import { validateDocDocument } from '@codecaine-ai/docs-model/doc-schema';
import { isExcludedDocPath } from '@codecaine-ai/docs-index/paths';
import { readDocsProjectConfig, type DocsProjectConfig } from '@codecaine-ai/docs-index/project-policy';
import { docsFs, realDocsRootPath } from '@codecaine-ai/docs-index/safe-path';
import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** exclude: docsRoot-relative globs from codecaine.docs.json whose matches are not part of the project. */
export interface DocsProject { id: string; name: string; root: string; docsRoot: string; products: string[]; exclude?: string[] }
export interface Discovery { workspace: string; projects: DocsProject[]; warnings: string[] }
const inside = (root: string, target: string) => target === root || (!relative(root, target).startsWith(`..${sep}`) && relative(root, target) !== '..' && !isAbsolute(relative(root, target)));
async function json(file: string): Promise<any | undefined> {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (e: any) { if (e.code === 'ENOENT') return undefined; throw new Error(`Cannot read ${file}: ${e.message}`); }
}
async function directory(path: string) { try { return (await stat(path)).isDirectory(); } catch { return false; } }
/** codecaine.docs.json with docsRoot "." makes its whole folder one docs project. */
const wholeFolderProject = (config: DocsProjectConfig | undefined) => config?.docsRoot === '.' || config?.docsRoot === './';
/**
 * Every codecaine.docs.json is read through the structural validator every
 * host's policy loader uses (docs-index/project-policy): unparsable JSON, a
 * non-object, invalid products, a present non-string docsRoot, a docsRoot
 * outside its folder or an invalid exclude all refuse, here and in every host.
 */
const projectConfig = (folder: string) => readDocsProjectConfig(join(folder, 'codecaine.docs.json'));
export async function discoverProjects(input: string): Promise<Discovery> {
  const workspace = await realpath(resolve(input));
  if (!await directory(workspace)) throw new Error('Workspace must be a directory');
  const warnings: string[] = [];
  const candidates = new Set<string>([workspace]);
  const manifestConfig = await projectConfig(workspace);
  const manifest: any = manifestConfig?.record;
  const members = await json(join(workspace, 'members.json'));
  const pkg = await json(join(workspace, 'package.json'));
  const declared: string[] = [
    ...(Array.isArray(members) ? members.map(m => m.dir).filter(x => typeof x === 'string') : []),
    ...(Array.isArray(manifest?.projects) ? manifest.projects : []),
  ];
  for (const name of declared) {
    if (typeof name !== 'string') throw new Error('codecaine.docs.json projects must be relative paths');
    const target = resolve(workspace, name);
    if (!inside(workspace, target)) throw new Error(`Project escapes workspace: ${name}`);
    if (await directory(target)) {
      const canonical = await realpath(target);
      if (!inside(workspace, canonical)) throw new Error(`Project symlink escapes workspace: ${name}`);
      candidates.add(canonical);
    } else warnings.push(`Declared project unavailable: ${name}`);
  }
  const patterns = Array.isArray(pkg?.workspaces) ? pkg.workspaces : pkg?.workspaces?.packages;
  if (Array.isArray(patterns)) for (const pattern of patterns) {
    if (typeof pattern !== 'string' || isAbsolute(pattern) || pattern.split('/').includes('..') || pattern.includes('**')) continue;
    for await (const match of new Bun.Glob(pattern).scan({ cwd: workspace, onlyFiles: false })) {
      const target = resolve(workspace, match);
      if (!await directory(target)) continue;
      const canonical = await realpath(target);
      if (!inside(workspace, canonical)) continue;
      // Workspace members often live under product/packages/*. Include their ancestor repo.
      let cursor = canonical;
      while (inside(workspace, cursor)) { candidates.add(cursor); if (cursor === workspace) break; cursor = dirname(cursor); }
    }
  }
  const projects: DocsProject[] = [];
  const roots = new Set<string>();
  // A folder inside a whole-folder project (docsRoot ".") is part of that project, never its own.
  const ancestorConfigs = new Map<string, boolean>();
  const wholeFolderAncestor = async (root: string) => {
    for (let folder = dirname(root); ; folder = dirname(folder)) {
      let whole = ancestorConfigs.get(folder);
      if (whole === undefined) {
        // Fail closed: a malformed enclosing config refuses discovery, as it refuses every host below it.
        whole = wholeFolderProject(await projectConfig(folder));
        ancestorConfigs.set(folder, whole);
      }
      if (whole) return folder;
      if (folder === dirname(folder)) return undefined;
    }
  };
  for (const root of [...candidates].sort()) {
    const ancestor = await wholeFolderAncestor(root);
    if (ancestor !== undefined) { warnings.push(`Inside docs project ${ancestor}: ${root}`); continue; }
    const validated = root === workspace ? manifestConfig : await projectConfig(root);
    const config: any = validated?.record;
    const products: string[] = validated?.products ?? ['docs'];
    if (!products.includes('docs')) continue;
    const exclude = validated?.exclude ?? [];
    const docs = validated?.docsRootPath ?? resolve(root, 'docs');
    if (!inside(root, docs)) throw new Error(`docsRoot must be inside project: ${root}`);
    if (!await directory(docs)) continue;
    // The docs root's canonical identity comes from the chokepoint module.
    const docsRoot = realDocsRootPath(docs);
    if (!inside(root, docsRoot)) throw new Error(`docsRoot symlink escapes project: ${root}`);
    // Recognize the normalized model; never treat arbitrary Markdown directories as migrated corpora.
    let found = false;
    for await (const file of new Bun.Glob('**/doc.json').scan({ cwd: docsRoot, onlyFiles: true, followSymlinks: false })) {
      if (file.split('/').some(x => x.startsWith('.') || x === 'node_modules')) continue;
      // An excluded doc.json is not part of the corpus, so it cannot make one.
      if (isExcludedDocPath(file, exclude)) continue;
      // The document itself is read through the docs-root chokepoint (refused paths read as malformed).
      let doc; try { doc = JSON.parse(await docsFs(docsRoot).readFile(file, 'utf8')); } catch { warnings.push(`Malformed document skipped during discovery: ${join(docsRoot,file)}`); continue; }
      if (validateDocDocument(doc).ok) { found = true; break; }
    }
    if (!found) { warnings.push(`No normalized doc.json corpus found: ${docs}`); continue; }
    if (roots.has(docsRoot)) continue;
    roots.add(docsRoot);
    const name = config?.name ?? basename(root);
    if (typeof name !== 'string') throw new Error(`Invalid project name: ${root}`);
    const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    const id = `${slug}-${createHash('sha256').update(docsRoot).digest('hex').slice(0, 8)}`;
    projects.push({ id, name, root, docsRoot, products, ...(exclude.length ? { exclude } : {}) });
  }
  return { workspace, projects, warnings };
}
