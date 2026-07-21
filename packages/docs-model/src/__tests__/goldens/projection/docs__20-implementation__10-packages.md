# Package map

The as-built inventory: every workspace package, what it owns today, and the tests that keep the seams honest. Why the boundaries sit where they do — the runtime constraints, the judgment calls, the live merge candidates — is design, not inventory: see Package boundaries.

- docs-model — the pure-TypeScript format definition: schema, 7-op mutation kernel and inverses, seven component bundles for 14 block types, and Markdown conversion in both directions.

- docs-index — the derived `bun:sqlite` backlink index, plus move-doc rename rewriting and path confinement.

- docs-server — the React-free mutation authority: atomic mutexed writes, hash preconditions, draft locks, undo, change events, embeddable Elysia routes, block discovery, and canvas-op forwarding.

- docs-viewer — the browser-pure React renderer and editor: mirrored component folders, TipTap editing, targeting, and the client-provider seam.

- docs-workbench — the thin composition shell: an Elysia server around docs-server, a Vite SPA around docs-viewer, Edit/Annotate modes, and static export.

- docs-cli — the agent dialect and human entry point for render, grep, backlink rescan, link checks, migration, serve, and export.

- framework — the zero-dependency, zero-code methodology: manual, templates, and a skill definition distributed for host repos to symlink into agent tooling.

- external/canvas — a vendored neighboring project whose inner workspace packages supply canvas schemas and embeds; it is not one of the seven.

The repo-root `Makefile` wraps common commands: `make test`, `make typecheck`, `make check`, `make serve`, `make dev`, `make canvas`, and `make spa`.

## Enforcement

The boundaries are tested, not aspirational. At the repo root, `import-boundaries.test.ts` enforces three rules: none of the seven package `src` roots may import host-app code through `@spectre/*`, the `@/` alias, or a reach into a host `apps/` directory; docs-model may not import `react`, `react-dom`, or `@tiptap/*`; and docs-model may import canvas only through `@codecaine-ai/canvas/agent-schema`.

`component-mirror.test.ts` separately keeps docs-viewer's component folders in a 1:1 mirror with docs-model's component bundles.

## Sequence examples

Live examples of the new sequence block, each rendered from a sidecar document under `assets/sequences/`: the first two diagram this repo's own agent save pipeline and viewer/host embed seam; the third is the UML combined-fragment reference flow.

<!-- sequence: assets/sequences/agent-edit-flow.sequence.json title="Agent edit flow" -->

<!-- sequence: assets/sequences/viewer-host-seam.sequence.json title="Viewer / host embed seam" -->

<!-- sequence: assets/sequences/order-distribution.sequence.json title="Order distribution" -->
