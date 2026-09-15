Boundary decisions for the independently owned Canvas and Sequence projects the docs system consumes without owning. Source: `external/canvas` and `external/sequence`.

## Governed By

Canvas family — the reference-block contract and forwarded-authority pattern the boundary implements.

Canvas and Media — the presentation and interaction contract for embedded surfaces.

## Decisions

### external/ records ownership

- Decision: Canvas and Sequence mount as git submodules under `external/`, keeping their own repositories, workspace roots, and tooling; the root `package.json` admits only `external/canvas/packages/*` and `external/sequence/packages/*` into the Bun workspace so their inner packages resolve for consumers.

- Why: The layout makes ownership literal — the docs system supports these projects but does not own them; moving either into `packages/` would falsely assign its engine and editor to the docs-system package graph. Rejected: vendoring the engines as first-party packages.

- Applies to: `external/`, `.gitmodules`, `package.json` — every future externally owned project mounts the same way.

### Only agent-schema crosses the pure-model wall

- Decision: docs-model imports nothing from either project except its `agent-schema` leaf; lifted descriptors become forwarded actions handled by the owning authority, and the model never imports an engine. `import-boundaries.test.ts` enforces the restriction.

- Why: Schema truth stays in the owning package without dragging its engine into the pure model. Rejected: redefining external operation schemas inside docs-model, which drifts from the authority.

- Applies to: `packages/docs-model`, `external/*/packages/*/src/agent-schema.ts` — every future external authority exposes an agent-schema leaf and nothing more to the model.

### Engines enter only through host slots, and injection grants no authority

- Decision: docs-viewer never imports either engine; hosts inject renderers through the `canvasEmbed` and `sequenceEmbed` provider slots, and injected surfaces are read-only — mutation routes through docs-server's typed patches or the standalone Studio's own hash-guarded save.

- Why: The slot keeps the viewer liftable — another host may supply different loaders or renderers — and keeps mutation authority honest instead of leaking it into embeds. Rejected: a viewer engine dependency and embed-side writes.

- Applies to: `packages/docs-viewer`, `packages/docs-workbench/web/src/pages` — every future engine embed uses a provider slot and stays mutation-free.

> **Integration constraint: The workbench deep link sends src and server** — The workbench sends both `src` and `server`, using the docs page origin for `server`. Canvas Studio honors that origin and falls back to its stored or default docs-server origin only when `server` is absent.

### Sidecars stay canonical files in the docs repository

- Decision: Canvas and sequence documents are sidecar files in the docs tree — `.canvas.json` under an `assets/canvases/` segment — confined and served by docs-server; Studio drafts stay separate, and opening a project board never creates a second authoritative copy in an engine-local store.

- Why: One canonical home keeps hash preconditions, undo, and reference indexing meaningful. Rejected: storing project content in engine-local draft stores, which would fork authority.

- Applies to: `packages/docs-server/src/canvas-sidecar.ts`, `packages/docs-server/src/sequence-sidecar.ts`, docs trees — every future sidecar kind keeps its canonical file in the repository.
