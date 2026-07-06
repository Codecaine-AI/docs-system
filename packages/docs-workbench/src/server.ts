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
  /** Absolute path to the docs tree to serve. */
  docsRoot: string;
  /** Built SPA directory to serve at `/`; omit for API-only (tests). */
  staticDir?: string | null;
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

  // Kicked off at app creation; the backlinks route awaits it (through the
  // primed cache). A failed build (e.g. an unreadable tree) fails the route,
  // not the whole server.
  const backlinksReady = initBacklinksDb(docsRoot);
  backlinksReady.catch(() => {});
  primeBacklinksDb(docsRoot, backlinksReady.then((result) => result.db));

  const store = createDocsStore(docsRoot);
  const app = new Elysia().use(createDocsRoutes(store));

  if (staticDir) {
    const indexAbs = join(staticDir, "index.html");
    const serveIndex = async () =>
      new Response(await readFile(indexAbs), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    app.get("/*", async ({ path }) => {
      if (path === "/" || path === "/index.html") return serveIndex();
      const abs = resolveStaticFilePath(staticDir, path);
      if (abs && existsSync(abs)) {
        const st = await stat(abs);
        if (st.isFile()) {
          return new Response(await readFile(abs), {
            headers: { "Content-Type": Bun.file(abs).type },
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
