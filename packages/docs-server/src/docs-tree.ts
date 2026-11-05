import { extname } from "node:path";

import { foldsTogether, isExcludedDocPath } from "@codecaine-ai/docs-index/paths";
import { docsFs, type DocsFs, type DocsListedDir, type DocsListingWalk } from "@codecaine-ai/docs-index/safe-path";

/**
 * Docs tree walker, ported from Spectre apps/data-backend/src/index.ts's
 * `walkDocsDir` so the standalone `GET /api/tree` response is shape-identical
 * to Spectre's `GET /projects/:id/docs/tree` (the docs-viewer's
 * `DocsTreeNode` type — see @codecaine-ai/docs-viewer/client).
 *
 * A directory containing `doc.json` is a DOC NODE (`kind: "bundle"`, label =
 * folder name, path = the bundle folder — exactly what `/api/bundle`
 * accepts). Its doc.json/annotations.json/assets internals are never exposed as
 * tree entries; genuine subdirectories inside it still appear as children,
 * so a bundle can nest other docs. While markdown twins still exist:
 *  - a sibling `.md`/`.mdx` twin sharing the bundle folder's stem is
 *    suppressed (bundle wins), and
 *  - the `index.md(x)` twin INSIDE a bundle folder is suppressed the same
 *    way.
 * Plain markdown files without a bundle keep listing as `kind: "file"`
 * (dot-directories like docs/.drafts stay skipped). Paths the project's
 * codecaine.docs.json `exclude` globs match are skipped with their subtree.
 *
 * One guarded listing per folder (`DocsFs.listingWalk`, the docs-root
 * chokepoint): the walk takes one snapshot of the exclude policy, judges every
 * entry once at its lexical and its canonical location, and locates a child
 * folder from its parent's listing instead of resolving it on disk again. So
 * an entry excluded at its canonical location, or a link that leaves the root,
 * is never listed as a doc, and a link is never walked into: neither one in the
 * listing nor one that took a child folder's place, or an ancestor's, while the
 * walk yielded (the listing checks the child's real path right before it reads
 * it, and the walk skips a child that is no longer at its folder). A folder's own
 * listing says whether it is a bundle; the parent marks the child's kind and
 * suppresses its markdown twin after the recursion, so no child is probed. The
 * walk hands the event loop back (setImmediate) once 8 ms have passed since it
 * last did.
 */

export type DocsTreeNode = {
  name: string;
  path: string;
  kind: "dir" | "file" | "bundle";
  children?: DocsTreeNode[];
};

const ALLOWED_DOC_EXT = new Set([".md", ".markdown", ".mdx"]);
const BUNDLE_FILE = "doc.json";
const YIELD_AFTER_MS = 8;

/** When the walk hands the event loop back: a pending yield when one is due, else undefined. */
export type DocsWalkYield = () => Promise<void> | undefined;

/** `yieldIfDue` is the 8 ms pacer unless the caller brings its own (a test that changes the disk while the walk yields). */
export async function walkDocsDir(
  absRoot: string,
  relPath = "",
  exclude?: readonly string[],
  yieldIfDue: DocsWalkYield = pacer(),
): Promise<DocsTreeNode[]> {
  const fs = docsFs(absRoot);
  const walk = fs.listingWalk();
  const start = await walk.list(relPath);
  const { nodes } = await walkListed({ fs, walk, exclude, yieldIfDue }, start);
  return nodes;
}

type Walk = {
  fs: DocsFs;
  walk: DocsListingWalk;
  /** Explicit globs, when given: the project policy always applies through the listing. */
  exclude: readonly string[] | undefined;
  yieldIfDue: DocsWalkYield;
};

/** Yields with setImmediate once `YIELD_AFTER_MS` have passed since the last yield (a timer yield costs about 1 ms in Bun). */
function pacer(): DocsWalkYield {
  let last = performance.now();
  return () => {
    if (performance.now() - last < YIELD_AFTER_MS) return undefined;
    return new Promise<void>((resolve) => {
      setImmediate(() => {
        last = performance.now();
        resolve();
      });
    });
  };
}

async function walkListed(context: Walk, dir: DocsListedDir): Promise<{ nodes: DocsTreeNode[]; isBundle: boolean }> {
  const due = context.yieldIfDue();
  if (due) await due;
  const { exclude } = context;
  const isBundle = hasBundleFile(context.fs, dir);
  const dirs: DocsTreeNode[] = [];
  const markdown: Array<{ name: string; stem: string; path: string }> = [];
  const bundleDirNames = new Set<string>();

  for (const entry of dir.entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const childRel = dir.rel ? `${dir.rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === "assets") continue;
      if (exclude && isExcludedDocPath(childRel, exclude)) continue;
      const listing = await context.walk.listChild(dir, entry);
      // No longer a real folder (replaced, removed or linked since its parent was listed): never read, never a node.
      if (!listing) continue;
      const child = await walkListed(context, listing);
      if (child.isBundle) {
        bundleDirNames.add(entry.name);
        dirs.push({
          name: entry.name,
          path: childRel,
          kind: "bundle",
          ...(child.nodes.length > 0 ? { children: child.nodes } : {}),
        });
      } else {
        dirs.push({ name: entry.name, path: childRel, kind: "dir", children: child.nodes });
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      if (!ALLOWED_DOC_EXT.has(ext.toLowerCase())) continue;
      if (exclude && isExcludedDocPath(childRel, exclude)) continue;
      markdown.push({ name: entry.name, stem: entry.name.slice(0, entry.name.length - ext.length), path: childRel });
    }
  }

  // Twins are decided once every child folder's kind is known.
  const files: DocsTreeNode[] = [];
  for (const file of markdown) {
    if (bundleDirNames.has(file.stem)) continue;
    if (isBundle && file.stem === "index") continue;
    files.push({ name: file.name, path: file.path, kind: "file" });
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return { nodes: [...dirs, ...files], isBundle };
}

/**
 * Whether the listed folder is a bundle, read from its own listing: a
 * `doc.json` entry that is a file or a folder. A link named `doc.json`, or
 * another spelling of the name, is what the folder's `doc.json` probe used to
 * decide (the link's target, or the volume's case and normalization rules), so
 * only those rare folders are still probed.
 */
function hasBundleFile(fs: DocsFs, dir: DocsListedDir): boolean {
  let probe = false;
  for (const entry of dir.entries) {
    if (entry.name === BUNDLE_FILE) {
      if (entry.isFile() || entry.isDirectory()) return true;
      probe = true;
    } else if (entry.name.length === BUNDLE_FILE.length && foldsTogether(entry.name, BUNDLE_FILE)) {
      probe = true;
    }
  }
  return probe && fs.existsSync(dir.rel ? `${dir.rel}/${BUNDLE_FILE}` : BUNDLE_FILE);
}

/** Depth-first list of every bundle path in a docs tree (export + tests). */
export function collectBundlePaths(nodes: DocsTreeNode[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.kind === "bundle") out.push(node.path);
    if (node.children) out.push(...collectBundlePaths(node.children));
  }
  return out;
}
