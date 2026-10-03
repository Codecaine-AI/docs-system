The runtime-neutral schema authority for `doc.json`: one definition of document state, valid mutations, canonical bytes, discovery metadata, and agent-facing Markdown, shared by the viewer, server, and CLI. Source: `packages/docs-model`.

## Governed By

The data model: the shapes, invariants, block contract, and serialization the package realizes.

Block vocabulary: the block roster and per-family element definitions.

The mutation model: the op algebra, inverses, and undo semantics behind `doc-ops.ts`.

Authoring Lints defines the three layout rules, and Block Widths and Lanes defines the page lanes whose widths the layout module records.

Text Measurement defines the bundled faces, the measuring backends, and the conditions under which a width is exact.

## Decisions

### One Format Crosses Three Runtimes

- **Decision**

  - The package stays free of React, TipTap, DOM, document filesystem, network, and host application code.

  - Its schema, operation, serialization, and Markdown contracts stay in memory.

- **Why**

  - The browser viewer, Bun server, and CLI consume one definition. Moving any runtime dependency into the model would make the shared contract unusable in at least one consumer.

  - Per-runtime copies of the format were rejected.

- **Applies to**

  - The rule covers every current and future module in `packages/docs-model/src`. `import-boundaries.test.ts` enforces it.

### Format contracts live in fixed authority modules

- Decision: Everything the data model defines is defined in this package, one authority module per contract: `src/doc-schema.ts` owns the envelope, full-document validation, traversal order, and the canonical serializer; `src/doc-ops.ts` owns the typed operation kernel and inverses; `src/annotations-schema.ts` owns the sidecar schema; `src/discovery.ts` owns agent discovery; and `src/project-markdown.ts` with `src/markdown-to-delta.ts` and `src/delta-markdown.ts` own the agent-facing text forms. Consumers call these modules; they do not reimplement validation or serialization.

- Why: Canonical bytes and hashes only work if every write path round-trips through one validator and one serializer. Scattering those contracts across consumers was rejected because a second implementation drifts and pollutes diffs and hashes.

- Applies to: `packages/docs-model/src`. A new format contract lands here as its own module, never inside a consumer package.

### One component, one vertical bundle folder

- Decision: Each block component is a vertical bundle folder under `packages/docs-model/src/components` holding `manifest.ts` (ownership), `state.ts` (a closed TypeBox schema over props), `actions/` (typed actions), and `agent-view.ts` (state to Markdown). Shared primitives live in `components/shared/`.

- Why: State, update logic, and the agent render travel together, so adding a type touches one bundle per home instead of scattered files. Rejected: role-grouped layout (all schemas together, all actions together), which spreads one component across the tree.

- Applies to: `packages/docs-model/src/components/*`. Every future block component follows the same bundle shape.

### Registration Is an Explicit Allow-List

- **Decision**

  - `packages/docs-model/src/components/index.ts` keeps the `ALL_COMPONENTS` allow-list and folds it into the type, action, state, and agent-view registries.

  - `packages/docs-model/src/components/checks.ts` runs at module load and throws on ownership, schema, action, or authority drift.

  - A new component registers by adding its bundle to `ALL_COMPONENTS` and its types to `DOC_BLOCK_TYPES`. Discovery then serves it to every surface.

- **Why**

  - Controlled extensibility keeps the block set closed and the allow-list a deliberate review point.

  - Run-time plug-in discovery and filesystem-scan auto-registration were rejected.

- **Applies to**

  - The rule covers `index.ts` and `checks.ts`, and every future component and block type.

### Per-Component Typed-Action Modules

- **Decision**

  - A component's typed actions live one file per action under its bundle's `actions/` directory, keyed `<type>.<verb>` and built with `defineComponentAction`.

  - A local action's pure `apply` returns a props patch.

  - Components whose authority is external (canvas and sequence) lift their descriptors from the external package's `agent-schema` in an `actions/lift.ts`. They mark them `forward: { authority }` with no local apply.

  - Named actions exist only for mutations with positional or keyed collection semantics. Scalar props and block text change through `updateBlock`.

- **Why**

  - Actions as data on one registry let any surface list and invoke them, and they make inverses and undo free.

  - Forwarding keeps external schema truth in its owning package instead of redefining it here.

  - Imperative update methods on renderers and local copies of external schemas were rejected.

- **Applies to**

  - The rule covers `packages/docs-model/src/components/*/actions` and every new block action, local or forwarded, in any future component.

### Layout Facts Have One Home

- **Decision**

  - `packages/docs-model/src/layout/metrics.ts` holds the numbers the docs viewer lays blocks out with at stock theme settings. Its lane caps are 675px for text, 990px for code, and 1100px for wide blocks.

  - `block-width.ts` gives each block its width on screen and in PDF export.

  - `inline-measure.ts` measures inline text, bold, links, and code chips in the bundled fonts.

  - `table-columns.ts` copies the viewer's table cell typing and column sizing.

  - The three layout rules are `layout.code-line-width`, `layout.table-fit`, and `layout.stack-detail-fit`. `rules.ts` lists them, and `lint/index.ts` adds them to `lintRules`.

  - Other packages import the module as `@codecaine-ai/docs-model/layout`. PDF export reads `DOCS_DEFAULT_FONTS` from it to set the print fonts.

- **Why**

  - One home keeps every layout rule on the widths the viewer paints, so no rule carries its own copy of a lane width.

  - The viewer and the workbench cannot import the constants, because Tailwind generates CSS only for literal class strings. `packages/docs-viewer/src/__tests__/layout-metrics-drift.test.ts` and `packages/docs-workbench/web/src/__tests__/layout-metrics-drift.test.ts` fail when their copy and this one differ.

- **Applies to**

  - The rule covers `packages/docs-model/src/layout` and every future layout rule. A new stock width joins `metrics.ts` together with a drift-test assertion.

### Text Measuring Goes Through the Core Entry

- **Decision**

  - docs-model imports `@codecaine-ai/text-measure` only through its core entry, which is synchronous and has no WASM or `node:*` imports. The package lives in the canvas repository, in `canvas/packages/text-measure`.

  - Hosts choose the backend. The docs MCP service, docs-cli, and docs-server load HarfBuzz through the `/headless` entry, and the workbench loads the bundled fonts through `/browser`.

  - Without an exact backend, the layout rules run on the default `table` backend and call their widths approximate.

- **Why**

  - The core entry runs in the browser viewer, the Bun server, and the CLI, so the package stays usable in all three runtimes.

  - The `/headless` entry reads font files with `node:fs`, and `/browser` needs a DOM.

- **Applies to**

  - `import-boundaries.test.ts` enforces the rule for every module in `packages/docs-model/src`. It also rejects direct imports of Pretext and harfbuzzjs.
