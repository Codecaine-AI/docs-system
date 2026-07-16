# docs-server — the mutation authority

`@codecaine-ai/docs-server` is the headless mutation authority for a docs tree. It owns safe file mutation and exposes that authority as an embeddable Elysia route factory, without React.

## What it owns

`createDocsStore(docsRoot)` in `packages/docs-server/src/store.ts` binds one docs root to the package's mutation guarantees:

- Per-path serialization — writes to the same path are mutexed through `packages/docs-server/src/path-mutex.ts`.

- Atomic persistence — `packages/docs-server/src/atomic-write.ts` writes a temporary file and then renames it into place.

- Hash preconditions — every mutation carries `expected_hash`. If the document changed underneath the caller, the mutation returns `409` without writing. This check is the real concurrency backstop.

- Draft locks — best-effort TTL locks stay alive by heartbeat and return `423` when another session holds the path. They are advisory; the hash check guarantees correctness. Path canonicalization lives in `packages/docs-server/src/draft-locks.ts`.

- Undo — `packages/docs-server/src/patch-ledger.ts` records a single-use undo entry built from the model's inverse ops. The inverse contract belongs to the mutation model.

- Live change notification — SSE events from `packages/docs-server/src/docs-events.ts` let open clients see edits made by other actors.

`createDocsRoutes(store)` in `packages/docs-server/src/routes.ts` is an embeddable Elysia `/api/*` route factory that any host app can mount. Its notable routes are:

- `GET /api/blocks` serves a static discovery document for the full agent edit surface: the generic ops and every typed block action.

- `POST /api/ops` is the one write path. Canvas actions enter through it but are not handled locally; docs-server forwards them to the canvas authority.

- `POST /api/assets/video` accepts multipart video uploads with a strict type allowlist and a 64 MB cap. It writes collision-suffixed names under the bundle's `assets/videos/`.

## Why it is its own package

> **Package boundary: Embeddable in host apps** — The forcing constraint is EMBEDDABLE-IN-HOST-APPS. A host must be able to mount the `/api/*` factory into its own Elysia server and bring its own UI. A dependency on docs-viewer or React would drag the entire UI stack into every host.

That constraint keeps the write side headless in docs-server. The React layer stays in docs-viewer, where a UI dependency belongs.

> **Boundary under review: docs-index may fold into docs-server** — Folding docs-index into docs-server is a live candidate: both are Bun-only, and the server is the index's main consumer. The current reason to keep them separate is that the index is derived, rebuildable state that the CLI can use with no HTTP server running.

## Dependencies

docs-server depends on docs-model for schema and inverse-producing mutation application; docs-index for backlinks upkeep; `@codecaine-ai/canvas` for the canvas authority; and `elysia` for the HTTP route layer. It has no React dependency.

In the other direction, docs-workbench depends on docs-server and wraps these routes.

## Using it alone

Use docs-server alone when a host application supplies its own front end. Create `createDocsStore(docsRoot)`, mount `createDocsRoutes(store)` in the host's Elysia server, and connect that host-owned UI to the embedded mutation API.
