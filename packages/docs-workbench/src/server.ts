import { createSharedDocsApiProxy, type SharedDocsApiOptions } from "./shared-api";
import { handlePdfExport } from "./pdf-export";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { Elysia } from "elysia";
import type { Database } from "bun:sqlite";
import { openBacklinksDb, rescanAll } from "@codecaine-ai/docs-index/backlinks";
import {
  createDocsRoutes,
  createDocsStore,
  primeBacklinksDb,
  resolveStaticFilePath,
  validateCanvasPayload,
  watchDocsRoot,
} from "@codecaine-ai/docs-server";

/**
 * Standalone docs server: serves a `--root` docs tree of doc.json bundles
 * through @codecaine-ai/docs-server's route factory — the SAME route source
 * every host uses, so `/api/*` here is response-shape-identical to any other
 * docs-server host. This app owns only the docs-root/SPA plumbing:
 *
 *   - the full read+write `/api/*` route table comes from
 *     `createDocsRoutes(createDocsStore(docsRoot))` (see routes.ts in
 *     @codecaine-ai/docs-server for the table);
 *   - `/*` serves the built SPA (when staticDir is provided), confined via
 *     `resolveStaticFilePath`;
 *   - the backlinks index is built/rescanned at boot (`initBacklinksDb`) and
 *     primed into the docs-server backlinks cache so the read route and the
 *     save-path indexers share one connection.
 *
 * EVERY path input goes through the confinement helpers
 * (@codecaine-ai/docs-index/paths + @codecaine-ai/docs-server confine) — no
 * traversal outside the docs root or the SPA dist dir is possible. The
 * default bind stays loopback (`startDocsServe`): the served tree may be
 * private, and the write routes make loopback confinement doubly important.
 */

// Re-exported for existing consumers/tests of the serve app's surface.
export { validateCanvasPayload };

export interface DocsServeAppOptions {
  /** Route document API traffic through the shared authority; credentials stay server-side. */
  sharedApi?: SharedDocsApiOptions;
  /** Absolute path to the docs tree to serve. */
  docsRoot: string;
  /** Theme folder used by the theme API; defaults to the docs-root sibling. */
  themesRoot?: string;
  /** Built SPA directory to serve at `/`; omit for API-only (tests). */
  staticDir?: string | null;
  /**
   * Watch the docs tree on disk and publish change events for edits made
   * OUTSIDE the API (hand edits, agents, CLI writes) so open workbench tabs
   * live-reload them over the existing SSE stream. The watcher is closed via
   * the app's `stop()` lifecycle (`onStop`). Defaults OFF for bare embedding
   * (an app that never `listen()`s/`stop()`s would leak the watcher);
   * `runServe` turns it on.
   */
  watchFs?: boolean;
  /**
   * Serve as a theme CONSUMER (`docs-cli serve --theme-locked`): the docs
   * routes refuse theme writes, and `GET /api/serve-config` tells the SPA
   * to pin the repo default theme and hide the style rail. Set by secondary
   * apps whose theme is authored in the primary docs-system checkout —
   * without it each origin's localStorage rail state wins and viewers drift.
   */
  themeLocked?: boolean;
  /** Docs kernel origin exposed to the lab UI. */
  kernelUrl?: string;
  /** Kernel corpus this served docs tree belongs to. */
  corpus?: string;
  /** Explicit development UI origins allowed to request offline PDF printing. */
  pdfOrigins?: string[];
}

/**
 * Opens (and populates) the backlinks index for `docsRoot`. Prefers the
 * on-tree `<root>/.index/backlinks.db`; when the tree is not writable the
 * index falls back to an in-memory database so read-only checkouts still get
 * backlinks (rebuilt per process).
 */
