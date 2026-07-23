`@codecaine-ai/docs-workbench` is the runnable Bun server, Vite SPA, and Electron wrapper for a docs tree. It is the only package where docs-server — the Mutation Authority and docs-viewer — rendering and editing meet. The package owns the host policy that connects them, not either side's reusable logic.

## The Cut

> **Decision: The Write and Render Sides Meet Here** — docs-workbench is a deliberately thin composition point. Keeping the runnable app non-load-bearing lets another host embed docs-server or docs-viewer without inheriting this shell, and lets this shell change without changing the contracts below it.

This boundary is forced at the deliverable level, not at the library level. A runnable installation needs server startup, browser routing, transport policy, session identity, host-provided embeds, settings persistence, and optional desktop lifecycle. None of those concerns changes the document format, write authority, or viewer contract, so they remain replaceable host glue.

> **Open call: The CLI and App May Converge** — Merging docs-cli and docs-workbench remains a live candidate. docs-cli — the agent dialect already delegates `serve` and `export` to this package. The current command-surface versus app-shell split is a judgment call, not an incompatible-runtime boundary.

## Module Map

```
packages/
└── docs-workbench/
    ├── electron/
    │   └── main.cjs  # Desktop process and window lifecycle.
    ├── src/
    │   ├── __tests__/  # Route, confinement, export, and filesystem-watch integration.
    │   ├── export.ts  # Static SPA plus read-only data snapshot.
    │   ├── index.ts  # Package exports and compatibility re-exports.
    │   ├── run-serve.ts  # Single-port production serve or two-port Vite development composition.
    │   ├── server.ts  # Bun/Elysia host around the docs-server route factory and optional SPA.
    │   └── spa.ts  # Mode-specific Vite build location, cache, and staleness check.
    └── web/
        ├── src/
        │   ├── __tests__/  # Host wiring and browser-runtime integration.
        │   ├── data/  # Live/static API policy, DocsClient binding, and per-tab session identity.
        │   ├── lib/  # Workbench import points for viewer-owned helpers.
        │   ├── pages/  # Document, annotation, canvas, and sequence host pages.
        │   ├── shell/  # Hash-routed app shell, docs tree, and settings runtime.
        │   ├── theme/  # Workbench theme source and theme-folder compiler.
        │   └── main.tsx  # React entrypoint.
        └── vite.config.ts  # Serve/static build variants and development API proxy.
```

## The Public Surface

**docs-workbench — package and host surface**

```
@codecaine-ai/docs-workbench() -> createDocsServeApp, startDocsServe, runServe, runExport, ensureSpaBuilt, and related types/helpers  # Exports serve lifecycle, SPA build, static export, and compatibility bundle helpers.
@codecaine-ai/docs-workbench/server() -> server.ts exports  # Direct server-host entrypoint.
@codecaine-ai/docs-workbench/export() -> runExport and export report types  # Direct static-export entrypoint.
createDocsServeApp(options: DocsServeAppOptions) -> Elysia app  # Creates the Elysia app without choosing a listener.
HTTP /api/*()  # Mounts the response-shape-identical docs-server route table, plus the workbench-owned serve configuration route.
GET /*()  # Serves a built SPA when staticDir is present; unknown safe paths fall back to index.html.
runExport(options: ExportOptions) -> Promise<ExportReport>  # Builds the static SPA variant and emits its relative data tree.
```

`packages/docs-workbench/src/index.ts` exposes the runnable helpers. The HTTP contract still comes from docs-server; the workbench adds only invocation-specific configuration and SPA delivery.

## The Bun Server and Vite SPA

- Bun/Elysia host

  - `packages/docs-workbench/src/server.ts` creates a docs store, mounts `createDocsRoutes`, primes the backlinks connection, and optionally bridges filesystem changes onto the store's event bus. The only API route it defines itself is `/api/serve-config` because `themeLocked` describes this serve invocation rather than the docs tree.

