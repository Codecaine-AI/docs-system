import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { Elysia, sse, t } from "elysia";
import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";
import { ACTION_REGISTRY, buildBlocksDiscovery } from "@codecaine-ai/docs-model";

import type { DocsStore } from "./store";
import { bundleResponse, createContentHash } from "./bundle";
import {
  MAX_CANVAS_FILE_BYTES,
  MAX_SEQUENCE_FILE_BYTES,
  resolveCanvasSidecarRootRelativePath,
  resolveSequenceSidecarRootRelativePath,
} from "./confine";
import { listCanvasSidecars, validateCanvasPayload } from "./canvas-sidecar";
import { validateSequencePayload } from "./sequence-sidecar";
import type { DocsChangeEvent } from "./docs-events";
import { isValidThemeId, listRepoThemes, readRepoTheme, themesRootFor, writeRepoTheme } from "./themes";

/**
 * GET /api/blocks payload — the agent edit-surface discovery document, so
 * agents learn HOW to edit each block type instead of reverse-engineering
 * props JSON. Pure static metadata derived entirely from docs-model exports
 * (kernel op vocabulary in doc-ops.ts + the component registry), computed
 * once at module load: no doc loading, no per-request work, no auth changes.
 *
 * The viewer's block registry carries richer render-level `agentDescription`
 * prose per block type; that is INTENTIONALLY not served here — the server
 * must not depend on docs-viewer. A future unification can move those prose
 * descriptions into docs-model and surface them from this endpoint.
 */
const BLOCKS_DISCOVERY = buildBlocksDiscovery();

/**
 * Permissive dev CORS. This server is a LOCAL DEV TOOL serving a repo on the
 * developer's own machine; cross-origin editor SPAs (e.g. Canvas Studio, a
 * separate Vite app on another port) call `/api/*` directly, so every origin
 * is allowed to read and write. Do not ship this policy on anything exposed
 * beyond localhost.
 */
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, PUT, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "Content-Type",
} as const;

/**
 * `createDocsRoutes(store)` — the full docs read+write HTTP surface as an
 * Elysia plugin, mounted under `/api/*`. Read routes keep the exact
 * paths/response shapes the standalone read-only serve app exposed; write
 * routes mirror the reference host's `/projects/:id/docs/*` contracts
 * (ops with `expected_hash` -> 409, draft locks -> 423, annotations, assets,
 * move, undo, SSE change events) minus the project scoping.
 *
 * Route table:
 *   GET  /api/tree                          -> { tree }
 *   GET  /api/bundle?path=                  -> { path, document_path, doc, doc_hash, annotations, annotations_hash }
 *   GET  /api/markdown?path=                -> { markdown }
 *   GET  /api/canvas?src=                   -> { canvas_path, canvas_document_path, content_hash, canvas }
 *   GET  /api/canvases                      -> { canvases: [{ src, canvas_path, id, title, updated_at }] }
 *   GET  /api/canvas-by-doc?path=&src=      -> doc-relative sidecar read
 *   GET  /api/sequence?src=                 -> { sequence_path, sequence_document_path, content_hash, sequence }
 *   GET  /api/sequence-by-doc?path=&src=    -> doc-relative sequence sidecar read
 *   GET  /api/asset?path=                   -> raw asset bytes
 *   GET  /api/backlinks?target=             -> { target, backlinks }
 *   GET  /api/blocks                        -> { schemaVersion, ops, components } (static edit-surface discovery)
 *   GET  /api/themes                        -> { themes: [{ id, name }] } (repo themes/ folders)
 *   GET  /api/themes/:themeId               -> { theme: { id, manifest, components } } | 404
 *   POST /api/themes                        -> 201 { theme } | 400 (writes themes/<id>/ folder) | 403 themeLocked
 *   POST /api/ops                           -> doc ops or one forwarded canvas/sequence action | 400/409/423
 *   GET  /api/annotations?path=             -> { annotations, hash }
 *   POST /api/annotations                   -> 201 { annotation, annotations, hash } | 409/423
 *   POST /api/annotations/:annotationId/resolve -> { annotations, hash } | 404/409/423
 *   POST /api/draft-lock/acquire            -> { ok, lock } | 423 { ok:false, reason, heldBy }
 *   POST /api/draft-lock/heartbeat          -> same as acquire
 *   POST /api/draft-lock/release            -> { ok: true }
 *   POST /api/assets (multipart)            -> 201 { src, path, document_path, content_type, size, filename }
 *   POST /api/assets/video (multipart)      -> 201 same shape; strict video allowlist, 64MB cap, assets/videos/
 *   POST /api/move                          -> { moved, rewrittenSources, failures }
 *   POST /api/undo                          -> { ok, doc|canvas|sequence, hash } | 404/409
 *   PUT  /api/canvas                        -> save existing sidecar | 409/423. Two body forms:
 *                                              {path, src, ...} = doc-relative (src resolved against
 *                                              the referencing doc's directory); {src, ...} with no
 *                                              path = src-rooted (docs-root-relative src, the form
 *                                              Canvas Studio saves after GET /api/canvases; response
 *                                              carries path/document_path as explicit nulls)
 *   POST /api/canvas                        -> 201 create sidecar (+ optional MDX insert) | 409/423
 *   DELETE /api/canvas?path=&src=           -> { path, canvas_path, mdx_content_hash?, deleted }
 *   PUT  /api/sequence                      -> save existing doc-relative sequence sidecar | 409/423
 *   POST /api/sequence                      -> 201 create sequence sidecar | 409/423
 *   DELETE /api/sequence?path=&src=         -> { path, sequence_path, deleted }
 *   GET  /api/events                        -> SSE change-event stream
 *
 * `options.themeLocked` marks this host a theme CONSUMER (`docs-cli serve
 * --theme-locked`): POST /api/themes is refused with 403 before any
 * validation or write — the primary docs-system app owns the themes/ folder.
 * Theme READS stay open; locked viewers still inherit the repo theme.
 *
 * NOTE (SSE): Elysia treats an async generator handler as a stream natively;
 * yields wrapped with the `sse()` helper flip the response into SSE mode
 * with a single, correct `text/event-stream` content-type — do NOT also set
 * it manually via `set.headers`, Bun merges the two into
 * "text/event-stream, text/plain" which browsers' EventSource rejects.
 */
