The runtime-neutral schema authority for `doc.json` — one definition of document state, valid mutations, canonical bytes, discovery metadata, and agent-facing Markdown, shared by the viewer, server, and CLI. Source: `packages/docs-model`.

## Governed By

The data model — the shapes, invariants, block contract, and serialization the package realizes.

Block vocabulary — the block roster and per-family element definitions.

The mutation model — the op algebra, inverses, and undo semantics behind `doc-ops.ts`.

## Decisions

### One format crosses three runtimes

- Decision: The package stays free of React, TipTap, DOM, document filesystem, network, and host application code; its schema, operation, serialization, and Markdown contracts stay in memory.

- Why: The browser viewer, Bun server, and CLI consume one definition; moving any runtime dependency into the model would make the shared contract unusable in at least one consumer. Rejected: per-runtime copies of the format.

- Applies to: `packages/docs-model/src` — every future module in the package; enforced by `import-boundaries.test.ts`.

### Format contracts live in fixed authority modules

- Decision: Everything the data model defines is defined in this package, one authority module per contract: `src/doc-schema.ts` owns the envelope, full-document validation, traversal order, and the canonical serializer; `src/doc-ops.ts` owns the typed operation kernel and inverses; `src/annotations-schema.ts` owns the sidecar schema; `src/discovery.ts` owns agent discovery; and `src/project-markdown.ts` with `src/markdown-to-delta.ts` and `src/delta-markdown.ts` own the agent-facing text forms. Consumers call these modules; they do not reimplement validation or serialization.

- Why: Canonical bytes and hashes only work if every write path round-trips through one validator and one serializer; scattering those contracts across consumers was rejected because a second implementation drifts and pollutes diffs and hashes.

- Applies to: `packages/docs-model/src` — a new format contract lands here as its own module, never inside a consumer package.

### One component, one vertical bundle folder

- Decision: Each block component is a vertical bundle folder under `packages/docs-model/src/components` holding `manifest.ts` (ownership), `state.ts` (a closed TypeBox schema over props), `actions/` (typed actions), and `agent-view.ts` (state to Markdown); shared primitives live in `components/shared/`.

- Why: State, update logic, and the agent render travel together, so adding a type touches one bundle per home instead of scattered files. Rejected: role-grouped layout (all schemas together, all actions together), which spreads one component across the tree.

- Applies to: `packages/docs-model/src/components/*` — every future block component follows the same bundle shape.

### Registration is an explicit allow-list

- Decision: `src/components/index.ts` keeps the `ALL_COMPONENTS` allow-list and folds it into the type, action, state, and agent-view registries; `src/components/checks.ts` runs at module load and throws on ownership, schema, action, or authority drift. A new component registers by adding its bundle to `ALL_COMPONENTS` and its types to `DOC_BLOCK_TYPES` — discovery then serves it to every surface.

- Why: Controlled extensibility keeps the block set closed and the allow-list a deliberate review point. Rejected: run-time plug-in discovery and filesystem-scan auto-registration.

- Applies to: `packages/docs-model/src/components/index.ts`, `packages/docs-model/src/components/checks.ts` — every future component and block type.

### Per-component typed-action modules

- Decision: A component's typed actions live one file per action under its bundle's `actions/` directory, keyed `<type>.<verb>` and built with `defineComponentAction`; a local action's pure `apply` returns a props patch. Components whose authority is external — canvas, sequence — lift their descriptors from the external package's `agent-schema` in an `actions/lift.ts` and mark them `forward: { authority }` with no local apply. Named actions exist only for mutations with positional or keyed collection semantics; scalar props and block text change through `updateBlock`.

- Why: Actions as data on one registry let any surface list and invoke them and make inverses — and undo — free; forwarding keeps external schema truth in its owning package instead of redefining it here. Rejected: imperative update methods on renderers, and duplicating external schemas locally.

- Applies to: `packages/docs-model/src/components/*/actions` — every new block action, local or forwarded, in any future component.
