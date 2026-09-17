# Local Development Loop

## Iterating on the Tooling (This Repo)

The key separation: **docs content** and **docs tooling** version
independently.

- Content (`doc.json` bundles) lives in whatever repo the docs are about

  and is committed there like any other file.

- Tooling (this repo) reaches consuming repos as a pinned git submodule —

  but for local development you never need the pin.

To dogfood tooling changes against the canvas repo's real docs:

```
make canvas               # = bun run docs:canvas, from this repo's root
```

That serves the API from this working copy against `../canvas/docs` and
starts a Vite dev server (`http://localhost:4801`) with hot reload — all
frontend packages (`docs-viewer`, `docs-workbench`) export raw TypeScript
source, so UI edits appear on save. Server-side changes (`docs-server`,
`docs-cli`) need a restart of the command.

To work on *these* docs instead: `make dev` — the self-docs workbench with vite
HMR on `:4803`, THE loop for layout/UI iteration (see the Makefile table
below).

## Everyday Commands (the Makefile)

The root `Makefile` wraps the loop into short targets (`make help` lists
them; ports match `.claude/launch.json`):

**Makefile targets**

| Target | What it does |
| --- | --- |
| make dev | Self-docs workbench with vite HMR on :4803 — THE loop for layout/UI iteration |
| make serve | Self-docs workbench on :4802 from the static SPA build (cached at startup) |
| make canvas | Sibling canvas project's docs with hot reload on :4801 (= bun run docs:canvas) |
| make test | Full workspace test suite (= bun run test) |
| make typecheck | tsc --noEmit across the workspace |
| make check | typecheck + test |
| make spa | Rebuild the static SPA cache — fixes docs-cli test timeouts after docs-viewer changes |
| make install | bun install for the workspace |

> **Gotcha: make serve does not hot-reload** — Plain serve builds the SPA once and caches it at startup, so tooling/source changes will not appear until you restart it (or rebuild the cache with make spa). Editing doc content is fine — that flows through the API live. For source iteration, use make dev.

## Shipping Tooling to a Consuming Repo

Consuming repos (e.g. canvas) mount this repo as a submodule at
`tools/docs-framework` and run the CLI through it. Bump the pin when you
want them to pick up new tooling:

```
# here: commit + push
# in the consuming repo:
git -C tools/docs-framework fetch origin
git -C tools/docs-framework checkout origin/main
git add tools/docs-framework
git commit -m "chore: bump docs-framework pin"
```

This is deliberate versioning, not friction — CI and other machines get a
reproducible toolchain, and your local loop never waits on it.

## Verification

```
make test            # full workspace suite (model, index, cli, server, viewer, workbench)
make typecheck       # tsc --noEmit across the workspace
make check           # both
```

The workbench web tests run the real serve app over a temp docs tree with
`fetch` stubbed straight into the route handler — the 409/423/undo/SSE
paths are exercised end-to-end with no network.

## Authoring New Docs

Write markdown under a `docs/` tree and run `docs migrate` once to convert
it to bundles, or create pages directly in the workbench's Edit mode.
Markdown twins left behind by migration can be retired later with
`docs migrate --retire-twins` (guarded; see `docs --help`).
