import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Locating + building the viewer SPA (packages/docs-workbench/web).
 *
 * "clone -> bun install -> docs-cli serve" UX: the SPA is vite-built into
 * `web/dist` (or `web/dist-static` for the export data-layer variant) on
 * first use and reused afterwards — and REBUILT automatically whenever an
 * SPA-reachable source file is newer than the cached build. This is a
 * startup staleness check, not a watcher: without it, a dogfooding checkout
 * silently serves whatever UI happened to be built last, which reads as "my
 * changes aren't there" with no hint why. Pass `force: true` to rebuild
 * unconditionally.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** packages/docs-workbench/web — the Vite project directory. */
export function webDir(): string {
  return join(HERE, "..", "web");
}

/** Built SPA output dir for the given mode. */
export function spaDistDir(mode: "serve" | "static"): string {
  return join(webDir(), mode === "static" ? "dist-static" : "dist");
}

/** Directory names that are never SPA source (skipped by the staleness scan). */
const SCAN_SKIP = new Set(["node_modules", "dist", "dist-static", ".git", ".index", "__tests__"]);

/** Newest mtime (ms) of any file under `dir`, skipping SCAN_SKIP dirs. 0 if absent. */
function newestMtimeMs(dir: string): number {
  let newest = 0;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (SCAN_SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtimeMs(full));
    } else if (entry.isFile()) {
      try {
        newest = Math.max(newest, statSync(full).mtimeMs);
      } catch {
        // Raced a deletion — ignore.
      }
    }
  }
  return newest;
}

/**
 * Everything the SPA build can pull in from this workspace: the web app
 * itself plus the workspace packages its imports reach (docs-viewer and,
 * through it, docs-model; the canvas embeds). Server-only packages
 * (docs-server, docs-index, docs-cli) are not bundled and don't gate a
 * rebuild. Coarse on purpose — an occasional unnecessary rebuild is cheap;
 * a silently stale UI is not.
 */
function spaSourceRoots(): string[] {
  const packagesDir = join(HERE, "..", "..");
  const repoRoot = join(packagesDir, "..");
  return [
    webDir(),
    join(packagesDir, "docs-workbench", "src"),
    join(packagesDir, "docs-viewer", "src"),
    join(packagesDir, "docs-model", "src"),
    join(repoRoot, "external", "canvas", "packages"),
  ];
}

export interface EnsureSpaBuiltOptions {
  mode: "serve" | "static";
  force?: boolean;
  log?: (message: string) => void;
}

/**
 * Ensures the SPA is built for `mode`, running `vite build` (through bun) on
 * first use or when the cached build is older than the SPA sources. Returns
 * the dist directory containing index.html.
 */
export async function ensureSpaBuilt(options: EnsureSpaBuiltOptions): Promise<string> {
  const dist = spaDistDir(options.mode);
  const indexHtml = join(dist, "index.html");
  const log = options.log ?? (() => {});

  if (!options.force && existsSync(indexHtml)) {
    const builtAt = statSync(indexHtml).mtimeMs;
    const sourcesAt = Math.max(...spaSourceRoots().map(newestMtimeMs));
    if (sourcesAt <= builtAt) return dist;
    log(`[docs-workbench] SPA sources changed since the last build — rebuilding...`);
  } else if (!options.force) {
    log(`[docs-workbench] Building viewer SPA (${options.mode} mode) — first run only...`);
  } else {
    log(`[docs-workbench] Building viewer SPA (${options.mode} mode, forced)...`);
  }

  const proc = Bun.spawnSync(["bun", "x", "vite", "build"], {
    cwd: webDir(),
    env: {
      ...process.env,
      ...(options.mode === "static" ? { DOCS_STATIC: "1" } : {}),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    const out = proc.stdout.toString();
    const err = proc.stderr.toString();
    throw new Error(`vite build failed (exit ${proc.exitCode}):\n${out}\n${err}`);
  }
  if (!existsSync(indexHtml)) {
    throw new Error(`vite build produced no index.html at ${indexHtml}`);
  }
  log(`[docs-workbench] SPA built at ${dist}`);
  return dist;
}
