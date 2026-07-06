import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Locating + building the viewer SPA (packages/docs-workbench/web).
 *
 * "clone -> bun install -> docs-cli serve" UX: the SPA is vite-built into
 * `web/dist` (or `web/dist-static` for the export data-layer variant) on
 * first use and reused afterwards. Pass `force: true` to rebuild.
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

export interface EnsureSpaBuiltOptions {
  mode: "serve" | "static";
  force?: boolean;
  log?: (message: string) => void;
}

/**
 * Ensures the SPA is built for `mode`, running `vite build` (through bun) on
 * first use. Returns the dist directory containing index.html.
 */
export async function ensureSpaBuilt(options: EnsureSpaBuiltOptions): Promise<string> {
  const dist = spaDistDir(options.mode);
  const indexHtml = join(dist, "index.html");
  if (!options.force && existsSync(indexHtml)) return dist;

  const log = options.log ?? (() => {});
  log(`[docs-workbench] Building viewer SPA (${options.mode} mode) — first run only...`);

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
