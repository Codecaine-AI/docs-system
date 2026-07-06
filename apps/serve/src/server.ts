import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { Elysia, t } from "elysia";
import type { Database } from "bun:sqlite";
import { openBacklinksDb, queryInboundTolerant, rescanAll } from "@codecaine-ai/docs-index/backlinks";

import { bundleResponse, createContentHash, loadDocBundle, loadDocProjection } from "./bundle";
import {
  MAX_ASSET_BYTES,
  MAX_CANVAS_FILE_BYTES,
  inferAssetContentType,
  resolveAssetRootRelativePath,
  resolveCanvasSidecarRootRelativePath,
  resolveStaticFilePath,
} from "./confine";
import { walkDocsDir } from "./docs-tree";

/**
 * Standalone read-only docs server: serves a `--root` docs tree of doc.json
 * bundles over the same response shapes Spectre's data-backend exposes under
 * `/projects/:id/docs/*`, minus the project scoping (and minus every
 * mutation route — there are NO write endpoints here, by design).
 *
 * Route table (all GET, all read-only):
 *   /api/tree                 -> { tree: DocsTreeNode[] }
 *   /api/bundle?path=         -> { path, document_path, doc, doc_hash, comments, comments_hash }
 *   /api/markdown?path=       -> { markdown } (projectToMarkdown projection)
 *   /api/canvas?src=          -> { canvas_path, canvas_document_path, content_hash, canvas }
 *   /api/asset?path=          -> raw asset bytes (confined to assets/images|attachments)
 *   /api/backlinks?target=    -> { target, backlinks: BacklinkRow[] }
 *   /*                        -> built SPA (when staticDir is provided)
 *
 * EVERY path input goes through the confinement helpers
 * (@codecaine-ai/docs-index/paths + ./confine) — no traversal outside the
 * docs root or the SPA dist dir is possible.
 */

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

/**
 * Light structural check on a canvas sidecar payload before it goes over the
 * wire — mirrors Spectre's `validateCanvasPayload` (the full schema
 * validation happens client-side via `validateInteractiveCanvasDocument`).
 */
export function validateCanvasPayload(value: unknown): { ok: true } | { ok: false; detail: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, detail: "Canvas payload must be an object" };
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) {
    return { ok: false, detail: "Canvas schemaVersion must be 1" };
  }
  if (typeof record.id !== "string" || !record.id.trim()) {
    return { ok: false, detail: "Canvas id is required" };
  }
  if (record.mode !== "diagram") {
    return { ok: false, detail: "Canvas mode must be diagram" };
  }
  if (!Array.isArray(record.objects) || !Array.isArray(record.connections)) {
    return { ok: false, detail: "Canvas objects and connections must be arrays" };
  }
  return { ok: true };
}

export function createDocsServeApp(options: DocsServeAppOptions) {
  const docsRoot = options.docsRoot;
  const staticDir = options.staticDir ?? null;

  // Kicked off at app creation; the backlinks route awaits it. A failed
  // build (e.g. an unreadable tree) fails the route, not the whole server.
  const backlinksReady = initBacklinksDb(docsRoot);
  backlinksReady.catch(() => {});

  const app = new Elysia()
    .get(
      "/api/tree",
      async ({ set }) => {
        try {
          return { tree: await walkDocsDir(docsRoot) };
        } catch (error) {
          set.status = 500;
          return {
            detail: `Failed to walk docs tree: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    )
    .get(
      "/api/bundle",
      async ({ query, set }) => {
        const loaded = await loadDocBundle(docsRoot, query.path);
        if ("error" in loaded) {
          set.status = loaded.error.status;
          return { detail: loaded.error.detail };
        }
        return bundleResponse(loaded);
      },
      { query: t.Object({ path: t.String({ minLength: 1 }) }) },
    )
    .get(
      "/api/markdown",
      async ({ query, set }) => {
        const projected = await loadDocProjection(docsRoot, query.path);
        if ("error" in projected) {
          set.status = projected.error.status;
          return { detail: projected.error.detail };
        }
        return projected;
      },
      { query: t.Object({ path: t.String({ minLength: 1 }) }) },
    )
    .get(
      "/api/canvas",
      async ({ query, set }) => {
        const src = query.src;
        const canvasRelPath = resolveCanvasSidecarRootRelativePath(docsRoot, src);
        if (!canvasRelPath) {
          set.status = 400;
          return { detail: `Invalid canvas sidecar path: ${src}` };
        }
        const canvasAbs = join(docsRoot, canvasRelPath);
        let st;
        try {
          st = await stat(canvasAbs);
        } catch {
          set.status = 404;
          return { detail: `Canvas sidecar not found: ${src}` };
        }
        if (!st.isFile()) {
          set.status = 404;
          return { detail: `Canvas sidecar is not a file: ${src}` };
        }
        if (st.size > MAX_CANVAS_FILE_BYTES) {
          set.status = 413;
          return { detail: `Canvas sidecar exceeds size cap: ${src}` };
        }
        const canvasContent = await readFile(canvasAbs, "utf8");
        let canvas: unknown;
        try {
          canvas = JSON.parse(canvasContent);
        } catch {
          set.status = 400;
          return { detail: `Canvas sidecar is invalid JSON: ${src}` };
        }
        const payloadValidation = validateCanvasPayload(canvas);
        if (!payloadValidation.ok) {
          set.status = 400;
          return { detail: payloadValidation.detail };
        }
        return {
          canvas_path: canvasRelPath,
          canvas_document_path: `docs/${canvasRelPath}`,
          content_hash: createContentHash(canvasContent),
          canvas,
        };
      },
      { query: t.Object({ src: t.String({ minLength: 1 }) }) },
    )
    .get(
      "/api/asset",
      async ({ query, set }) => {
        const assetAbs = resolveAssetRootRelativePath(docsRoot, query.path);
        if (!assetAbs) {
          set.status = 400;
          return { detail: `Invalid asset path: ${query.path}` };
        }
        let st;
        try {
          st = await stat(assetAbs);
        } catch {
          set.status = 404;
          return { detail: `Asset not found: ${query.path}` };
        }
        if (!st.isFile()) {
          set.status = 404;
          return { detail: `Asset path is not a file: ${query.path}` };
        }
        if (st.size > MAX_ASSET_BYTES) {
          set.status = 413;
          return { detail: `Asset exceeds size cap: ${query.path}` };
        }
        return new Response(await readFile(assetAbs), {
          headers: {
            "Content-Type": inferAssetContentType(assetAbs),
            "Cache-Control": "private, max-age=300",
          },
        });
      },
      { query: t.Object({ path: t.String({ minLength: 1 }) }) },
    )
    .get(
      "/api/backlinks",
      async ({ query, set }) => {
        try {
          const { db } = await backlinksReady;
          return { target: query.target, backlinks: queryInboundTolerant(db, query.target) };
        } catch (error) {
          set.status = 500;
          return {
            detail: `Failed to query backlinks index: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
      { query: t.Object({ target: t.String({ minLength: 1 }) }) },
    );

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