- Serve coordinator

  - `packages/docs-workbench/src/run-serve.ts` composes one of two hosts. Default mode asks `packages/docs-workbench/src/spa.ts` for a current cached SPA and serves API plus assets from one Elysia listener. Development mode starts the API alone and spawns Vite with an `/api` proxy, separating API and HMR ports.

- Vite variants

  - `packages/docs-workbench/web/vite.config.ts` builds the live SPA into `dist` and the export SPA into `dist-static`. Relative asset bases and hash navigation let both variants run below an arbitrary host path.

## The Host-to-Viewer Seam

`packages/docs-workbench/web/src/shell/App.tsx` mounts `DocsClientProvider` with a standalone `DocsClient` and the canvas and sequence embed slots. This is the browser-side composition point: viewer components ask for host capabilities, and the workbench binds those capabilities to its server, asset URLs, and neighboring diagram packages.

**Workbench bindings into docs-viewer**

```
DocsClient.getDocsTree(projectId: string) -> Promise<{ tree: DocsTreeNode[] }>  # Maps the viewer's tree seam to the workbench tree data source; the standalone host ignores projectId.
DocsClient.getDocBundle(projectId: string, path: string) -> Promise<{ doc: unknown; documentPath?: string } | null>  # Maps the viewer's peek seam to the workbench bundle data source; the standalone host ignores projectId.
DocsClient draft-lock methods(projectId: string, path: string, kind: DraftLockKind, sessionId: string) -> Promise<AcquireDraftLockResult> or Promise<void>  # Maps the viewer's optional lock seam to the live server with the tab session id; omitted in static builds.
canvasEmbed()  # Supplies the host-selected canvas implementation to DocBlockRenderer.
sequenceEmbed()  # Supplies the host-selected sequence implementation to DocBlockRenderer.
DocEditor.onApplyOps(ops: DocOp[]) -> Promise<DocBlockSaveResult>  # Hands the viewer's format-level operation batch to the host page, which adds transport, hash, and session policy.
```

- Host pages

  - `packages/docs-workbench/web/src/pages/DocPage.tsx` chooses the open bundle, passes data and callbacks into viewer-owned editor, renderer, targeting, and annotation components, and reacts to save and navigation results. App mounts the viewer-owned peek panel beside it. These are host decisions because they mention paths, hashes, HTTP errors, sessions, and route changes; neither page defines block rendering or editor behavior.

- Canvas and sequence slots

  - `packages/docs-workbench/web/src/pages/CanvasEmbed.tsx` and `packages/docs-workbench/web/src/pages/SequenceEmbed.tsx` resolve workbench sidecars, validate them with their owning packages, and select the Studio handoff when no sidecar exists. That is host policy: docs-viewer exposes slots and never imports either diagram engine.

Editor behavior and system UI are specified in Editor design. This package page covers only how the runnable host supplies those surfaces.

## Host Policy

- API client policy

  - `packages/docs-workbench/web/src/data/api.ts` is the transport boundary. It chooses live `api/` requests or exported `data/` files at build time, adds expected hashes and session ids to mutations, and converts HTTP failures into host-level errors. docs-viewer therefore knows no URLs or response envelopes.

- Session identity

  - `packages/docs-workbench/web/src/data/session.ts` creates one id per browser tab and keeps it across SPA reloads. `packages/docs-workbench/web/src/data/client.ts` substitutes that id into viewer-requested lock calls so lock ownership, operation writes, annotation writes, and SSE self-echo filtering all name the same actor.

- SSE wiring

  - The API layer consumes `/api/events` through EventSource or a streaming-fetch fallback and removes frames from the current tab. DocPage refreshes a clean open bundle, leaves a dirty draft untouched so its hash precondition owns the conflict, and remounts a referenced canvas when its sidecar changes. Event production remains docs-server logic; deciding how this app reacts is host glue.

