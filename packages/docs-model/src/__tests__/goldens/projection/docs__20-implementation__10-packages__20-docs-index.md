The Bun-side package deriving inbound-reference lookup from document bundles and canvas sidecars — SQLite storage, reference-path identity, docs-root confinement, and move-time fixup. Source: `packages/docs-index`.

## Governed By

Cross-doc linking — the corpus-level linking contract this package makes queryable and maintainable.

## Decisions

### The index is derived state, never save authority

- Decision: The database lives at `<docsRoot>/.index/backlinks.db`, gitignored and fully rebuildable from reference spans in `doc.json` and links in `*.canvas.json`. The package stores extracted reference facts only — never substitute document state — and receives committed state or injected save seams; it never writes a document around docs-server's contracts, and an index failure never invalidates a valid save.

- Why: Canonical content must stay in the files so clones and branches never exchange the database as document state. Making index maintenance part of the save transaction was rejected — a broken or locked index would then fail document saves.

- Applies to: `packages/docs-index/src`, `packages/docs-server/src/backlinks-cache.ts` — future derived state follows the same rebuildable, non-vetoing pattern.

### Library subpaths only — no HTTP, no binary, no React

- Decision: The package exposes the root barrel plus `./backlinks`, `./ref-match`, `./move-doc`, and `./paths` subpaths and nothing else — no routes, no executable, no browser surface.

- Why: An HTTP-free library keeps link checks and maintenance scripts usable without constructing a server; the merge into docs-server was considered and rejected on the packages page. `bun:sqlite` already forces the package out of every browser bundle.

- Applies to: `packages/docs-index` — future index capabilities land as library subpaths.

### Confinement is one package contract

- Decision: Docs-root confinement — rejecting absolute paths, traversal segments, empty segments, and null bytes, and resolving bundle shapes only inside the selected root — lives in `packages/docs-index/src/paths.ts` and is shared by move and server callers.

- Why: One confinement implementation instead of per-caller checks — a caller with its own path logic would eventually diverge from the contract. Rejected: duplicating confinement in each consumer.

- Applies to: `packages/docs-index/src/paths.ts` and its consumers — every future path-accepting entry point routes through these helpers.
