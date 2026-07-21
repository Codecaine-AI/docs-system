import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";

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
 * (dot-directories like docs/.drafts stay skipped).
 */

export type DocsTreeNode = {
  name: string;
  path: string;
  kind: "dir" | "file" | "bundle";
  children?: DocsTreeNode[];
};

const ALLOWED_DOC_EXT = new Set([".md", ".markdown", ".mdx"]);

export async function walkDocsDir(absRoot: string, relPath = ""): Promise<DocsTreeNode[]> {
  const here = join(absRoot, relPath);
  const entries = await readdir(here, { withFileTypes: true });
  const dirs: DocsTreeNode[] = [];
  const files: DocsTreeNode[] = [];
  const hereIsBundle = existsSync(join(here, "doc.json"));

  const bundleDirNames = new Set<string>();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "assets") {
      continue;
    }
    if (existsSync(join(here, entry.name, "doc.json"))) bundleDirNames.add(entry.name);
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    if (entry.isDirectory() && entry.name === "assets") continue;
    const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const children = await walkDocsDir(absRoot, childRel);
      if (bundleDirNames.has(entry.name)) {
        dirs.push({
          name: entry.name,
          path: childRel,
          kind: "bundle",
          ...(children.length > 0 ? { children } : {}),
        });
      } else {
        dirs.push({ name: entry.name, path: childRel, kind: "dir", children });
      }
    } else if (entry.isFile() && ALLOWED_DOC_EXT.has(extname(entry.name).toLowerCase())) {
      const stem = entry.name.slice(0, entry.name.length - extname(entry.name).length);
      if (bundleDirNames.has(stem)) continue;
      if (hereIsBundle && stem === "index") continue;
      files.push({ name: entry.name, path: childRel, kind: "file" });
    }
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...dirs, ...files];
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
