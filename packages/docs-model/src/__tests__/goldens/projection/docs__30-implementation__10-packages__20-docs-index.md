`@codecaine-ai/docs-index` is the Bun-side package that derives inbound-reference lookup from canonical document bundles and canvas sidecars. It owns SQLite storage, reference-path identity, docs-root confinement, and move-time inbound fixup. Doc standards defines the corpus-level linking contract; this package makes that contract queryable and maintainable.

## Why It Is Its Own Package

> **Decision: Bun forces the runtime boundary** — `bun:sqlite` cannot enter a browser bundle. The index must therefore stay outside `@codecaine-ai/docs-model` and `@codecaine-ai/docs-viewer`. This constraint forces server-side placement; it does not by itself force a package separate from docs-server.

> **Open call: docs-index may merge into docs-server** — The merge remains unresolved. docs-server — the Mutation Authority is the primary consumer and already owns the save hooks and connection cache, so co-location would remove glue. The present split keeps a derived, HTTP-free service usable by link checks and maintenance scripts without constructing a server. Neither advantage is a forcing constraint.

## Structure

```
packages/
└── docs-index/
    └── src/
        ├── __tests__/  # CRUD, rescan, alias matching, confinement, and partial-failure move contracts.
        ├── backlinks.ts  # SQLite schema, extraction, source replacement, inbound queries, and full rescan.
        ├── index.ts  # Barrel for the package and its subpath exports.
        ├── move-doc.ts  # Bundle move plus inbound document and canvas reference fixup.
        ├── paths.ts  # Pure relative-path checks and docs-root-confined bundle resolution.
        └── ref-match.ts  # Tolerant document identity and canonical rewrite rules.
```

## Public Surface

`packages/docs-index/package.json` exposes the root barrel and dedicated `./backlinks`, `./ref-match`, `./move-doc`, and `./paths` subpaths. The package has no binary and no HTTP surface.

**Index Operations**

```
openBacklinksDb(dbPathOrDocsRoot: string) -> Promise<Database>  # Open or create the docs-local SQLite database and ensure its table and indexes exist.
  dbPathOrDocsRoot: string  # A docs root, or :memory: for an in-process derived index.
upsertForSource(db: Database, sourcePath: string, refs: BacklinkRef[]) -> void  # Transactionally replace every row for one document or canvas source.
queryInbound / queryInboundTolerant(db: Database, targetPath: string) -> BacklinkRow[]  # Read exact stored targets or union every accepted document-path alias.
rescanAll(docsRoot: string, db?: Database) -> { dbPath, sourcesScanned, refsIndexed }  # Rebuild the complete table from doc.json bundles and canvas sidecars under a docs root.
normalizeDocRefPath(path: string) -> string  # Normalize a legacy or bundle-form document path to one docs-root-relative identity.
rewriteDocRefPath(path: string, fromPath: string, toPath: string) -> string  # Rewrite a matching document reference and emit the destination in canonical bundle form.
moveDocBundle(docsRoot: string, fromPath: string, toPath: string, deps: MoveDocDeps) -> Promise<MoveDocResult>  # Move a bundle and rewrite indexed inbound references through caller-supplied save seams.
resolveDocBundleJsonPath(docsRoot: string, path: string) -> string | null  # Resolve an accepted bundle shape to doc.json without escaping the docs root.
```

## Derived State

The repository-local database is `docs/.index/backlinks.db`; another docs root receives the same `<docsRoot>/.index/backlinks.db` layout. The root `.gitignore` excludes `.index/`, so clones and branches never exchange the database as document state. A read-only workbench can use an in-memory index and rebuild it for that process.

> **Invariant: The database is rebuildable, not canonical** — Reference spans in `doc.json` and links in `*.canvas.json` are the inputs. SQLite rows are a disposable acceleration structure. An index failure may make backlinks stale or unavailable, but it must never invalidate or veto an already-valid document save.

## Maintenance Paths

The package supports incremental maintenance for ordinary saves and a complete rebuild for startup, out-of-band edits, or cache repair. Both paths extract the same block-level document references and object-level canvas links.

- Successful API saves replace one source

  - docs-server calls the index after a document or canvas write commits. `upsertForSource` provides transactional per-source replacement. The server hook is fire-and-forget and logs and swallows failures, which keeps derived-state maintenance outside save correctness.

- A rescan replaces the whole table

  - `rescanAll` walks `doc.json` and `*.canvas.json`, skipping dot-directories and `node_modules`. `docs-cli backlinks rescan` exposes this repair path; `docs-cli links check` rescans before testing targets.

## Reference Identity

The table stores each target path verbatim because legacy `docs/`-prefixed Markdown paths and canonical bundle paths can coexist. Exact queries remain available for source-file targets. Tolerant document queries normalize `.md`, `.mdx`, `doc.json`, bundle-folder, backslash, and retired trailing `00-overview` forms to one docs-root-relative identity. A rewrite always emits that canonical bundle path, so maintenance converges old references instead of preserving their aliases.

## Move and Rename Fixup

`packages/docs-index/src/move-doc.ts` owns bundle moves and inbound reference repair through injected document and canvas save seams. Tolerant identity matching covers document spans and canvas links, including sources carried inside the moved bundle. The contract reports rewritten sources and per-source failures.

> **Named tradeoff: Move fixup is intentionally non-atomic** — The folder rename is not rolled back when a later inbound source fails. `moveDocBundle` returns `rewrittenSources` and `failures` so callers can surface incomplete fixup and run link verification. This is honest partial completion, not cross-file atomicity.

Path helpers reject absolute paths, traversal segments, empty segments, and null bytes before resolving bundle shapes. Resolution checks the normalized absolute result against the docs root and refuses arbitrary JSON shapes. Move and server callers share these helpers so confinement is one package contract.

## Invariants and Firewalls

- Canonical content stays outside SQLite

  - The package reads document types from docs-model — The Format and canvas link types from `@codecaine-ai/canvas`; it stores extracted reference facts, never substitute document state.

- Index maintenance cannot become save authority

  - docs-server owns validation, hash and lock checks, persistence, and undo. docs-index receives committed state or injected save seams; it never writes a document around those contracts.

- Host code and browser code stay out

  - The repository import-boundary test scans this package for host-app imports. The Bun-only package exposes no React surface and no HTTP routes.

## Related Files

- `packages/docs-index/src/backlinks.ts`

  - Defines the derived database and its incremental and rebuild paths.

- `packages/docs-index/src/ref-match.ts`

  - Defines tolerant identity and canonical rewrite behavior.

- `packages/docs-index/src/move-doc.ts`

  - Coordinates bundle moves, inbound fixup, and partial-failure reporting.

- `packages/docs-index/src/paths.ts`

  - Keeps bundle resolution confined to the selected docs root.

- `packages/docs-server/src/backlinks-cache.ts`

  - Connects committed server saves to best-effort incremental indexing.

- `import-boundaries.test.ts`

  - Enforces host independence across the package source tree.

- `packages/docs-index/package.json`

  - Declares the Bun-side dependencies and importable subpaths.
