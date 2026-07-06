import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { projectToMarkdown } from "@codecaine-ai/docs-model/project-markdown";
import { openBacklinksDb, queryInboundTolerant, rescanAll } from "@codecaine-ai/docs-index/backlinks";

import { bundleResponse, loadDocBundle } from "./bundle";
import { collectBundlePaths, walkDocsDir, type DocsTreeNode } from "./docs-tree";
import { ensureSpaBuilt } from "./spa";

/**
 * `docs-cli export`: emits a fully static site into `--out`:
 *
 *   <out>/index.html + assets/          the SPA, built in static mode
 *   <out>/data/tree.json                { tree: DocsTreeNode[] }
 *   <out>/data/bundles/<path>.json      per-bundle /api/bundle-shaped snapshot
 *   <out>/data/markdown/<path>.md       per-bundle markdown projection
 *   <out>/data/backlinks.json           { [bundlePath]: BacklinkRow[] }
 *   <out>/data/files/<relpath>          every file under an assets/ dir
 *                                       (canvas sidecars, images, attachments)
 *
 * The static-mode SPA reads these with RELATIVE fetch paths (and the vite
 * build uses `base: "./"`), so the output works from any static file host
 * AND from a subpath. Navigation is hash-based, so no rewrite rules needed.
 */

export interface ExportOptions {
  docsRoot: string;
  outDir: string;
  /** Rebuild the SPA even when a static build already exists. */
  forceBuild?: boolean;
  log?: (message: string) => void;
}

export interface ExportReport {
  outDir: string;
  bundlesExported: number;
  filesCopied: number;
  backlinkTargets: number;
  failures: Array<{ path: string; detail: string }>;
}

/** Recursively lists files under docsRoot living inside an `assets/` dir. */
async function collectAssetFiles(docsRoot: string, relPath = ""): Promise<string[]> {
  const here = join(docsRoot, relPath);
  const entries = await readdir(here, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await collectAssetFiles(docsRoot, childRel)));
    } else if (entry.isFile() && childRel.includes("assets/")) {
      out.push(childRel);
    }
  }
  return out;
}

export async function runExport(options: ExportOptions): Promise<ExportReport> {
  const { docsRoot, outDir } = options;
  const log = options.log ?? (() => {});

  // 1. Static-mode SPA build, copied wholesale into the out dir.
  const dist = await ensureSpaBuilt({ mode: "static", force: options.forceBuild, log });
  await mkdir(outDir, { recursive: true });
  await cp(dist, outDir, { recursive: true });

  const dataDir = join(outDir, "data");
  await mkdir(dataDir, { recursive: true });

  // 2. Tree snapshot (same shape as GET /api/tree).
  const tree: DocsTreeNode[] = await walkDocsDir(docsRoot);
  await writeFile(join(dataDir, "tree.json"), JSON.stringify({ tree }, null, 2));

  // 3. Per-bundle snapshots + markdown projections.
  const bundlePaths = collectBundlePaths(tree);
  const failures: Array<{ path: string; detail: string }> = [];
  let bundlesExported = 0;
  for (const bundlePath of bundlePaths) {
    const loaded = await loadDocBundle(docsRoot, bundlePath);
    if ("error" in loaded) {
      failures.push({ path: bundlePath, detail: loaded.error.detail });
      continue;
    }
    const bundleJsonPath = join(dataDir, "bundles", `${bundlePath}.json`);
    await mkdir(dirname(bundleJsonPath), { recursive: true });
    await writeFile(bundleJsonPath, JSON.stringify(bundleResponse(loaded), null, 2));

    const markdownPath = join(dataDir, "markdown", `${bundlePath}.md`);
    await mkdir(dirname(markdownPath), { recursive: true });
    await writeFile(markdownPath, projectToMarkdown(loaded.document));
    bundlesExported += 1;
  }

  // 4. Copy asset + canvas files (everything under an assets/ dir).
  const assetFiles = await collectAssetFiles(docsRoot);
  let filesCopied = 0;
  for (const relPath of assetFiles) {
    const target = join(dataDir, "files", relPath);
    await mkdir(dirname(target), { recursive: true });
    await cp(join(docsRoot, relPath), target);
    filesCopied += 1;
  }

  // 5. Backlinks snapshot: inbound rows per bundle path (in-memory index —
  //    export never writes into the source tree).
  const db = await openBacklinksDb(":memory:");
  await rescanAll(docsRoot, db);
  const backlinks: Record<string, unknown[]> = {};
  for (const bundlePath of bundlePaths) {
    const rows = queryInboundTolerant(db, bundlePath);
    if (rows.length > 0) backlinks[bundlePath] = rows;
  }
  await writeFile(join(dataDir, "backlinks.json"), JSON.stringify(backlinks, null, 2));

  log(
    `[docs-export] ${bundlesExported} bundle(s), ${filesCopied} asset file(s), ` +
      `${Object.keys(backlinks).length} backlink target(s) -> ${outDir}`,
  );
  return {
    outDir,
    bundlesExported,
    filesCopied,
    backlinkTargets: Object.keys(backlinks).length,
    failures,
  };
}
