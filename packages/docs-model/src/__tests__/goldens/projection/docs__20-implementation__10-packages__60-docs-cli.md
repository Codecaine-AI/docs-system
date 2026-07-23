`@codecaine-ai/docs-cli` is the executable dialect for agents, humans, and repository automation. Its `docs-cli` binary turns document reading, discovery, integrity checks, migration, local serving, and static export into stable process calls. The package is a leaf entry point over docs-model, docs-index, and docs-workbench rather than a new document or server authority.

## The Cut

> **Decision: The command dialect is durable** — Agents read with `docs-cli render`, discover with `docs-cli grep`, and gate reference integrity with `docs-cli links check`. Command names, arguments, stdout, and exit behavior must remain scriptable while the app shell evolves. That requirement applies whether the executable remains a separate package or moves into workbench.

> **Open call: docs-cli may merge into docs-workbench** — The package split is a judgment call. `docs-cli` already declares `@codecaine-ai/docs-workbench` as a dependency, and `serve` and `export` delegate directly to it. Dynamic imports defer app loading, but the install graph is not isolated. Keeping the package preserves a named executable surface for command-only use; merging it could simplify distribution without changing that surface. No runtime incompatibility settles the choice.

## Structure

```
packages/
└── docs-cli/
    └── src/
        ├── __tests__/  # Process output, exit status, read-only command, link, and audit contracts.
        ├── migrate/  # Markdown-family adoption pipeline.
        │   ├── __tests__/  # Migration conversion, rerun, fixture, and round-trip contracts.
        │   ├── inline-to-delta.ts  # Re-export of the shared browser-safe inline tokenizer.
        │   ├── mdx-to-doc.ts  # Frontmatter, Markdown, and MDX-component conversion into validated document blocks.
        │   └── run.ts  # Tree walk, bundle placement, reports, asset copying, and opt-in twin retirement.
        ├── audit.ts  # Bundle-tree structural and content-convention audit.
        └── index.ts  # Argument dispatch plus render, grep, backlinks, links, serve, and export wiring.
```

## Command Surface

`packages/docs-cli/package.json` maps the `docs-cli` binary to `packages/docs-cli/src/index.ts` and exposes importable root, audit, and migration helpers. The entrypoint dispatches argv only when executed as the CLI, so importing those helpers does not start a command.

**docs-cli**

```
render(path: string) -> Markdown on stdout; exit 1 on resolution, parse, or validation failure  # Resolve a bundle, validate doc.json, and render agent-readable Markdown.
  path: string  # Bundle directory, explicit doc.json, bare *.doc.json, or docs-relative bundle path.
grep(term: string, pathPrefix?: string) -> path:line: text rows plus a match count  # Render bundles and search their Markdown line by line, case-insensitively.
  pathPrefix?: string  # Search root; defaults to docs.
backlinks rescan(docsRoot?: string) -> Database path and scan totals  # Rebuild the derived backlinks database from documents and canvas sidecars.
  docsRoot?: string  # Defaults to ./docs.
links check(docsRoot?: string) -> Stale references; exit 1 when any remain  # Rescan references, then verify document targets and repository-relative source targets.
  docsRoot?: string  # Defaults to ./docs.
audit(docsRoot?: string) -> Findings; structural errors exit 1 and warnings exit 0  # Check numbering, parent-document structure, bundle validity, title count, image alt text, and opening paragraphs.
  docsRoot?: string  # Defaults to ./docs.
migrate(repoRoot?: string, --drafts?: flag, --retire-twins?: flag, --yes-delete-markdown?: flag, --dry-run?: flag) -> Migration report file for conversion or JSON stdout for retirement; exit 1 on conversion failures or missing deletion confirmation  # Convert Markdown-family source files into folder bundles and write a migration report.
  repoRoot?: string  # Discovered upward from the current directory when omitted.
  --drafts?: flag  # Include docs/.drafts, which is exempt by default.
  --retire-twins?: flag  # Select the separate Markdown-twin deletion branch.
  --yes-delete-markdown?: flag  # Required confirmation for a real retirement.
  --dry-run?: flag  # Preview retirement; the ordinary migration branch does not consume this flag.
serve(--root?: path, --port?: integer, --ui-port?: integer, --host?: string, --dev / --rebuild / --theme-locked?: flags) -> Long-running workbench process  # Run the workbench API and SPA against a selected docs root.
  --root?: path  # Defaults to docs.
  --port?: integer  # API or combined-server port; defaults to 4800.
  --ui-port?: integer  # Optional fixed Vite port in development mode.
  --host?: string  # Bind address; defaults to loopback.
export(--root?: path, --out: path, --rebuild?: flag) -> JSON export report; exit 1 when bundle failures occur  # Build a read-only static workbench and its data snapshots.
  --root?: path  # Defaults to docs.
```

