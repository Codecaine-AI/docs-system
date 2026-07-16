# Packages — why seven

The seven-package split is a map of runtime and ownership boundaries, not seven pieces that every user assembles by hand. Some seams isolate genuinely incompatible environments; three others are current judgment calls and may collapse.

## The dependency chain

> **Mermaid: Who depends on whom** — flowchart BT
>   model["docs-model\nthe format"]
>   index["docs-index\nbacklinks (bun:sqlite)"]
>   server["docs-server\nmutation authority"]
>   viewer["docs-viewer\nReact render + edit"]
>   workbench["docs-workbench\ncomposition shell"]
>   cli["docs-cli\nagent dialect"]
>   index --> model
>   server --> index
>   server --> model
>   viewer --> model
>   workbench --> server
>   workbench --> viewer
>   workbench --> index
>   cli --> workbench
>   cli --> index
>   cli --> model

- docs-model — the pure-TypeScript format definition: schema, 7-op mutation kernel and inverses, seven component bundles for 14 block types, and Markdown projection in both directions.

- docs-index — the derived `bun:sqlite` backlink index, plus move-doc rename rewriting and path confinement.

- docs-server — the React-free mutation authority: atomic mutexed writes, hash preconditions, draft locks, undo, change events, embeddable Elysia routes, block discovery, and canvas-op forwarding.

- docs-viewer — the browser-pure React renderer and editor: mirrored component folders, TipTap editing, targeting, and the client-provider seam.

- docs-workbench — the thin composition shell: an Elysia server around docs-server, a Vite SPA around docs-viewer, Edit/Annotate modes, and static export.

- docs-cli — the agent dialect and human entry point for render, grep, backlink rescan, link checks, migration, serve, and export.

- framework — the zero-dependency, zero-code methodology: manual, templates, and a skill definition distributed for host repos to symlink into agent tooling.

- external/canvas — a vendored neighboring project whose inner workspace packages supply canvas schemas and embeds; it is not one of the seven.

## Why seven packages

The count is six code packages plus one methodology package. The defensible splits follow incompatible runtimes first; the rest expose current responsibilities and distribution choices.

- **docs-model is forced**: browser, Bun server, and CLI must share one definition of `doc.json`. Keeping that definition pure TypeScript — without React, filesystem, or network access — makes it portable to all three.

- **docs-index is forced out of the browser**: `bun:sqlite` cannot be bundled there. Its database at `<docsRoot>/.index/` is derived, gitignored, and rebuildable with `docs backlinks rescan`; keeping index separate from server is a judgment call.

- **docs-server is forced to exclude UI**: the write authority and `/api/*` factory must embed in host applications without bringing React with them.

- **docs-viewer is forced to remain browser-pure**: its React render-and-edit surface must be liftable into any host React app, while its only docs dependency remains docs-model.

- **docs-workbench is composition**: it deliberately reunites server and viewer at the runnable product boundary instead of weakening either package's constraints. The thin Electron shell is landing here too.

- **docs-cli is an interface boundary**: it gives agents and humans one command dialect, but separating it from workbench is a judgment call because `serve` and `export` already drive workbench.

- **framework is packaged for distribution**: it has no dependencies and no runtime code. Making the methodology a package at all is a convenience, not a runtime constraint.

Canvas externality is forced. `external/canvas` is its own project and git submodule under `external/`, not another package under `packages/`. Only its inner packages join this workspace so `@codecaine-ai/canvas` resolves for embeds.

## What you actually need together

> **Mental model** — **A RUNNING DOCS INSTALLATION** = `docs-model + docs-index + docs-server + docs-viewer`, composed by `docs-workbench`. **AN AGENT INTERACTING WITH IT** speaks the `docs-cli` dialect. `framework` is methodology, not runtime; a running installation works identically without it.

## Forced boundaries vs judgment calls

The forced boundaries are model purity, viewer browser-purity, keeping the Bun/SQLite index out of the browser, server embeddability without React, and canvas remaining an external project. Those constraints survive package renames and reorganizations.

> **Boundary under review** — Three live candidates are judgment calls: (1) fold docs-index into docs-server; (2) merge docs-cli and docs-workbench, since serve and export already drive the workbench; (3) stop packaging framework as a package at all.

## Enforcement

The boundaries are tested, not aspirational. At the repo root, `import-boundaries.test.ts` enforces three rules: none of the seven package `src` roots may import host-app code through `@spectre/*`, the `@/` alias, or a reach into a host `apps/` directory; docs-model may not import `react`, `react-dom`, or `@tiptap/*`; and docs-model may import canvas only through `@codecaine-ai/canvas/agent-schema`.

`component-mirror.test.ts` separately keeps docs-viewer's component folders in a 1:1 mirror with docs-model's component bundles.
