Package lines are dependency firewalls. They keep the pure format, server-side authority, browser product, and runnable application from inheriting one another's runtime costs and host assumptions. The pages below describe the as-built packages inside those walls and the thinner cuts that remain open to consolidation.

## Dependency Firewalls

A package boundary exists when a consumer must not inherit the union of React and TipTap, filesystem and SQLite access, HTTP policy, application routing, and external editor engines. The boundary is architectural only when imports remain one-way: lower layers define contracts, higher layers compose them, and host-specific code never flows back into reusable packages. The System design — overview owns the contracts that these packages implement.

> **Decision: Package lines are dependency firewalls** — Directory organization follows dependency permission. A package may expose a narrow seam to a heavier layer without absorbing that layer's implementation, runtime, or host policy.

## The Four Load-Bearing Walls

Four runtime boundaries survive package renames and likely reorganizations. The root workspace in `package.json` contains more directories because each wall can contain smaller responsibility or distribution cuts.

**Load-bearing runtime walls**

| Wall | As-built packages | Dependency rule |
| --- | --- | --- |
| Pure model | docs-model | Shared schemas and operations stay free of React, TipTap, DOM, filesystem, network, and host application code. |
| Server-side | docs-index, docs-server, and command-only docs-cli paths | Bun, SQLite, filesystem, HTTP, validation, and persistence may live here; none of them may enter browser packages. |
| Browser-side | docs-viewer | React and TipTap may live here; transport, persistence, routing, server policy, and external engines stay behind host seams. |
| Runnable app | docs-workbench | The host may import both server and viewer packages because composition is its purpose; model, server, and viewer packages never import it, while docs-cli lazy-loads it for app commands. |

## What Runs Together

> **Mental model** — **A RUNNING DOCS INSTALLATION** = `docs-model + docs-index + docs-server + docs-viewer`, composed by `docs-workbench`. **AN AGENT INTERACTING WITH IT** speaks the `docs-cli` dialect. `framework` distributes methodology and is not required at runtime.

## The Thinner Cuts

The remaining boundaries preserve useful responsibilities without creating another load-bearing runtime wall. They are real in the current source tree and explicitly reversible.

- **docs-index and docs-server**

  - SQLite forces the index into the server-side wall. A separate package keeps rebuildable link analysis usable without mounting HTTP routes, but that separation is judgment.

- **docs-cli and docs-workbench**

  - The executable keeps render, search, migration, and integrity commands scriptable. Its `serve` and `export` paths lazy-load the runnable app, so command-only use does not start the browser stack.

- **framework as a package**

  - The workspace package makes the manual, templates, and skill resolvable and symlinkable. It contributes no runtime code.

Canvas and Sequence are different kinds of boundary. They are independent projects mounted under `external/`; their placement records ownership, while narrow model and host seams control how the docs system consumes them.

## Boundaries Under Review

> **Open call: Fold docs-index into docs-server** — Keeping the index out of the browser is forced. Keeping derived, rebuildable state with no HTTP surface outside the server remains a judgment call.

> **Open call: Merge docs-cli and docs-workbench** — The command package already launches workbench for `serve` and `export`. The stable command dialect may be an entry point of the runnable app rather than a separate package.

> **Open call: Unpackage framework** — A running installation behaves identically without the methodology package. Its packaging is a distribution channel that can change without moving a runtime wall.

## Enforcement

The checks in `import-boundaries.test.ts` forbid host-application imports from reusable package roots, forbid React and TipTap imports from docs-model, and restrict docs-model's Canvas and Sequence imports to each project's `agent-schema` leaf. These checks protect the pure-model wall and the host boundary; package manifests and code review still carry the remaining server/browser direction.

> **Enforcement gap: The root boundary test is not in the default test script** — The root `package.json` scopes `bun run test` to package directories, so `import-boundaries.test.ts` must currently be invoked separately.

`packages/docs-viewer/src/__tests__/component-mirror.test.ts` separately keeps viewer component folders aligned with model component ownership. It runs inside the package-scoped viewer test suite.

## Package Pages

Each immediate child documents one current package boundary or supported neighboring-project boundary.

### Runtime Packages

- docs-model — The Format

  - The dependency-pure document schema, operation vocabulary, component registries, validation, and agent rendering.

- docs-index — Backlinks

  - The Bun and SQLite derived index, reference matching, confined paths, and document moves.

- docs-server — the Mutation Authority

  - The headless store and route factory for reads, hash-guarded writes, locks, undo, events, and sidecars.

- docs-viewer — rendering and editing

  - The browser-pure React renderer and editor with injected data and embed seams.

- docs-workbench — the app

  - The thin server-and-SPA composition point for live serving and static export.

### Interfaces and Neighbors

- docs-cli — the agent dialect

  - The scriptable command surface for rendering, search, integrity, migration, serving, and export.

- framework — the loadable skill

  - The runtime-optional methodology, templates, and agent skill distributed as a workspace package.

- External Canvas and Sequence

  - The independently owned engines, sidecar seams, injected viewers, and standalone authoring applications mounted under external/.
