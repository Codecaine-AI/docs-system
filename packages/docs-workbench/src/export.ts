import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { projectToMarkdown } from "@codecaine-ai/docs-model/project-markdown";
import { openBacklinksDb, queryInboundTolerant, rescanAll } from "@codecaine-ai/docs-index/backlinks";

import { bundleResponse, loadDocBundle } from "@codecaine-ai/docs-server";
import { collectBundlePaths, walkDocsDir, type DocsTreeNode } from "@codecaine-ai/docs-server";
import { GLOBAL_THEME_ID, readRepoTheme, themesRootFor, themesRootForId } from "@codecaine-ai/docs-server";
import { ensureSpaBuilt } from "./spa";

/**
 * `docs-cli export`: emits a fully static site into `--out`:
 *
 *   <out>/index.html + assets/          the SPA, built in static mode
 *   <out>/data/tree.json                { tree: DocsTreeNode[] }
 *   <out>/data/bundles/<path>.json      per-bundle /api/bundle-shaped snapshot
 *   <out>/data/markdown/<path>.md       per-bundle markdown projection
 *   <out>/data/backlinks.json           { [bundlePath]: BacklinkRow[] }
 *   <out>/data/theme.json               { theme } — the repo theme folder,
 *                                       GET /api/themes/:id shaped
 *   <out>/data/files/<relpath>          every file under an assets/ dir
 *                                       (canvas sidecars, images, attachments)
 *   <out>/data/site.json                { repoUrl?, title? } — public-site
 *                                       chrome (repository link, site title);
 *                                       always written so the SPA never 404s
 *
 * The static-mode SPA reads these with RELATIVE fetch paths (and the vite
 * build uses `base: "./"`), so the output works from any static file host
 * AND from a subpath. Navigation is hash-based, so no rewrite rules needed.
 */

export interface ExportOptions {
  docsRoot: string;
  outDir: string;
  /** Theme folder to snapshot; defaults to the docs-root sibling. */
  themesRoot?: string;
  /** Rebuild the SPA even when a static build already exists. */
  forceBuild?: boolean;
  /**
   * Active theme folder to snapshot as the exported site's style baseline.
   * Defaults to the shared global theme when `globalThemesRoot` holds one
   * (what a served workbench shows by default), else the repo `default`.
   */
  themeId?: string;
  /** Folder holding the shared global theme (`<root>/global/`); omit for repo themes only. */
  globalThemesRoot?: string;
  /**
   * Source repository the exported site links back to (http/https only).
   * Falls back to the `repository` field of the project's
   * `codecaine.docs.json` (the file beside the docs root that declares it);
   * no link when neither is set.
   */
  repoUrl?: string;
  /** Site title: the page `<title>` and the sidebar header label. */
  siteTitle?: string;
  log?: (message: string) => void;
}

export interface ExportReport {
  outDir: string;
  bundlesExported: number;
  filesCopied: number;
  backlinkTargets: number;
  /** Whether a repo theme folder was found and snapshotted. */
  themeExported: boolean;
  /** The repository link written to data/site.json, if any. */
  repoUrl: string | null;
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

/** Shape of `<out>/data/site.json`, read by the static SPA (web/src/data/api.ts). */
export interface StaticSiteConfig {
  repoUrl?: string;
  title?: string;
}

/**
 * Validates a repository link: an absolute http(s) URL. Returns the
 * normalized href; throws with `source` named so the caller knows which
 * input (flag or project config) to fix.
 */
export function normalizeRepoUrl(value: string, source = "--repo-url"): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`Invalid ${source}: ${JSON.stringify(value)} is not an absolute URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Invalid ${source}: ${JSON.stringify(value)} must use http or https.`);
  }
  return url.href;
}

/**
 * The `repository` field of the project config (`codecaine.docs.json`)
 * that declares this docs root — the file in the docs root's parent whose
 * `docsRoot` (default "docs") resolves back to it. Null when there is no
 * such config or it sets no repository.
 */
