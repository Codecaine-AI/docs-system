import { createHash } from 'node:crypto';
import { validateDocDocument } from '@codecaine-ai/docs-model/doc-schema';
import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export interface DocsProject { id: string; name: string; root: string; docsRoot: string; products: string[] }
export interface Discovery { workspace: string; projects: DocsProject[]; warnings: string[] }
const inside = (root: string, target: string) => target === root || (!relative(root, target).startsWith(`..${sep}`) && relative(root, target) !== '..' && !isAbsolute(relative(root, target)));
async function json(file: string): Promise<any | undefined> {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (e: any) { if (e.code === 'ENOENT') return undefined; throw new Error(`Cannot read ${file}: ${e.message}`); }
}
async function directory(path: string) { try { return (await stat(path)).isDirectory(); } catch { return false; } }
export async function discoverProjects(input: string): Promise<Discovery> {
  const workspace = await realpath(resolve(input));
  if (!await directory(workspace)) throw new Error('Workspace must be a directory');
  const warnings: string[] = [];
  const candidates = new Set<string>([workspace]);
  const manifest = await json(join(workspace, 'codecaine.docs.json'));
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
  for (const root of [...candidates].sort()) {
    const config = root === workspace ? manifest : await json(join(root, 'codecaine.docs.json'));
    if (config?.products !== undefined && (!Array.isArray(config.products) || config.products.some((x: unknown) => typeof x !== 'string'))) throw new Error(`Invalid products in ${root}/codecaine.docs.json`);
    const products: string[] = config?.products ?? ['docs'];
    if (!products.includes('docs')) continue;
    if (config?.docsRoot !== undefined && typeof config.docsRoot !== 'string') throw new Error(`Invalid docsRoot in ${root}/codecaine.docs.json`);
    const docs = resolve(root, config?.docsRoot ?? 'docs');
    if (!inside(root, docs)) throw new Error(`docsRoot must be inside project: ${root}`);
    if (!await directory(docs)) continue;
    const docsRoot = await realpath(docs);
    if (!inside(root, docsRoot)) throw new Error(`docsRoot symlink escapes project: ${root}`);
    // Recognize the normalized model; never treat arbitrary Markdown directories as migrated corpora.
    let found = false;
    for await (const file of new Bun.Glob('**/doc.json').scan({ cwd: docsRoot, onlyFiles: true, followSymlinks: false })) {
      if (file.split('/').some(x => x.startsWith('.') || x === 'node_modules')) continue;
      let doc; try { doc = await json(join(docsRoot, file)); } catch { warnings.push(`Malformed document skipped during discovery: ${join(docsRoot,file)}`); continue; }
      if (validateDocDocument(doc).ok) { found = true; break; }
    }
    if (!found) { warnings.push(`No normalized doc.json corpus found: ${docs}`); continue; }
    if (roots.has(docsRoot)) continue;
    roots.add(docsRoot);
    const name = config?.name ?? basename(root);
    if (typeof name !== 'string') throw new Error(`Invalid project name: ${root}`);
    const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    const id = `${slug}-${createHash('sha256').update(docsRoot).digest('hex').slice(0, 8)}`;
    projects.push({ id, name, root, docsRoot, products });
  }
  return { workspace, projects, warnings };
}
