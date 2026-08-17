The runnable Bun server, Vite SPA, and Electron wrapper for a docs tree — the only package where docs-server and docs-viewer meet. Source: `packages/docs-workbench`.

## Governed By

Editor design — the surfaces and system UI the host composes.

The mutation model — the write contract the host's transport policy carries.

## Decisions

### The app is a deliverable cut, not a library

- Decision: docs-workbench owns only deliverable-level concerns — server startup, browser routing, transport and session policy, host-provided embeds, settings persistence, and desktop lifecycle. The Bun host mounts docs-server's route factory rather than copying write rules; the React host composes docs-viewer surfaces rather than defining block rendering or editor semantics. No lower package imports it; docs-cli lazy-loads it for `serve` and `export`.

- Why: None of these concerns changes the document format, write authority, or viewer contract, so they stay replaceable glue — another host can embed either side without inheriting this shell, and the shell can change without moving the contracts below it. Rejected: a load-bearing app that reimplements either side.

- Applies to: `packages/docs-workbench` — every future host feature stays composition glue.

### Host policy lives in web/src/data

- Decision: Transport, hash, and session policy attach in `packages/docs-workbench/web/src/data` — `api.ts` selects live `api/` requests or exported `data/` files and owns HTTP and SSE policy, `client.ts` adapts that layer to the viewer's `DocsClient` seam, and `session.ts` defines the one per-tab actor id shared by locks, writes, and event filtering. Viewer components never learn URLs or response envelopes.

- Why: One transport boundary and one actor identity keep lock ownership, writes, and self-echo filtering naming the same session; scattering fetch calls through pages was rejected because policy then diverges per surface.

- Applies to: `packages/docs-workbench/web/src/data` — every future data source, mutation helper, and event consumer routes through this layer.

### The shell owns the theme frame and its persistence

- Decision: The living Default theme lives at `themes/default/theme.json`; the workbench shell applies and persists it — `packages/docs-workbench/web/src/shell/StyleRail.tsx` exposes theme frame values as CSS variables consumed by the document page and anchors the rail's panel widths, `packages/docs-workbench/web/src/theme/style-rail.css` anchors the two-pane grid, and persistence flows through the server theme routes under shell authority.

- Why: Style state combines invocation flags, browser storage, DOM state, and server persistence — host concerns by definition. Viewer-owned theme persistence was rejected; the viewer stays presentation-only.

- Applies to: `themes/`, `packages/docs-workbench/web/src/shell`, `packages/docs-workbench/web/src/theme` — future style surfaces keep persistence in the shell.
