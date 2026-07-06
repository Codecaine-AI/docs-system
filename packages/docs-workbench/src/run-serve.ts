import { existsSync } from "node:fs";
import { join } from "node:path";

import { startDocsServe } from "./server";
import { ensureSpaBuilt, webDir } from "./spa";

/**
 * `docs-cli serve` entrypoint. Default mode builds the SPA once (vite build,
 * cached in packages/docs-workbench/web/dist) and serves API + static SPA from ONE port.
 * `--dev` instead starts the API alone and spawns `vite dev` with an /api
 * proxy pointed at it (SPA hot reload; two ports).
 */
export interface RunServeOptions {
  docsRoot: string;
  port: number;
  /** Bind address. Defaults to loopback — the served docs tree may be private. */
  hostname?: string;
  dev?: boolean;
  /** Rebuild the SPA even when a build already exists. */
  forceBuild?: boolean;
  log?: (message: string) => void;
}

export async function runServe(options: RunServeOptions): Promise<void> {
  const log = options.log ?? ((message: string) => console.error(message));
  const { docsRoot, port } = options;
  const hostname = options.hostname ?? "127.0.0.1";
  const displayHost = hostname === "0.0.0.0" ? "localhost" : hostname;

  if (!existsSync(join(docsRoot, "."))) {
    throw new Error(`Docs root does not exist: ${docsRoot}`);
  }

  if (options.dev) {
    startDocsServe({ docsRoot, port, hostname, staticDir: null });
    log(`[docs-workbench] API listening on http://${displayHost}:${port} (docs root: ${docsRoot})`);
    log(`[docs-workbench] Starting vite dev server (proxying /api -> :${port})...`);
    const proc = Bun.spawn(["bun", "x", "vite"], {
      cwd: webDir(),
      env: { ...process.env, DOCS_API: `http://localhost:${port}` },
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
    return;
  }

  const staticDir = await ensureSpaBuilt({ mode: "serve", force: options.forceBuild, log });
  startDocsServe({ docsRoot, port, hostname, staticDir });
  log(`[docs-workbench] Serving docs from ${docsRoot}`);
  log(`[docs-workbench] http://${displayHost}:${port}`);
}