export async function readProjectRepoUrl(docsRoot: string): Promise<string | null> {
  const projectRoot = dirname(resolve(docsRoot));
  const configPath = join(projectRoot, "codecaine.docs.json");
  let config: unknown;
  try {
    config = JSON.parse(await readFile(configPath, "utf8"));
  } catch {
    return null;
  }
  if (!config || typeof config !== "object") return null;
  const { docsRoot: declaredRoot, repository } = config as Record<string, unknown>;
  const declared = resolve(projectRoot, typeof declaredRoot === "string" ? declaredRoot : "docs");
  if (declared !== resolve(docsRoot)) return null;
  if (repository === undefined) return null;
  if (typeof repository !== "string") {
    throw new Error(`Invalid repository in ${configPath}: expected a URL string.`);
  }
  return normalizeRepoUrl(repository, `repository in ${configPath}`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function runExport(options: ExportOptions): Promise<ExportReport> {
  const { docsRoot, outDir } = options;
  const log = options.log ?? (() => {});

  // 0. Validate public-site inputs BEFORE any build/copy work, so a bad
  //    flag fails fast and leaves the out dir untouched.
  const repoUrl =
    options.repoUrl !== undefined
      ? normalizeRepoUrl(options.repoUrl)
      : await readProjectRepoUrl(docsRoot);
  const siteTitle = options.siteTitle?.trim() || undefined;

  // 1. Static-mode SPA build, copied wholesale into the out dir.
  const dist = await ensureSpaBuilt({ mode: "static", force: options.forceBuild, log });
  await mkdir(outDir, { recursive: true });
  await cp(dist, outDir, { recursive: true });
  {
    // Per-export index.html tweaks (the shared SPA build stays untouched):
    // the pre-JS <title> (the SPA also reads it from data/site.json), and an
    // empty icon so browsers do not probe the HOST root's /favicon.ico — on
    // a subpath deploy that is outside the export and 404s.
    const indexPath = join(outDir, "index.html");
    let html = await readFile(indexPath, "utf8");
    if (siteTitle) {
      html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(siteTitle)}</title>`);
    }
    if (!/<link[^>]+rel=["']?(?:shortcut )?icon/i.test(html)) {
      html = html.replace(/<\/head>/i, '    <link rel="icon" href="data:," />\n  </head>');
    }
    await writeFile(indexPath, html);
  }

  const dataDir = join(outDir, "data");
  await mkdir(dataDir, { recursive: true });

  // 1b. Public-site chrome, read at runtime so one SPA build serves any corpus.
  const site: StaticSiteConfig = {
    ...(repoUrl ? { repoUrl } : {}),
    ...(siteTitle ? { title: siteTitle } : {}),
  };
  await writeFile(join(dataDir, "site.json"), JSON.stringify(site, null, 2));

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

  // 6. Active-theme snapshot, GET /api/themes/:id shaped. The exported site has no
  //    server, so this file is the ONLY way the style rail's repo baseline
  //    (manifest.railDefaults) and the component token files reach it —
  //    without it an export renders stock defaults and quietly loses every
  //    tuned --style-* value. A repo with no themes/ folder just skips it
  //    and the SPA falls back to its compiled-in defaults.
  const repoThemesRoot = options.themesRoot ?? themesRootFor(docsRoot);
  const readTheme = async (id: string) => {
    const root = themesRootForId(id, repoThemesRoot, options.globalThemesRoot);
    return root ? readRepoTheme(root, id) : null;
  };
  let themeId = options.themeId ?? GLOBAL_THEME_ID;
  let theme = await readTheme(themeId);
  if (!theme && options.themeId === undefined) {
    themeId = "default";
    theme = await readTheme(themeId);
  }
  if (theme) {
    await writeFile(join(dataDir, "theme.json"), JSON.stringify({ theme }, null, 2));
  }

  log(
    `[docs-export] ${bundlesExported} bundle(s), ${filesCopied} asset file(s), ` +
      `${Object.keys(backlinks).length} backlink target(s), ` +
      `theme ${theme ? themeId : "(none)"} -> ${outDir}`,
  );
  return {
    outDir,
    bundlesExported,
    filesCopied,
    backlinkTargets: Object.keys(backlinks).length,
    themeExported: theme !== null,
    repoUrl,
    failures,
  };
}
