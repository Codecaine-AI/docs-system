# docs-index — backlinks

`@codecaine-ai/docs-index` is the Bun-only package that builds and queries the derived index of references between docs and from docs into source files. It also owns reference normalization and safe bundle moves that rewrite inbound references.

## What it owns

The index implementation lives in `packages/docs-index/src/backlinks.ts` and stores its `bun:sqlite` database at `<docsRoot>/.index/backlinks.db`. Everything under `<docsRoot>/.index/` is derived state: it is gitignored and can always be rebuilt with `docs backlinks rescan`.

`packages/docs-index/src/move-doc.ts` renames a document bundle and rewrites inbound references. `packages/docs-index/src/ref-match.ts` normalizes `.md`, `.mdx`, bundle-folder, and `doc.json` path forms to one document identity. `packages/docs-index/src/paths.ts` provides path-confinement helpers so none of these operations can escape the docs root.

## Why it is its own package

> **Runtime boundary: Bun forces the package boundary** — `bun:sqlite` is a Bun-only builtin, so `@codecaine-ai/docs-index` can never be bundled into the browser. Keeping it out of `@codecaine-ai/docs-model` and `@codecaine-ai/docs-viewer` is what keeps those packages browser-safe. That runtime constraint is the boundary.

## Dependencies

It depends on docs-model for the shared `SpectreRef` reference type, and on `@codecaine-ai/canvas`.

It is depended on by docs-server, `@codecaine-ai/docs-workbench`, and docs-cli.

Across the seven-package split, the repo-root `import-boundaries.test.ts` forbids every package root from importing host-app code.

## Using it alone

No server is required. Scripts can use the package for link audits, backlink rebuilds, and bundle renames; the CLI commands `docs backlinks rescan` and `docs links check` drive it directly.

> **Boundary under review: Could this be part of docs-server?** — Folding `@codecaine-ai/docs-index` into `@codecaine-ai/docs-server` is a live candidate: both are Bun-only server-side layers, and docs-server is the index's main consumer. The current split is a judgment call. It remains separate because the index is derived, rebuildable state with no HTTP surface and is useful from the CLI without running a server.