export async function initBacklinksDb(
  docsRoot: string,
): Promise<{ db: Database; dbPath: string; sourcesScanned: number; refsIndexed: number }> {
  try {
    const db = await openBacklinksDb(docsRoot);
    const result = await rescanAll(docsRoot, db);
    return { db, ...result };
  } catch {
    const db = await openBacklinksDb(":memory:");
    const result = await rescanAll(docsRoot, db);
    return { db, ...result, dbPath: ":memory:" };
  }
}

export function createDocsServeApp(options: DocsServeAppOptions) {
  const docsRoot = options.docsRoot;
  const staticDir = options.staticDir ?? null;

  const themeLocked = !!options.themeLocked;
  const kernelUrl = options.kernelUrl ?? "http://127.0.0.1:4840";
  const corpus = options.corpus ?? "docs-system";
  const app = new Elysia();
  if (options.sharedApi) {
    const proxy = createSharedDocsApiProxy(options.sharedApi);
    app.onRequest(({ request }) => {
      const pathname = new URL(request.url).pathname;
      if (themeLocked && /^\/api\/themes(?:\/|$)/.test(pathname) && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        return Response.json({ detail: "Theme is locked on this serve: edit the theme in the primary docs-system app." }, { status: 403 });
      }
      if (pathname.startsWith("/api/") && pathname !== "/api/serve-config" && pathname !== "/api/lab-config" && pathname !== "/api/export-pdf") {
        return proxy(request);
      }
    });
  } else {
    // Local mode preserves existing hosts. Shared mode owns no second store,
    // index, or watcher: all clients use the authority's locks and event stream.
    const backlinksReady = initBacklinksDb(docsRoot);
    backlinksReady.catch(() => {});
    primeBacklinksDb(docsRoot, backlinksReady.then((result) => result.db));
    const store = createDocsStore(docsRoot);
    app.use(createDocsRoutes(store, { themeLocked, themesRoot: options.themesRoot }));
    if (options.watchFs) {
      const watcher = watchDocsRoot(docsRoot, (event) => store.publishChange(event));
      app.onStop(() => watcher.close());
    }
  }
  app
    .post("/api/export-pdf", ({ request }) => handlePdfExport(request, options.pdfOrigins), { parse: "none" })
    // Serve config lives at the WORKBENCH level, not in the docs-server
    // route table: themeLocked is a property of this serve invocation, not
    // of the docs tree, so hosts embedding createDocsRoutes directly are
    // untouched. The SPA reads it once at boot to pick its theme path.
    .get("/api/serve-config", () => ({ themeLocked }))
    .get("/api/lab-config", () => ({ kernelUrl, corpus }));

  if (staticDir) {
    const indexAbs = join(staticDir, "index.html");
    // Without explicit cache headers browsers cache heuristically, so a tab
    // can keep loading a pre-rebuild bundle entirely from cache. The shell
    // must always revalidate; hashed /assets/ files are immutable by name.
    const serveIndex = async () =>
      new Response(await readFile(indexAbs), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    app.get("/*", async ({ path }) => {
      if (path === "/" || path === "/index.html") return serveIndex();
      const abs = resolveStaticFilePath(staticDir, path);
      if (abs && existsSync(abs)) {
        const st = await stat(abs);
        if (st.isFile()) {
          return new Response(await readFile(abs), {
            headers: {
              "Content-Type": Bun.file(abs).type,
              "Cache-Control": path.startsWith("/assets/")
                ? "public, max-age=31536000, immutable"
                : "no-cache",
            },
          });
        }
      }
      // Unsafe or unknown paths fall back to the SPA shell (hash routing —
      // deep links never encode docs paths in the pathname), never to disk.
      return serveIndex();
    });
  }

  return app;
}

export interface StartDocsServeOptions extends DocsServeAppOptions {
  port: number;
  /** Bind address. Defaults to loopback — the served docs tree may be private. */
  hostname?: string;
}

export function startDocsServe(options: StartDocsServeOptions) {
  const app = createDocsServeApp(options);
  app.listen({ hostname: options.hostname ?? "127.0.0.1", port: options.port });
  return app;
}
