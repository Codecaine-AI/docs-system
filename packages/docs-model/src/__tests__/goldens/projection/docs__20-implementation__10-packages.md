Structural decisions for the workspace package cut — how the docs system's code divides into packages and why the walls sit where they do. Source: `packages/` and `external/`.

## Governed By

System design — owns the contracts these packages implement; the package cut only decides where the implementations live.

## Decisions

### Package lines are dependency firewalls

- Decision: A package boundary exists where a consumer must not inherit the union of React and TipTap, filesystem and SQLite access, HTTP policy, application routing, and external editor engines. Imports stay one-way: lower layers define contracts, higher layers compose them, and host-specific code never flows back into a reusable package. A package may expose a narrow seam to a heavier layer without absorbing that layer's implementation, runtime, or host policy.

- Why: Directory organization follows dependency permission, not feature grouping — a feature-shaped cut was rejected because it lets one consumer's runtime and host policy leak into every other consumer of the shared code.

- Applies to: `packages/*`, `external/` — including every future package and external mount.

### Four load-bearing walls, downward dependency chain

- Decision: Four runtime walls hold regardless of package renames — pure model (`docs-model`: free of React, TipTap, DOM, filesystem, network, and host code), server-side (`docs-index`, `docs-server`, and command-only `docs-cli` paths: Bun, SQLite, filesystem, and HTTP may live here and never enter browser packages), browser-side (`docs-viewer`: React and TipTap may live here; transport, persistence, routing, server policy, and external engines stay behind host seams), and the runnable app (`docs-workbench`: may import both sides because composition is its purpose; no lower package imports it). The dependency chain reads strictly downward: `docs-cli` → `docs-workbench` → `docs-server` → `docs-index` → `docs-model`, with `docs-viewer` depending only on `docs-model` and `framework` carrying no dependency edges at all.

- Why: Collapsing a wall was rejected because it forces some consumer to carry a runtime it cannot use — the model in a browser bundle would drag Bun I/O, the viewer in a server would drag React. The workspace holds more directories than walls because each wall can contain smaller responsibility or distribution cuts.

- Applies to: `packages/*`, `package.json` — a new package must land inside exactly one wall, and a new dependency edge must point downward.

### docs-index stays separate from docs-server

- Decision: Derived link analysis lives in its own Bun package with no HTTP surface and no binary, consumed by the server and the CLI as a library.

- Why: SQLite forces server-side placement but not a separate package. Folding the index into docs-server was considered — the server is its primary consumer and owns the save hooks and connection cache, so co-location would remove glue — and rejected so rebuildable link analysis stays usable by link checks and maintenance scripts without constructing a server.

- Applies to: `packages/docs-index`, `packages/docs-server` — future derived-state services follow the same HTTP-free library shape.

### docs-cli stays separate from docs-workbench

- Decision: The executable command surface is its own leaf package; its `serve` and `export` commands lazy-load the runnable app.

- Why: Command-only use — render, search, migration, integrity — must be scriptable without starting the browser stack. Merging the CLI into the workbench was considered, since the CLI already depends on it and no runtime incompatibility separates them, and rejected to preserve a named executable surface whose install graph stays deliberate for command-only callers.

- Applies to: `packages/docs-cli`, `packages/docs-workbench` — future app-shaped capability loads lazily behind a command.

### framework is a runtime-optional workspace package

- Decision: The methodology manual, templates, and agent skill ship as a workspace package that contributes no runtime code; no running package imports it.

- Why: Workspace packaging makes the manual resolvable, versionable, and symlinkable into host repositories. Unpackaging it into plain repository content was considered — a running installation behaves identically without it — and rejected only on delivery convenience; the boundary names a distribution unit, not a runtime wall.

- Applies to: `packages/framework` — including any future content-only package.

### Canvas and Sequence mount under external/

- Decision: Independently owned projects mount as git submodules under `external/`, never `packages/`; the docs system consumes them only through narrow model and host seams.

- Why: The layout records ownership — moving either project into `packages/` would falsely assign its engine and editor to the docs-system package graph. Rejected: vendoring the engines as docs-system packages.

- Applies to: `external/`, `.gitmodules` — every future externally owned project; seam rules live on External Canvas and Sequence.

### import-boundaries.test.ts is the enforcement mechanism

- Decision: The repo-root `import-boundaries.test.ts` enforces the walls: host-application imports are forbidden from reusable package roots, React and TipTap imports are forbidden from docs-model, and docs-model's Canvas and Sequence imports are restricted to each project's `agent-schema` leaf. The root `package.json` scopes `bun run test` to the package directories plus this test, so every run executes the boundary checks. A future package must be added to the scoped test.

- Why: The pure-model wall and the host boundary are load-bearing enough to be machine-checked; relying on manifests and code review alone was rejected. Manifests and review still carry the remaining server/browser direction.

- Applies to: `import-boundaries.test.ts`, `package.json`, `packages/*` — every future package joins the scoped suite.

## Package Roster

- docs-model — the dependency-pure format authority: schema, operations, component registries, validation, and agent rendering.

- docs-index — the Bun/SQLite derived backlinks index, reference identity, and move fixup.

- docs-server — the embeddable mutation authority for one docs tree.

- docs-viewer — the browser-pure React renderer and editor with injected data and embed seams.

- docs-workbench — the runnable composition host; a running installation is docs-model + docs-index + docs-server + docs-viewer composed by this package.

- docs-cli — the scriptable command dialect an agent interacting with an installation speaks.

- framework — the runtime-optional methodology, templates, and agent skill.

- External Canvas and Sequence — the independently owned engines and studios mounted under `external/`.
