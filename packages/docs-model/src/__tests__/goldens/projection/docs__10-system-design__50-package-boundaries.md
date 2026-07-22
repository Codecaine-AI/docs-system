# Package Boundaries

The package split is where this system says the code is allowed to be cut. It is a map of runtime and ownership boundaries, not a list of pieces a user assembles by hand: some seams isolate genuinely incompatible environments and would survive any rewrite; others are current judgment calls, named as such and open to collapse.

## Why Seven

The count is six code packages plus one methodology package. The defensible splits follow incompatible runtimes first: one definition of the document format has to exist identically in the browser, on a Bun server, and inside a CLI, and no single artifact can serve all three unless it stays free of every environment's dependencies. The remaining seams expose current responsibilities and distribution choices rather than hard constraints — real boundaries today, but boundaries this page treats as decisions, not facts of nature.

## The Dependency Chain

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

The chain is the design claim, not a build detail: the format depends on nothing, the index and server depend only on the format, the viewer sees the format and nothing else, and only the composition and interface layers — workbench and cli — are allowed to see everything. Dependency points one way, so a change in any layer can only ripple upward, never into the schema beneath it.

## What You Actually Need Together

The seven-way split describes ownership, not deployment. What runs together is smaller:

> **Mental model** — **A RUNNING DOCS INSTALLATION** = `docs-model + docs-index + docs-server + docs-viewer`, composed by `docs-workbench`. **AN AGENT INTERACTING WITH IT** speaks the `docs-cli` dialect. `framework` is methodology, not runtime; a running installation works identically without it.

## Forced Boundaries vs Judgment Calls

Each boundary earns its place for exactly one reason, and the reasons split cleanly in two. Forced boundaries follow from runtime incompatibilities and survive package renames and reorganizations. Judgment calls are defensible drawings of responsibility that could land elsewhere.

- **docs-model — one format, three runtimes.** Browser, Bun server, and CLI must share one definition of `doc.json`; pure TypeScript with no React, filesystem, or network access is what makes that possible. Forced.

- **docs-index — Bun-only.** `bun:sqlite` cannot be bundled into the browser, so the derived backlink index lives outside the viewer. Forced out of the browser; separate from the server by judgment.

- **docs-server — embeddable without React.** The mutation authority must drop into host applications that have no UI stack. Forced.

- **docs-viewer — browser-pure.** The render-and-edit surface must lift into any host React app with docs-model as its only docs dependency. Forced.

- **docs-workbench — the composition point.** It deliberately reunites server and viewer at the runnable-product boundary instead of weakening either package's constraints. Judgment, and by design.

- **docs-cli — the stable dialect.** Agents and humans get one command surface that outlives internal reshuffles. Judgment: `serve` and `export` already drive the workbench.

- **framework — distribution convenience.** Zero dependencies, zero runtime code; packaging the methodology just lets host repos resolve and symlink it like any dependency. Judgment.

- **canvas — not an eighth package.** `external/canvas` is its own project, vendored under `external/`; only its inner packages join the workspace so embeds resolve. Forced.

## Boundaries Under Review

> **DECISION: Boundary under review: fold docs-index into docs-server** — Keeping the index out of the browser is forced; keeping it out of the server is not. The index is derived, rebuildable state that only the server and CLI consume — it may belong inside the mutation authority.

> **DECISION: Boundary under review: merge docs-cli and docs-workbench** — `serve` and `export` already drive the workbench, so the interface package and the composition package may be one package wearing two entry points.

> **DECISION: Boundary under review: unpackage framework** — The methodology has no runtime; a running installation behaves identically without it. Packaging is a distribution channel, and the channel could change without touching the architecture.

## Schema Authority

One claim outranks the rest of this page: docs-model's types are the canonical definition of the system, and every other package is machinery around them. The server enforces the types, the viewer renders them, the index derives from them, the CLI speaks them. Cut the packages differently tomorrow and the system survives; change the types and every package follows.

How the split stands in code today — every package, what it owns, and the tests that hold these boundaries — is the as-built package map.
