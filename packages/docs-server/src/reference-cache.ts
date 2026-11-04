import { realpathSync } from "node:fs";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { docsFs, type DocsListedDir } from "@codecaine-ai/docs-index/safe-path";
import { extractManagedRefs, holdsManagedRefs, type ManagedRef } from "./managed-refs";

/**
 * One walk of the corpus: every corpus file, and the unresolved references of each reference file.
 * The refs' holders are the cache's parsed data: never write through them.
 */
export type ReferenceLookup = { files: Set<string>; refs: Map<string, ManagedRef[]> };
export type ReferenceCache = { lookup(): Promise<ReferenceLookup> };

/** Service-owned metadata at the docs root, never corpus (the same names capture() skips). */
const ROOT_SKIPPED = new Set([".index", ".changesets", ".git"]);
type Parsed = { size: bigint; mtimeNs: bigint; ino: bigint; refs: ManagedRef[] };

const caches = new Map<string, ReferenceCache>();

/** The reference cache of the docs root at `root`, one per canonical root. */
export function referenceCache(root: string): ReferenceCache {
  const canonical = realpathSync(root);
  let cache = caches.get(canonical);
  if (!cache) caches.set(canonical, (cache = createReferenceCache(canonical)));
  return cache;
}

/**
 * The corpus walk and refusals of manage-files' capture(), through one guarded listing per folder.
 * A reference file is parsed again only when its size, mtime or inode changed since the last lookup.
 */
function createReferenceCache(root: string): ReferenceCache {
  const fs = docsFs(root), parsed = new Map<string, Parsed>();
  async function refsOf(path: string, abs: string): Promise<ManagedRef[]> {
    // Stat before the read: a write between the two leaves an older key, so the next lookup parses again.
    const stat = await lstat(abs, { bigint: true });
    if (stat.isSymbolicLink()) throw Error(`Symbolic links are unsupported for corpus management: ${path}`);
    if (!stat.isFile()) throw Error(`Unsupported filesystem entry: ${path}`);
    const known = parsed.get(path);
    if (known && known.size === stat.size && known.mtimeNs === stat.mtimeNs && known.ino === stat.ino) return known.refs;
    let data: unknown;
    try { data = JSON.parse((await fs.readFile(path)).toString()); }
    catch { throw Object.assign(Error(`Malformed JSON: ${path}`), { status: 422 }); }
    const refs = extractManagedRefs(path, data, root);
    parsed.set(path, { size: stat.size, mtimeNs: stat.mtimeNs, ino: stat.ino, refs });
    return refs;
  }
  return {
    async lookup() {
      const files = new Set<string>(), refs = new Map<string, ManagedRef[]>(), walk = fs.listingWalk();
      async function visit(dir: DocsListedDir) {
        for (const entry of dir.entries) {
          if (!dir.rel && ROOT_SKIPPED.has(entry.name)) continue;
          const path = dir.rel ? `${dir.rel}/${entry.name}` : entry.name;
          if (entry.isSymbolicLink()) throw Error(`Symbolic links are unsupported for corpus management: ${path}`);
          if (entry.isDirectory()) {
            // Null: no longer a real folder at its place since the parent was listed.
            const child = await walk.listChild(dir, entry);
            if (child) await visit(child);
          } else if (entry.isFile()) {
            files.add(path);
            if (holdsManagedRefs(path)) refs.set(path, await refsOf(path, join(dir.canonical, entry.name)));
          } else throw Error(`Unsupported filesystem entry: ${path}`);
        }
      }
      await visit(await walk.list(""));
      for (const path of parsed.keys()) if (!refs.has(path)) parsed.delete(path);
      return { files, refs };
    },
  };
}
