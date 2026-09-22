import { sharedDocsApiFromEnvironment, type SharedDocsApiOptions } from "./shared-api";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { startDocsServe } from "./server";
import { ensureSpaBuilt, webDir } from "./spa";
import { centralProjectUrl } from "./central-service";

/**
 * `docs-cli serve` connects to the installed central host by default.
 * Explicit standalone mode builds the SPA once (vite build,
 * cached in packages/docs-workbench/web/dist) and serves API + static SPA from ONE port.
 * `--dev` instead starts the API alone and spawns `vite dev` with an /api
 * proxy pointed at it (SPA hot reload; two ports).
 */
export interface RunServeOptions {
  /** Explicit opt-out for isolated renderer development and standalone embedding. */
  standalone?: boolean;
  sharedApi?: SharedDocsApiOptions;
  docsRoot: string;
  /** Theme folder used by the theme API; defaults to the docs-root sibling. */
  themesRoot?: string;
  port: number;
  /** Bind address. Defaults to loopback — the served docs tree may be private. */
  hostname?: string;
  dev?: boolean;
  uiPort?: number;
  /** Rebuild the SPA even when a build already exists. */
  forceBuild?: boolean;
  /**
   * Serve as a theme CONSUMER: the viewer pins the repo default theme,
   * hides the style rail, and the server refuses theme writes. For
   * secondary apps that serve their docs with this framework but must
   * inherit the primary docs-system theme rather than tune their own.
   */
  themeLocked?: boolean;
  /** Docs kernel origin exposed to the lab UI. */
  kernelUrl?: string;
  /** Kernel corpus this served docs tree belongs to. */
  corpus?: string;
  log?: (message: string) => void;
}

export async function runServe(options: RunServeOptions): Promise<void> {
  const log = options.log ?? ((message: string) => console.error(message));
  const { docsRoot, port } = options;
  const configuredSharedApi = options.sharedApi ?? sharedDocsApiFromEnvironment();
  if (!options.standalone && !configuredSharedApi) {
    const centralUrl = await centralProjectUrl(docsRoot);
    if (centralUrl) {
      const customThemes = options.themesRoot && resolve(options.themesRoot) !== resolve(webDir(), '../../../themes');
      if (options.themeLocked || customThemes || options.kernelUrl || options.corpus) {
        throw new Error('Custom theme or kernel serve options require --standalone. The central host uses each registered project\'s configuration.');
      }
      log(`[docs-workbench] ${centralUrl}`); return;
    }
  }
  const sharedApi = configuredSharedApi && options.dev ? {
    ...configuredSharedApi,
    allowedBrowserOrigins: [
      ...(configuredSharedApi.allowedBrowserOrigins ?? []),
      `http://localhost:${options.uiPort ?? 4801}`,
      `http://127.0.0.1:${options.uiPort ?? 4801}`,
    ],
  } : configuredSharedApi;
  const hostname = options.hostname ?? "127.0.0.1";
  const displayHost = hostname === "0.0.0.0" ? "localhost" : hostname;

  if (!existsSync(join(docsRoot, "."))) {
    throw new Error(`Docs root does not exist: ${docsRoot}`);
  }

  if (options.dev) {
    startDocsServe({
      sharedApi,
      docsRoot,
      themesRoot: options.themesRoot,
      port,
      hostname,
      staticDir: null,
      pdfOrigins: [`http://localhost:${options.uiPort ?? 4801}`, `http://127.0.0.1:${options.uiPort ?? 4801}`],
      watchFs: true,
      themeLocked: options.themeLocked,
      kernelUrl: options.kernelUrl,
      corpus: options.corpus,
    });
    log(`[docs-workbench] API listening on http://${displayHost}:${port} (docs root: ${docsRoot})`);
    log(`[docs-workbench] Starting vite dev server (proxying /api -> :${port})...`);
    const viteArgs =
      options.uiPort === undefined
        ? ["bun", "x", "vite"]
        : ["bun", "x", "vite", "--port", String(options.uiPort), "--strictPort", "--host", "127.0.0.1"];
    if (options.uiPort !== undefined) {
      log(`[docs-workbench] UI listening on http://localhost:${options.uiPort}`);
    }
    const proc = Bun.spawn(viteArgs, {
      cwd: webDir(),
      env: { ...process.env, DOCS_API: `http://localhost:${port}` },
      stdout: "inherit",
      stderr: "inherit",
    });
    const shutdown = () => {
      proc.kill();
      process.exit();
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
    process.on("exit", () => proc.kill());
    await proc.exited;
    process.exit(proc.exitCode ?? 1);
  }

  const staticDir = await ensureSpaBuilt({ mode: "serve", force: options.forceBuild, log });
  startDocsServe({
    sharedApi,
    docsRoot,
    themesRoot: options.themesRoot,
    port,
    hostname,
    staticDir,
    watchFs: true,
    themeLocked: options.themeLocked,
    kernelUrl: options.kernelUrl,
    corpus: options.corpus,
  });
  log(`[docs-workbench] Serving docs from ${docsRoot}`);
  log(`[docs-workbench] http://${displayHost}:${port}`);
}
