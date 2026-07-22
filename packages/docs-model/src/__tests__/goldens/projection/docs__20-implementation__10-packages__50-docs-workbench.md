# docs-workbench — the App

@codecaine-ai/docs-workbench is the standalone runnable docs app and its thin composition shell. It joins the write side to the render side in an Elysia-served Vite SPA without moving either side's responsibilities into the app.

## What It Owns

The runnable is deliberately small: roughly a dozen source files under `packages/docs-workbench/src/` plus the Vite SPA under `packages/docs-workbench/web/`. The package owns composition and app behavior, not the server's route semantics or the viewer's rendering primitives.

- `packages/docs-workbench/src/server.ts` creates the Elysia host around docs-server's route factory, initializes the backlinks index, watches the docs root for live changes, and serves the built SPA.

- `packages/docs-workbench/src/run-serve.ts` and `packages/docs-workbench/src/spa.ts` start and build the served app; `packages/docs-workbench/src/export.ts` builds the same SPA in static mode and writes its read-only data snapshot.

- `packages/docs-workbench/web/src/shell/App.tsx` owns the standalone navigation shell, and `packages/docs-workbench/web/src/pages/DocPage.tsx` owns its two modes: Edit is the default, always-editable auto-save surface; Annotate attaches comments to blocks and canvas objects. `packages/docs-workbench/web/src/pages/CanvasEmbed.tsx` implements the host-side canvas progression: a static section SVG in the document flow, a top-right expansion action that opens the navigable read-only iframe in a same-window full-screen overlay, and an edit handoff shown only by the doc editor. The Canvas Studio base URL is supplied at build time through `CANVAS_STUDIO_URL`, defaulting to `http://localhost:3999`. The page also surfaces live SSE change flashes and one-click undo. The block-type catalog is the per-type reference pages under block vocabulary.

The `packages/docs-workbench/electron/` directory contains a thin Electron shell that wraps the same server+SPA for a desktop app.

## Why It Is Its Own Package

> **Package decision: The write and render sides meet here** — This package is the composition point: it is the only place where the docs-server write side and the docs-viewer render side are allowed to meet. Keeping that composition in a thin package makes it non-load-bearing: hosts that embed either piece individually do not pay for the app shell, and the shell can be rebuilt without changing any layer beneath it. The boundary exists because this is a deliverable app, not a library.

## Dependencies

Its runtime dependencies are `@codecaine-ai/canvas`, `@codecaine-ai/docs-index`, `@codecaine-ai/docs-model`, `@codecaine-ai/docs-server`, `@codecaine-ai/docs-viewer`, `elysia`, `react`, `react-dom`, and `lucide-react`.

The decisive pair is docs-server and docs-viewer: docs-workbench is the only package that depends on both. The server supplies the write-capable route factory; the viewer supplies the render and edit surfaces that the SPA wraps.

The docs-cli package depends on docs-workbench: its `serve` and `export` commands drive this app.

> **Boundary under review: The CLI and app shell may converge** — Merging docs-cli and docs-workbench is a live candidate. The CLI already depends on the workbench for serve and export, and the two ship together in practice. The current split is a judgment call between command surface and app shell, not a forced boundary.

## Using It Alone

It is the thing you run. Use `docs serve --root docs --port 4802` or `make serve` to serve a docs root on `:4802`; the development setup puts Vite HMR on `:4803`.

Run `docs export` when the deliverable must be a fully static, read-only site. It is produced from the same app code; only the data source and write capabilities change. For the concrete runtime flow, see the workbench implementation.