export function createDocsRoutes(store: DocsStore, options?: { themeLocked?: boolean }) {
  return new Elysia({ name: "docs-server-routes" })
    // -- dev CORS (see CORS_HEADERS above) -------------------------------------
    // onRequest runs before routing, so success, validation-error, and 404
    // responses all carry the headers — verified for both the standalone
    // plugin and hosts mounting it via .use().
    .onRequest(({ set }) => {
      Object.assign(set.headers, CORS_HEADERS);
    })
    .options(
      "/api/*",
      () => new Response(null, { status: 204, headers: CORS_HEADERS }),
    )

    // -- reads ---------------------------------------------------------------
    .get("/api/tree", async ({ set }) => {
      try {
        return { tree: await store.tree() };
      } catch (error) {
        set.status = 500;
        return {
          detail: `Failed to walk docs tree: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    })
    .get(
      "/api/bundle",
      async ({ query, set }) => {
        const loaded = await store.bundle(query.path);
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
        const projected = await store.projection(query.path);
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
        const canvasRelPath = resolveCanvasSidecarRootRelativePath(store.docsRoot, src);
        if (!canvasRelPath) {
          set.status = 400;
          return { detail: `Invalid canvas sidecar path: ${src}` };
        }
        const canvasAbs = join(store.docsRoot, canvasRelPath);
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
    // Read-only inventory of every addressable canvas sidecar under the docs
    // root — external canvas editors (Canvas Studio) list canvases here, then
    // read/save each via GET /api/canvas?src= and PUT /api/canvas.
    .get("/api/canvases", async ({ set }) => {
      try {
        return { canvases: await listCanvasSidecars(store.docsRoot) };
      } catch (error) {
        set.status = 500;
        return {
          detail: `Failed to scan canvas sidecars: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    })
    .get(
      "/api/canvas-by-doc",
      async ({ query, set }) => {
        const loaded = await store.canvasByDocPath(query.path, query.src);
        if ("error" in loaded) {
          set.status = loaded.error.status;
          return { detail: loaded.error.detail };
        }
        return {
          path: loaded.docPath,
          document_path: `docs/${loaded.docPath}`,
          canvas_path: loaded.canvasRelPath,
          canvas_document_path: `docs/${loaded.canvasRelPath}`,
          content_hash: loaded.canvasContentHash,
          canvas: loaded.canvas,
        };
      },
      {
        query: t.Object({
          path: t.String({ minLength: 1 }),
          src: t.String({ minLength: 1 }),
        }),
      },
    )
    .get(
      "/api/sequence",
      async ({ query, set }) => {
        const src = query.src;
        const sequenceRelPath = resolveSequenceSidecarRootRelativePath(store.docsRoot, src);
        if (!sequenceRelPath) {
          set.status = 400;
          return { detail: `Invalid sequence sidecar path: ${src}` };
        }
        const sequenceAbs = join(store.docsRoot, sequenceRelPath);
        let st;
        try {
          st = await stat(sequenceAbs);
        } catch {
          set.status = 404;
          return { detail: `Sequence sidecar not found: ${src}` };
        }
        if (!st.isFile()) {
          set.status = 404;
          return { detail: `Sequence sidecar is not a file: ${src}` };
        }
        if (st.size > MAX_SEQUENCE_FILE_BYTES) {
          set.status = 413;
          return { detail: `Sequence sidecar exceeds size cap: ${src}` };
        }
        const sequenceContent = await readFile(sequenceAbs, "utf8");
        let sequence: unknown;
        try {
          sequence = JSON.parse(sequenceContent);
        } catch {
          set.status = 400;
          return { detail: `Sequence sidecar is invalid JSON: ${src}` };
        }
        const payloadValidation = validateSequencePayload(sequence);
        if (!payloadValidation.ok) {
          set.status = 400;
          return { detail: payloadValidation.detail };
        }
        return {
          sequence_path: sequenceRelPath,
          sequence_document_path: `docs/${sequenceRelPath}`,
          content_hash: createContentHash(sequenceContent),
          sequence,
        };
      },
      { query: t.Object({ src: t.String({ minLength: 1 }) }) },
    )
    .get(
      "/api/sequence-by-doc",
      async ({ query, set }) => {
        const loaded = await store.sequenceByDocPath(query.path, query.src);
        if ("error" in loaded) {
          set.status = loaded.error.status;
          return { detail: loaded.error.detail };
        }
        return {
          path: loaded.docPath,
          document_path: `docs/${loaded.docPath}`,
          sequence_path: loaded.sequenceRelPath,
          sequence_document_path: `docs/${loaded.sequenceRelPath}`,
          content_hash: loaded.sequenceContentHash,
          sequence: loaded.sequence,
        };
      },
      {
        query: t.Object({
          path: t.String({ minLength: 1 }),
          src: t.String({ minLength: 1 }),
        }),
      },
    )
    .get(
      "/api/asset",
      async ({ query, set }) => {
        const result = await store.readAsset(query.path);
        if (!result.ok) {
          set.status = result.status;
          return { detail: result.detail };
        }
        return new Response(await readFile(result.assetAbs), {
          headers: {
            "Content-Type": result.contentType,
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
          return { target: query.target, backlinks: await store.backlinks(query.target) };
        } catch (error) {
          set.status = 500;
          return {
            detail: `Failed to query backlinks index: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
      { query: t.Object({ target: t.String({ minLength: 1 }) }) },
    )

    // Static edit-surface discovery — see BLOCKS_DISCOVERY above.
    .get("/api/blocks", () => BLOCKS_DISCOVERY)

    // -- theme folders (docs/20-implementation/40-theming) ---------------------
    .get("/api/themes", async () => {
      return { themes: await listRepoThemes(themesRootFor(store.docsRoot)) };
    })
    .get("/api/themes/:themeId", async ({ params, set }) => {
      const theme = await readRepoTheme(themesRootFor(store.docsRoot), params.themeId);
      if (!theme) {
        set.status = 404;
        return { detail: `No theme named ${JSON.stringify(params.themeId)}.` };
      }
      return { theme };
    })
    .post("/api/themes", async ({ body, set }) => {
      if (options?.themeLocked) {
        // Refused BEFORE validation: on a locked serve no payload, however
        // well-formed, may touch themes/ — the primary app owns the theme.
        set.status = 403;
        return {
          detail: "Theme is locked on this serve: edit the theme in the primary docs-system app.",
        };
      }
      const payload = body as { id?: unknown; manifest?: unknown; components?: unknown };
      if (typeof payload.id !== "string" || !isValidThemeId(payload.id)) {
        set.status = 400;
        return { detail: "Theme id must be a lowercase slug ([a-z0-9-], max 64 chars)." };
      }
      if (typeof payload.manifest !== "object" || payload.manifest === null) {
        set.status = 400;
        return { detail: "Theme manifest must be an object." };
      }
      const themesRoot = themesRootFor(store.docsRoot);
      await writeRepoTheme(themesRoot, {
        id: payload.id,
        manifest: payload.manifest as Record<string, unknown>,
        components: (payload.components ?? {}) as Record<string, Record<string, unknown>>,
      });
      set.status = 201;
      return { theme: await readRepoTheme(themesRoot, payload.id) };
    })

    // -- doc ops ---------------------------------------------------------------
    .post(
      "/api/ops",
      async ({ body, set }) => {
        const ops = body.ops as DocOp[];
        const forwardedOps = ops.filter((op) => {
          if (op.type !== "componentAction") return false;
          const action = ACTION_REGISTRY.get(op.action);
          return !!action && "forward" in action;
        });
        if (forwardedOps.length > 0) {
          if (ops.length !== 1) {
            set.status = 400;
            return {
              detail: "Forwarded actions must be sent alone.",
              issues: [
                { path: "$.ops", message: "Forwarded actions must be sent alone." },
              ],
            };
          }
          const op = forwardedOps[0] as Extract<DocOp, { type: "componentAction" }>;
          const forwardedAction = ACTION_REGISTRY.get(op.action);
          const authority =
            forwardedAction && "forward" in forwardedAction
              ? forwardedAction.forward.authority
              : undefined;

          if (authority === "sequence") {
            const result = await store.forwardSequenceAction(
              body.path,
              op,
              body.expected_hash,
              body.expected_sequence_hash,
              body.session_id,
            );
            if (!result.ok) {
              set.status = result.status;
              return {
                detail: result.detail,
                current_hash: result.current_hash,
                expected_hash: result.expected_hash,
                issues: result.issues,
                held_by: result.held_by,
              };
            }
            store.publishChange({
              path: result.sequenceRelPath,
              changedIds: result.changedIds,
              patchId: result.patchId,
              actor: body.session_id ?? "anonymous",
            });
            return {
              sequence: result.sequence,
              sequence_hash: result.sequenceHash,
              patch_id: result.patchId,
            };
          }

          const result = await store.forwardCanvasAction(
            body.path,
            op,
            body.expected_hash,
            body.expected_canvas_hash,
            body.session_id,
          );
          if (!result.ok) {
            set.status = result.status;
            return {
              detail: result.detail,
              current_hash: result.current_hash,
              expected_hash: result.expected_hash,
              issues: result.issues,
              held_by: result.held_by,
            };
          }
          store.publishChange({
            path: result.canvasRelPath,
            changedIds: result.changedIds,
            patchId: result.patchId,
            actor: body.session_id ?? "anonymous",
          });
          return {
            canvas: result.canvas,
            canvas_hash: result.canvasHash,
            patch_id: result.patchId,
          };
        }

        const result = await store.applyDocOps(
          body.path,
          ops,
          body.expected_hash,
          body.session_id,
        );
        if (!result.ok) {
          set.status = result.status;
          return {
            detail: result.detail,
            current_hash: result.current_hash,
            expected_hash: result.expected_hash,
            issues: result.issues,
            held_by: result.held_by,
          };
        }
        store.publishChange({
          path: body.path,
          changedIds: ops
            .map((op) => ("blockId" in op ? op.blockId : undefined))
            .filter((id): id is string => !!id),
          patchId: result.patchId,
          actor: body.session_id ?? "anonymous",
        });
        return { doc: result.doc, hash: result.hash, patch_id: result.patchId };
      },
      {
        body: t.Object({
          path: t.String({ minLength: 1 }),
          ops: t.Array(t.Any(), { minItems: 1 }),
          expected_hash: t.Optional(t.String()),
          expected_canvas_hash: t.Optional(t.String()),
          expected_sequence_hash: t.Optional(t.String()),
          session_id: t.Optional(t.String()),
        }),
      },
    )

    // -- annotations ------------------------------------------------------------
    .get(
      "/api/annotations",
      async ({ query, set }) => {
        const result = await store.annotations(query.path);
        if (!result.ok) {
          set.status = result.status;
          return { detail: result.detail };
        }
        return { annotations: result.annotations, hash: result.hash };
      },
      { query: t.Object({ path: t.String({ minLength: 1 }) }) },
    )
    .post(
      "/api/annotations",
      async ({ body, set }) => {
        const result = await store.addAnnotation(
          body.path,
          {
            target: body.target,
            body: body.body,
            intent: body.intent,
            author: body.author,
            expectedHash: body.expected_hash,
          },
          body.session_id,
        );
        if (!result.ok) {
          set.status = result.status;
          return {
            detail: result.detail,
            current_hash: result.current_hash,
            expected_hash: result.expected_hash,
            held_by: result.held_by,
          };
        }
        set.status = 201;
        return { annotation: result.annotation, annotations: result.annotations, hash: result.hash };
      },
      {
        body: t.Object({
          path: t.String({ minLength: 1 }),
          target: t.Any(),
          body: t.String({ minLength: 1 }),
          intent: t.Union([t.Literal("note"), t.Literal("agent-request")]),
          author: t.String({ minLength: 1 }),
          expected_hash: t.Optional(t.String()),
          session_id: t.Optional(t.String()),
        }),
      },
    )
    .post(
      "/api/annotations/:annotationId/resolve",
      async ({ params, body, set }) => {
        const result = await store.resolveAnnotation(
          body.path,
          params.annotationId,
          body.expected_hash,
          body.session_id,
        );
        if (!result.ok) {
          set.status = result.status;
          return {
            detail: result.detail,
            current_hash: result.current_hash,
            expected_hash: result.expected_hash,
            held_by: result.held_by,
          };
        }
        return { annotations: result.annotations, hash: result.hash };
      },
      {
        body: t.Object({
          path: t.String({ minLength: 1 }),
          expected_hash: t.Optional(t.String()),
          session_id: t.Optional(t.String()),
        }),
      },
    )

    // -- draft locks ---------------------------------------------------------------
    .post(
      "/api/draft-lock/acquire",
      ({ body, set }) => {
        const result = store.locks.acquire({ kind: body.kind, path: body.path }, body.sessionId);
        if (!result.ok) {
          set.status = 423;
          return { ok: false, reason: "held-by-other" as const, heldBy: result.heldBy };
        }
        set.status = 200;
        return { ok: true, lock: result.lock };
      },
      {
        body: t.Object({
          path: t.String({ minLength: 1 }),
          kind: t.Union([t.Literal("doc"), t.Literal("canvas"), t.Literal("sequence")]),
          sessionId: t.String({ minLength: 1 }),
        }),
      },
    )
    .post(
      "/api/draft-lock/heartbeat",
      ({ body, set }) => {
        const result = store.locks.heartbeat({ kind: body.kind, path: body.path }, body.sessionId);
        if (!result.ok) {
          set.status = 423;
          return { ok: false, reason: "held-by-other" as const, heldBy: result.heldBy };
        }
        set.status = 200;
        return { ok: true, lock: result.lock };
      },
      {
        body: t.Object({
          path: t.String({ minLength: 1 }),
          kind: t.Union([t.Literal("doc"), t.Literal("canvas"), t.Literal("sequence")]),
          sessionId: t.String({ minLength: 1 }),
        }),
      },
    )
    .post(
      "/api/draft-lock/release",
      ({ body, set }) => {
        store.locks.release({ kind: body.kind, path: body.path }, body.sessionId);
        set.status = 200;
        return { ok: true };
      },
      {
        body: t.Object({
          path: t.String({ minLength: 1 }),
          kind: t.Union([t.Literal("doc"), t.Literal("canvas"), t.Literal("sequence")]),
          sessionId: t.String({ minLength: 1 }),
        }),
      },
    )

    // -- assets ---------------------------------------------------------------
    .post(
      "/api/assets",
      async ({ body, set }) => {
        const result = await store.uploadAsset(body);
        if (!result.ok) {
          set.status = result.status;
          return { detail: result.detail };
        }
        set.status = 201;
        return result.response;
      },
      {
        body: t.Object({
          file: t.File(),
          bundlePath: t.String({ minLength: 1 }),
          kind: t.Optional(t.String()),
        }),
      },
    )

    // Dedicated VIDEO upload (editor drop-a-video-file flow): strict
    // extension/MIME allowlist, 64MB cap (413 over), writes into the bundle's
    // `assets/videos/` with collision-suffixed naming — see uploadDocVideoAsset.
    .post(
      "/api/assets/video",
      async ({ body, set }) => {
        const result = await store.uploadVideoAsset(body);
        if (!result.ok) {
          set.status = result.status;
          return { detail: result.detail };
        }
        set.status = 201;
        return result.response;
      },
      {
        body: t.Object({
          file: t.File(),
          bundlePath: t.String({ minLength: 1 }),
          kind: t.Optional(t.String()),
        }),
      },
    )

    // -- move ---------------------------------------------------------------
    .post(
      "/api/move",
      async ({ body, set }) => {
        const result = await store.moveDoc(body.fromPath, body.toPath);
        if (!result.ok) {
          set.status = result.status;
          return { detail: result.detail };
        }
        return {
          moved: result.moved,
          rewrittenSources: result.rewrittenSources,
          failures: result.failures,
        };
      },
      {
        body: t.Object({
          fromPath: t.String({ minLength: 1 }),
          toPath: t.String({ minLength: 1 }),
        }),
      },
    )

    // -- undo ---------------------------------------------------------------
    .post(
      "/api/undo",
      async ({ body, set }) => {
        const result = await store.undoPatch(body.patch_id);
        if (!result.ok) {
          set.status = result.status;
          return { ok: false, detail: result.detail, current_hash: result.current_hash };
        }
        store.publishChange({
          path: "",
          changedIds: [],
          patchId: body.patch_id,
          actor: "undo",
        });
        if (result.kind === "doc") {
          return { ok: true, doc: result.doc, hash: result.hash };
        }
        if (result.kind === "sequence") {
          return { ok: true, sequence: result.sequence, hash: result.hash };
        }
        return { ok: true, canvas: result.canvas, hash: result.hash };
      },
      {
        body: t.Object({
          patch_id: t.String({ minLength: 1 }),
        }),
      },
    )

    // -- canvas sidecars: PUT save (doc-relative or src-rooted), POST/DELETE doc-relative --
    .put(
      "/api/canvas",
      async ({ body, set }) => {
        // No `path` => src-rooted form: `src` is docs-root-relative, exactly
        // the value GET /api/canvases lists and GET /api/canvas?src= reads.
        const result =
          body.path === undefined
            ? await store.saveCanvasSidecarBySrc({
                src: body.src,
                canvas: body.canvas,
                originalHash: body.original_hash,
                sessionId: body.session_id,
              })
            : await store.saveCanvasSidecar({
                docPath: body.path,
                src: body.src,
                canvas: body.canvas,
                originalHash: body.original_hash,
                sessionId: body.session_id,
              });
        if (!result.ok) {
          set.status = result.status;
          return {
            detail: result.detail,
            current_hash: result.current_hash,
            original_hash: result.original_hash,
            held_by: result.held_by,
          };
        }
        return result.response;
      },
      {
        body: t.Object({
          path: t.Optional(t.String({ minLength: 1 })),
          src: t.String({ minLength: 1 }),
          original_hash: t.Optional(t.String()),
          canvas: t.Any(),
          session_id: t.Optional(t.String()),
        }),
      },
    )
    .post(
      "/api/canvas",
      async ({ body, set }) => {
        const result = await store.createCanvasSidecar({
          docPath: body.path,
          src: body.src,
          canvas: body.canvas,
          insertMdx: body.insert_mdx,
          canvasId: body.canvas_id,
          originalHash: body.original_hash,
          insertAfter: body.insert_after,
          sessionId: body.session_id,
        });
        if (!result.ok) {
          set.status = result.status;
          return {
            detail: result.detail,
            current_hash: result.current_hash,
            original_hash: result.original_hash,
            held_by: result.held_by,
          };
        }
        set.status = 201;
        return result.response;
      },
      {
        body: t.Object({
          path: t.String({ minLength: 1 }),
          src: t.String({ minLength: 1 }),
          canvas: t.Any(),
          insert_mdx: t.Optional(t.Boolean()),
          canvas_id: t.Optional(t.String()),
          original_hash: t.Optional(t.String()),
          insert_after: t.Optional(
            t.Object({
              source_range: t.Optional(
                t.Object({
                  start_offset: t.Number(),
                  end_offset: t.Number(),
                }),
              ),
              text_quote: t.Optional(t.String()),
            }),
          ),
          session_id: t.Optional(t.String()),
        }),
      },
    )
    .delete(
      "/api/canvas",
      async ({ query, set }) => {
        const result = await store.deleteCanvasSidecar({
          docPath: query.path,
          src: query.src,
          removeReference: query.remove_reference === "true",
          canvasId: query.canvas_id,
          originalHash: query.original_hash,
        });
        if (!result.ok) {
          set.status = result.status;
          return {
            detail: result.detail,
            current_hash: result.current_hash,
            original_hash: result.original_hash,
          };
        }
        return result.response;
      },
      {
        query: t.Object({
          path: t.String({ minLength: 1 }),
          src: t.String({ minLength: 1 }),
          remove_reference: t.Optional(t.String()),
          canvas_id: t.Optional(t.String()),
          original_hash: t.Optional(t.String()),
        }),
      },
    )

    // -- doc-relative sequence sidecars ----------------------------------------
    .put(
      "/api/sequence",
      async ({ body, set }) => {
        const result = await store.saveSequenceSidecar({
          docPath: body.path,
          src: body.src,
          sequence: body.sequence,
          originalHash: body.original_hash,
          sessionId: body.session_id,
        });
        if (!result.ok) {
          set.status = result.status;
          return {
            detail: result.detail,
            current_hash: result.current_hash,
            original_hash: result.original_hash,
            held_by: result.held_by,
          };
        }
        return result.response;
      },
      {
        body: t.Object({
          path: t.String({ minLength: 1 }),
          src: t.String({ minLength: 1 }),
          original_hash: t.Optional(t.String()),
          sequence: t.Any(),
          session_id: t.Optional(t.String()),
        }),
      },
    )
    .post(
      "/api/sequence",
      async ({ body, set }) => {
        const result = await store.createSequenceSidecar({
          docPath: body.path,
          src: body.src,
          sequence: body.sequence,
          originalHash: body.original_hash,
          sessionId: body.session_id,
        });
        if (!result.ok) {
          set.status = result.status;
          return {
            detail: result.detail,
            current_hash: result.current_hash,
            original_hash: result.original_hash,
            held_by: result.held_by,
          };
        }
        set.status = 201;
        return result.response;
      },
      {
        body: t.Object({
          path: t.String({ minLength: 1 }),
          src: t.String({ minLength: 1 }),
          sequence: t.Any(),
          original_hash: t.Optional(t.String()),
          session_id: t.Optional(t.String()),
        }),
      },
    )
    .delete(
      "/api/sequence",
      async ({ query, set }) => {
        const result = await store.deleteSequenceSidecar({
          docPath: query.path,
          src: query.src,
        });
        if (!result.ok) {
          set.status = result.status;
          return { detail: result.detail };
        }
        return result.response;
      },
      {
        query: t.Object({
          path: t.String({ minLength: 1 }),
          src: t.String({ minLength: 1 }),
        }),
      },
    )

    // -- SSE change events ------------------------------------------------------
    .get("/api/events", async function* () {
      const queue: DocsChangeEvent[] = [];
      let wake: (() => void) | null = null;
      const unsubscribe = store.subscribeChanges((event) => {
        queue.push(event);
        wake?.();
      });

      try {
        // First frame flushes the headers IMMEDIATELY — the response body
        // (and with it the status/headers) isn't sent until the generator's
        // first yield, and a quiet stream would otherwise leave EventSource
        // stuck CONNECTING (ERR_EMPTY_RESPONSE reconnect loop). Named events
        // ("connected"/"keepalive") don't fire `onmessage`, so the client's
        // JSON parsing only ever sees real change events.
        yield sse({ event: "connected", data: "ok" });
        while (true) {
          if (queue.length === 0) {
            // Wait for the next published event, but wake every 30s to emit
            // a keepalive so idle connections aren't reaped by
            // intermediaries (and dead sockets get detected server-side).
            let keepaliveTimer: ReturnType<typeof setTimeout> | undefined;
            const woke = await new Promise<boolean>((resolvePromise) => {
              wake = () => resolvePromise(true);
              keepaliveTimer = setTimeout(() => resolvePromise(false), 30_000);
            });
            // When a published event wins the race, the 30s keepalive timer
            // is still pending — clear it so every loop iteration doesn't
            // leak another live timer for the rest of its window.
            clearTimeout(keepaliveTimer);
            wake = null;
            if (!woke) {
              yield sse({ event: "keepalive", data: "ok" });
              continue;
            }
          }
          while (queue.length > 0) {
            const event = queue.shift();
            if (event) {
              // Unnamed event -> EventSource `onmessage`; `sse()` JSON-
              // stringifies object data, matching the client's JSON.parse.
              yield sse({ data: event });
            }
          }
        }
      } finally {
        unsubscribe();
      }
    });
}
