# Package map

Every workspace package, what it owns, and why it exists as its own layer.

## `packages/docs-model` — the format

Pure TypeScript: no React, no filesystem, no network. Owns:

- the `doc.json` schema — a normalized, id-keyed block tree with exactly 14

  block types (paragraph, heading, list-item, quote, code, callout, divider,
  structured-table, file-tree, interaction-surface, mermaid, canvas, image,
  video) and delta-style rich-text spans; retired MDX-era types coerce to
  callout on read, the old type name preserved as `props.kind`;

- the seven-op mutation vocabulary (`insertBlock`, `updateBlock`,

  `deleteBlock`, `moveBlock`, `splitBlock`, `mergeBlocks`, plus
  `blockAction` as the seventh) with a pure
  `applyOp(doc, op) -> { doc, inverse }` — the returned inverse is what
  powers undo;

- typed block actions (`block-actions.ts`) — 13 named actions across `code`,
  `structured-table`, `file-tree`, and `interaction-surface` blocks,
  invoked through the `blockAction` op; `BLOCK_TYPE_CATEGORY` sorts every
  type into `text` (generic ops) or `object` (structured props edited via
  actions);

- the comments schema (targets that anchor to blocks or canvas objects);

- Markdown projection in both directions.

Everything else in the repo is machinery around this package's types.

## `packages/docs-index` — backlinks

A `bun:sqlite`-backed index of references between docs (and from docs into
source files). Strictly *derived* state — it lives at `<docsRoot>/.index/`,
is gitignored, and can always be rebuilt with `docs backlinks rescan`. Also
home to `move-doc` (renames a bundle and rewrites inbound references) and
path-confinement helpers so no operation can escape the docs root.

## `packages/docs-server` — the mutation authority

The embeddable write side. `createDocsStore(docsRoot)` provides:

- per-path mutexed, atomic (temp-then-rename) file writes;

- **hash preconditions** — every mutation carries `expected_hash` and gets a

  `409` if the doc changed underneath it (this is the real concurrency
  backstop);

- **draft locks** — best-effort TTL locks with heartbeat, `423` when held by

  another session (advisory; the hash check is what guarantees correctness);

- a single-use **undo ledger** built from the model's inverse ops;

- **SSE change events** so open clients see other actors' edits live.

`createDocsRoutes(store)` exposes all of that as an Elysia `/api/*` route
factory that any host app can mount. Two newer routes worth knowing:
`GET /api/blocks`, a static discovery document describing the whole agent
edit surface (the generic ops plus every typed block action), and
`POST /api/assets/video`, multipart video upload (strict type allowlist,
64MB cap, collision-suffixed names under the bundle's `assets/videos/`).

## `packages/docs-viewer` — rendering and editing

The React layer:

- `DocBlockRenderer` — read-only projection of a bundle through the block

  registry (`render/block-registry.ts` — one descriptor per block type,
  mapping exactly the 14 canonical types);

- the `docs-blocks/` component families — callout, code (highlight.js-core
  syntax highlighting in `highlight.ts` plus line-anchored
  `CodeAnnotations`), file-tree (tree rendering with change markers and
  notes), structured-table, interaction-surface, mermaid (real SVG
  rendering that follows the theme), and video (provider embeds plus native
  playback); the MDX-era semantic families are gone;

- the **TipTap-based block editor** (`DocEditor`) — slash menu, Markdown

  input rules, reference chips, link authoring (`menus/link-editor.tsx`),
  video paste/drop (`input/video-embed.ts`, uploading through the host's
  `uploadAsset` slot), and an opt-in Notion-style auto-save mode
  (see the workbench pages);

- `DocTargetingLayer` — hover outline + block-type chip + pinpoint click, the

  surface both humans and agents use to say "this block, specifically";

- Plannotator-style comment composition;

- `DocsClientProvider` — the seam a host app uses to inject its own API

  client and a canvas-embed component.

## `packages/docs-workbench` — the app

The standalone runnable: an Elysia server wrapping `docs-server`'s routes
plus a Vite-built SPA. Two modes — **Edit** (default, always-editable with
auto-save) and **Annotate** (comment on blocks/canvas objects) — plus a
block library at `#/blocks`, live SSE change flashes, and one-click undo.
`docs export` produces a fully static read-only site from the same code.

## `packages/docs-cli` — the entry point

The `docs` command: `render`, `grep`, `backlinks rescan`, `links check`,
`migrate` (markdown → bundles, non-destructive by default), `serve`, and
`export`. Host repos invoke this through their submodule mount.

## `packages/framework` — the methodology

Not code: the documentation *methodology* itself — the manual
(architecture reference, standards, hierarchy conventions, setup guide),
document templates, and the skill definition that host repos symlink into
their agent tooling. This is the "how to run docs in a project" layer.

## `external/canvas` — a supported neighbor, not a part

The Codecaine canvas engine, vendored as a git submodule so the workbench
can render embedded canvases. It lives under `external/` rather than
`packages/` deliberately: the docs system *supports* canvas (canvas
documents can be embedded in docs), but canvas is its own project with its
own repo, workspace, and release cadence. Only its inner packages are
pulled into this workspace (`external/canvas/packages/*`) so
`@codecaine-ai/canvas` resolves for the embed components.

See the README's submodule-cycle caveat before cloning recursively.

## Repo root — the `Makefile`

A `Makefile` at the repo root wraps the common commands: `make test`,
`make typecheck`, `make check` (both), `make serve` (self-docs on
`:4802`), `make dev` (hot reload on `:4803`), `make canvas` (the
sibling canvas project's docs on `:4801`), and `make spa` (rebuilds the
static SPA cache).
