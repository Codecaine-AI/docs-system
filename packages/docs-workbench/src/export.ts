// Raw fs here only READS the prebuilt SPA dist (the package's own build). Every
// corpus read goes through the docs-root chokepoint (docsFs) and every write of
// the export OUTPUT folder goes through its output guard (docsOutputFs), both in
// @codecaine-ai/docs-index/safe-path.
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { projectToMarkdown } from "@codecaine-ai/docs-model/project-markdown";
import { openBacklinksDb, queryInboundTolerant, rescanAll } from "@codecaine-ai/docs-index/backlinks";
import { loadDocsRootExcludePolicy } from "@codecaine-ai/docs-index/paths";
import { readDocsProjectConfig } from "@codecaine-ai/docs-index/project-policy";
import { docsFs, docsOutputFs, type DocsOutputIntent } from "@codecaine-ai/docs-index/safe-path";

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

/**
 * Recursively lists files under docsRoot living inside an `assets/` dir.
 * Paths the project's codecaine.docs.json `exclude` globs match are skipped
 * with their subtree: excluded files are not part of the published corpus.
 */
async function collectAssetFiles(docsRoot: string, relPath = ""): Promise<string[]> {
  // The chokepoint omits entries excluded lexically or at their canonical location.
  const entries = await docsFs(docsRoot).readdirEntries(relPath);
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
  // Read through the shared structural validator every host uses.
  let config;
  try {
    config = await readDocsProjectConfig(configPath);
  } catch {
    return null;
  }
  if (!config) return null;
  const { repository } = config.record;
  if (config.docsRootPath !== resolve(docsRoot)) return null;
  if (repository === undefined) return null;
  if (typeof repository !== "string") {
    throw new Error(`Invalid repository in ${configPath}: expected a URL string.`);
  }
  return normalizeRepoUrl(repository, `repository in ${configPath}`);
}

/** Files and folders of the prebuilt SPA dist (dist-relative); links and other entries are skipped. */
async function listSpaDist(dist: string, rel = ""): Promise<{ dirs: string[]; files: string[] }> {
  const out = { dirs: [] as string[], files: [] as string[] };
  for (const entry of await readdir(rel ? join(dist, rel) : dist, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.dirs.push(childRel);
      const below = await listSpaDist(dist, childRel);
      out.dirs.push(...below.dirs);
      out.files.push(...below.files);
    } else if (entry.isFile()) {
      out.files.push(childRel);
    }
  }
  return out;
}

/**
 * The fixed destinations of every export, checked before any build or write
 * (B7-3-02); each write checks its own target again at its system call.
 */
const FIXED_OUTPUT_TARGETS: ReadonlyArray<{ path: string; intent: DocsOutputIntent }> = [
  { path: "", intent: "mkdir" },
  { path: "index.html", intent: "write" },
  { path: "data", intent: "mkdir" },
  { path: "data/site.json", intent: "write" },
  { path: "data/tree.json", intent: "write" },
  { path: "data/backlinks.json", intent: "write" },
  { path: "data/theme.json", intent: "write" },
  { path: "data/bundles", intent: "mkdir" },
  { path: "data/markdown", intent: "mkdir" },
  { path: "data/files", intent: "mkdir" },
];

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
  //    flag fails fast and leaves the out dir untouched. The project policy
  //    (codecaine.docs.json exclude) is validated here too; the tree walk,
  //    bundle loads, asset walk and backlinks scan below all honor it.
  loadDocsRootExcludePolicy(docsRoot);
  // Every output write goes through the output guard: no symbolic link at or
  // below the output folder (a linked data/, data/files or index.html is never
  // written through), and no destination on a path the corpus forbids (the
  // served root's chokepoint rule and every governing project's exclude). The
  // fixed destinations are checked here, before any build or write.
  const out = docsOutputFs(docsRoot, outDir);
  const fixed = out.preflight(FIXED_OUTPUT_TARGETS);
  if (!fixed.ok) throw new Error(`Export output refused: ${fixed.detail}`);
  const repoUrl =
    options.repoUrl !== undefined
      ? normalizeRepoUrl(options.repoUrl)
      : await readProjectRepoUrl(docsRoot);
  const siteTitle = options.siteTitle?.trim() || undefined;

  // 1. Static-mode SPA build, copied wholesale into the out dir. Every
  //    destination is checked before the first copy, and again at its write.
  const dist = await ensureSpaBuilt({ mode: "static", force: options.forceBuild, log });
  const spa = await listSpaDist(dist);
  const spaTargets = out.preflight([
    ...spa.dirs.map((path) => ({ path, intent: "mkdir" as const })),
    ...spa.files.map((path) => ({ path, intent: "write" as const })),
  ]);
  if (!spaTargets.ok) throw new Error(`Export output refused: ${spaTargets.detail}`);
  await out.mkdir("", { recursive: true });
  for (const dir of spa.dirs) await out.mkdir(dir, { recursive: true });
  for (const file of spa.files) {
    if (file !== "index.html") {
      await out.writeFile(file, await readFile(join(dist, file)));
      continue;
    }
    // Per-export index.html tweaks (the shared SPA build stays untouched):
    // the pre-JS <title> (the SPA also reads it from data/site.json), and an
    // empty icon so browsers do not probe the HOST root's /favicon.ico — on
    // a subpath deploy that is outside the export and 404s.
    let html = await readFile(join(dist, file), "utf8");
    if (siteTitle) {
      html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(siteTitle)}</title>`);
    }
    if (!/<link[^>]+rel=["']?(?:shortcut )?icon/i.test(html)) {
      html = html.replace(/<\/head>/i, '    <link rel="icon" href="data:," />\n  </head>');
    }
    await out.writeFile(file, html);
  }

  await out.mkdir("data", { recursive: true });

  // 1b. Public-site chrome, read at runtime so one SPA build serves any corpus.
  const site: StaticSiteConfig = {
    ...(repoUrl ? { repoUrl } : {}),
    ...(siteTitle ? { title: siteTitle } : {}),
  };
  await out.writeFile("data/site.json", JSON.stringify(site, null, 2));

  // 2. Tree snapshot (same shape as GET /api/tree).
  const tree: DocsTreeNode[] = await walkDocsDir(docsRoot);
  await out.writeFile("data/tree.json", JSON.stringify({ tree }, null, 2));

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
    const bundleJsonPath = `data/bundles/${bundlePath}.json`;
    await out.mkdir(dirname(bundleJsonPath), { recursive: true });
    await out.writeFile(bundleJsonPath, JSON.stringify(bundleResponse(loaded), null, 2));

    const markdownPath = `data/markdown/${bundlePath}.md`;
    await out.mkdir(dirname(markdownPath), { recursive: true });
    await out.writeFile(markdownPath, projectToMarkdown(loaded.document));
    bundlesExported += 1;
  }

  // 4. Copy asset + canvas files (everything under an assets/ dir).
  const assetFiles = await collectAssetFiles(docsRoot);
  let filesCopied = 0;
  const corpus = docsFs(docsRoot);
  for (const relPath of assetFiles) {
    const target = `data/files/${relPath}`;
    await out.mkdir(dirname(target), { recursive: true });
    await out.writeFile(target, await corpus.readFile(relPath));
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
  await out.writeFile("data/backlinks.json", JSON.stringify(backlinks, null, 2));

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
    await out.writeFile("data/theme.json", JSON.stringify({ theme }, null, 2));
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