## Why Stability Matters

The Translation layer gives agents a text-first reading surface while `doc.json` remains canonical state. The CLI makes that separation operational: automation invokes a command and consumes Markdown or findings instead of coupling itself to block-schema traversal.

- Read and discovery share one renderer

  - `render` validates one bundle before calling docs-model's Markdown renderer. `grep` applies that same path across the tree, skips invalid bundles, and reports stable repository-relative locations.

- Verification is process-readable

  - `links check` fails on stale references. `audit` fails on structural errors but keeps convention warnings informational. Agents can gate work on exit status without scraping workbench UI state.

- The process boundary outlives UI refactors

  - Repository instructions, scripts, and agent tools depend on command vocabulary and failure semantics. They do not need to know whether serving uses one port, two ports, a rebuilt SPA, or another future shell.

## Integrity Commands

`backlinks rescan` is explicit cache maintenance. `links check` always performs that rebuild first, then accepts canonical bundle targets or legacy `.md`/`.mdx` files and checks source references against the repository root. `audit` does not use SQLite; it classifies bundle and section directories, validates documents, and separates hard tree invariants from content conventions.

## Migration Boundary

Migration stays below the command dispatcher in its own directory because it is adoption machinery, not steady-state reading. The runner selects `.mdx`, `.md`, and `.markdown` sources, converts them to validated blocks, places folder bundles, copies referenced local assets, and records warnings and failures. The converter keeps unknown MDX components losslessly as source-bearing blocks rather than silently dropping them.

> **Safety boundary: Ordinary migration writes alongside sources** — The default command creates `doc.json` bundles and a report without modifying or deleting Markdown. Retirement is a separate `--retire-twins` branch. A real deletion also requires `--yes-delete-markdown`; `--dry-run` previews that retirement branch and does not make the ordinary migration branch read-only.

## Serving and Export

`serve` parses and validates process flags, then dynamically imports docs-workbench — the app. The CLI does not duplicate the workbench server, route table, SPA builder, or export data layer.

- Default serve composes one live host

  - Workbench reuses or rebuilds the Vite SPA according to source freshness, mounts the docs-server read/write routes and store, rescans and primes backlinks, watches external filesystem edits, and serves the SPA and API on one port. Binding defaults to `127.0.0.1`; `--theme-locked` hides theme editing and refuses theme writes.

- Development serve composes two processes

  - `--dev` starts the API with filesystem watching and spawns Vite with an `/api` proxy for hot reload. Signal handling terminates the child process with the CLI host.

`export` delegates to the workbench static runner. It writes a static-mode SPA plus tree, bundle, Markdown, backlink, and asset snapshots under the explicit output directory. The export builds backlinks in memory, so it does not create derived state inside the source docs tree.

## Invariants and Firewalls

The package depends on docs-model for validation and Markdown rendering, docs-index — Backlinks for reference maintenance, and docs-workbench for runnable serving and export. Those packages own their contracts; CLI code adapts them to argv, stdout, stderr, and exit status.

- The executable remains a leaf

  - Library modules do not import docs-cli. Reusable logic belongs below it, so direct consumers can import model, index, server, viewer, or workbench helpers without starting the command parser.

- Side effects stay command-explicit

  - `render` and `grep` do not write. Backlink and link commands may replace only derived SQLite state. Migration, serve, and export confine writes to the selected repository, docs root, build directory, or output directory.

- Host-repository imports are forbidden

  - The repository import-boundary test scans CLI source with the other docs packages for imports from Spectre and other host-app paths. Repository-specific project lookup stays outside the command dialect.

## Related Files

- `packages/docs-cli/src/index.ts`

  - Defines the binary dispatch and the stable command-level adapters.

- `packages/docs-cli/src/audit.ts`

  - Separates failing corpus invariants from informational conventions.

- `packages/docs-cli/src/migrate/run.ts`

  - Owns whole-tree migration, reporting, asset copying, and gated retirement.

- `packages/docs-cli/src/migrate/mdx-to-doc.ts`

  - Maps frontmatter, prose, and MDX components into document blocks.

- `packages/docs-workbench/src/run-serve.ts`

  - Implements the production and development compositions behind serve.

- `import-boundaries.test.ts`

  - Keeps the reusable command package independent of host applications.

- `packages/docs-cli/package.json`

  - Declares the executable, importable helper subpaths, and lower-layer dependencies.
