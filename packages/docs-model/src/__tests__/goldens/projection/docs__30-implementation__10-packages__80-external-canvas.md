Boundary decisions for the independently owned Canvas and Sequence projects the docs system consumes without owning. Source: `external/canvas` and `external/sequence`.

## Governed By

Canvas family: the reference-block contract and forwarded-authority pattern the boundary implements.

Canvas and Media: the presentation and interaction contract for embedded surfaces.

Text Measurement defines the shared package that the diagram engines and the docs layout lints measure with.

## Decisions

### `external/` Records Ownership

- **Decision**

  - Canvas and Sequence mount as git submodules under `external/`, with their own repositories, workspace roots, and tooling.

  - `make install` in `Makefile` installs docs-system from the Core root workspace, whose globs leave `external/` out. In that workspace, `@codecaine-ai/canvas` and `@codecaine-ai/sequence` resolve to the `canvas` and `sequence` checkouts beside docs-system.

  - The `external/` copies serve standalone use. The docs-system `package.json` lists them as workspaces, and docs-publish imports their sources by relative path.

- **Why**

  - The layout makes ownership literal, because the docs system supports these projects but does not own them.

  - Vendoring the engines as first-party packages under `packages/` was rejected, because it would assign their engines and editors to the docs-system package graph.

- **Applies to**

  - The rule covers `external/`, `.gitmodules`, and `package.json`, and every future externally owned project mounts the same way.

### Only agent-schema crosses the pure-model wall

- Decision: docs-model imports nothing from either project except its `agent-schema` leaf; lifted descriptors become forwarded actions handled by the owning authority, and the model never imports an engine. `import-boundaries.test.ts` enforces the restriction.

  - `@codecaine-ai/text-measure` also lives in the canvas repository, but it is a separate package with no engine. docs-model imports only its core entry.

- Why: Schema truth stays in the owning package without dragging its engine into the pure model. Rejected: redefining external operation schemas inside docs-model, which drifts from the authority.

- Applies to: `packages/docs-model`, `external/*/packages/*/src/agent-schema.ts`. Every future external authority exposes an agent-schema leaf and nothing more to the model.

### Engines Enter Only Through Host Slots, and Injection Grants No Authority

- **Decision**

  - docs-viewer never imports either engine. Hosts inject renderers through the `canvasEmbed` and `sequenceEmbed` provider slots.

  - Injected surfaces are read-only. Mutation routes through docs-server's typed patches or the standalone Studio's own hash-guarded save.

- **Why**

  - The slot keeps the viewer liftable, because another host may supply different loaders or renderers.

  - The slot also keeps mutation authority out of the embeds.

  - A viewer engine dependency and embed-side writes were rejected.

- **Applies to**

  - The rule covers `packages/docs-viewer` and `packages/docs-workbench/web/src/pages`. Every future engine embed uses a provider slot and stays mutation-free.

> **Integration constraint: The workbench deep link sends src and server** — The workbench sends both `src` and `server`, using the docs page origin for `server`. Canvas Studio honors that origin and falls back to its stored or default docs-server origin only when `server` is absent.

### Sidecars stay canonical files in the docs repository

- Decision: Canvas and sequence documents are sidecar files in the docs tree (`.canvas.json` under an `assets/canvases/` segment) confined and served by docs-server. Studio drafts stay separate, and opening a project board never creates a second authoritative copy in an engine-local store.

- Why: One canonical home keeps hash preconditions, undo, and reference indexing meaningful. Rejected: storing project content in engine-local draft stores, which would fork authority.

- Applies to: `packages/docs-server/src/canvas-sidecar.ts`, `packages/docs-server/src/sequence-sidecar.ts`, docs trees. Every future sidecar kind keeps its canonical file in the repository.

### Diagram Engines Measure Text With the Shared Package

- **Decision**

  - `@codecaine-ai/canvas` and `@codecaine-ai/sequence` depend on `@codecaine-ai/text-measure`, the package the docs layout lints measure with.

  - The package lives in the canvas repository, in `canvas/packages/text-measure`, and installs only from the Core root workspace. The docs-system workspace list does not include it.

  - The workbench loads the bundled faces at startup. `CanvasEmbed.tsx` and `SequenceEmbed.tsx` lay their diagrams out again when the faces arrive.

  - docs-publish loads HarfBuzz before it lays out diagrams at build time. Each published diagram SVG embeds the faces it paints as woff2 data URLs, because an `<img>` SVG cannot load the page's fonts.

- **Why**

  - With one package and one set of font files, a label that a lint says fits also fits on screen.

  - Canvas paints its own text in Inter and IBM Plex Mono, so this corpus records only the dependency boundary and leaves canvas internals to the canvas repository.

- **Applies to**

  - The rule covers the embeds in `packages/docs-workbench/web/src/pages`, the font loader in `docs-fonts.ts`, the publisher in `packages/docs-publish/src`, and every future engine embed that lays out text.

> **Known gap: Published diagrams follow the submodule pins** — docs-publish lays out diagrams with the `external/canvas` and `external/sequence` sources, so a published diagram measures text the way the pinned commits do. The current pins predate `@codecaine-ai/text-measure`, so published labels can sit a few pixels off the widths the workbench measures. Moving both pins to commits that use the package closes the gap.