- Theme and settings runtime

  - The shell decides whether this serve authors a repo theme or consumes the locked default, coordinates browser settings with the theme routes, and applies the resolved runtime layer to the document. Those decisions belong to the app because they combine invocation flags, browser storage, DOM state, and server persistence. The token, folder, and override contracts live in Theming: Overview.

## Static Export

`packages/docs-workbench/src/export.ts` packages the same SPA with a different data adapter. It writes the docs tree, bundle-shaped snapshots, rendered Markdown, backlinks, and files under asset directories beside the static build. It reuses docs-model, docs-index, and docs-server read helpers rather than recreating their semantics in an exporter.

The static build reads only relative `data/` URLs. Its DocsClient omits lock methods, mutation helpers reject writes, the page mounts the read renderer instead of the editor, and SSE becomes a no-op. Static export is therefore deployment glue around the shared viewer, not a second viewer or a reduced server.

## Desktop and Run Modes

**Makefile app compositions**

| Target | Processes | Composition |
| --- | --- | --- |
| make dev | Electron + docs CLI/API + Vite dev server | Electron passes --dev. The API watches the docs root on :4803; Vite serves HMR on :4804 and proxies /api to :4803; the window loads the Vite origin. |
| make app | Electron + docs CLI with one Elysia listener | The serve runner validates or rebuilds the cached SPA, then serves API and static assets together on :4802; the window loads that origin. |

`packages/docs-workbench/electron/main.cjs` is process glue only. It starts the CLI serve command, waits for the selected origin, opens a context-isolated window, sends non-local navigation to the operating system, and terminates the child server with the app. It contains no docs route, viewer, or persistence logic.

## Invariants and Firewalls

- Authority stays below the host

  - The Bun host must mount docs-server's route factory rather than copy write rules. The React host must compose docs-viewer surfaces rather than define block rendering or editor semantics. The real server in the integration tests exercises both halves through this seam.

- One tab has one actor id

  - Draft locks and mutations must carry the same per-tab session id. If they diverge, the server correctly rejects the tab's own writes as a foreign lock holder, and SSE self-echo filtering also stops matching.

- Static means read-only by construction

  - The export contains no write endpoints. The build-time data adapter, reduced DocsClient, and page selection must all agree on that absence; hiding controls alone is not the guarantee.

- Host resources follow host lifecycle

  - Filesystem watching defaults off for bare app creation and closes through Elysia's stop lifecycle; the runnable enables it. The listener defaults to loopback because the served tree may be private and the route table is write-capable. Electron owns the child process it starts.

## Related Files

### Server and Packaging

- `packages/docs-workbench/src/server.ts`

  - Mounts docs-server, invocation configuration, watching, and static delivery.

- `packages/docs-workbench/src/run-serve.ts`

  - Composes cached single-port serving or two-port Vite development.

- `packages/docs-workbench/src/spa.ts`

  - Builds or reuses the mode-specific Vite output.

- `packages/docs-workbench/src/export.ts`

  - Emits the static SPA and its read-only data files.

### Browser Host

- `packages/docs-workbench/web/src/shell/App.tsx`

  - Supplies DocsClient, embed slots, navigation, and settings runtime.

- `packages/docs-workbench/web/src/pages/DocPage.tsx`

  - Binds viewer surfaces to bundle, save, annotation, event, and navigation policy.

- `packages/docs-workbench/web/src/data/api.ts`

  - Selects live or exported data and owns HTTP and SSE policy.

- `packages/docs-workbench/web/src/data/client.ts`

  - Adapts the workbench data layer to the viewer's DocsClient seam.

- `packages/docs-workbench/web/src/data/session.ts`

  - Defines the stable per-tab actor identity shared by locks, writes, and events.

### Launch

- `packages/docs-workbench/electron/main.cjs`

  - Owns the desktop child process, readiness wait, window, and shutdown.

- `Makefile`

  - Names the browser, desktop, development, and cached-build entrypoints.
