The browser-only React package that turns validated documents into reading, editing, peeking, and annotation surfaces, with hosts supplying data access, navigation, persistence callbacks, and embed implementations. Source: `packages/docs-viewer`.

## Governed By

Editor design — the interaction and presentation rules the package implements.

Block vocabulary — the block definitions each renderer realizes.

## Decisions

### Model-only dependency; host actions leave through seams

- Decision: The package's only workspace dependency is docs-model; it imports no docs-index, docs-server, docs-workbench, filesystem, SQLite, or external engine code. Every host-dependent action — data reads, navigation, persistence, locks, uploads, canvas and sequence embeds — enters or leaves through the `DocsClientProvider` seams and typed callbacks in `packages/docs-viewer/src/client.tsx`.

- Why: Browser purity in both directions keeps the format dependency-pure and the viewer liftable into an arbitrary React host. Rejected: importing transport, storage, or engines directly, which would weld the viewer to one host.

- Applies to: `packages/docs-viewer` — every future surface and capability; host-app imports are enforced by `import-boundaries.test.ts`.

### The editor emits operations, never bytes

- Decision: The editor produces `DocOp[]` batches by identity diff — `pmToDoc`/`diffToOps` in `packages/docs-viewer/src/editor/core/convert.ts` — and hands them to the host through the single `onApplyOps` callback. It never constructs requests, writes documents, or learns URLs, expected-hash envelopes, disk, undo storage, or event delivery.

- Why: A direct write would cross the host boundary and bypass the mutation authority's hash, validation, undo, and event guarantees. Rejected: editor-owned persistence.

- Applies to: `packages/docs-viewer/src/editor` — every future editing surface and flush trigger converges on the same conversion, diff, and `onApplyOps` boundary.

### Renderer components mirror model component ownership

- Decision: Each model component has a same-named folder under `packages/docs-viewer/src/components` owning its read descriptor and its `editor-nodes.ts` exports; the rich-text family subdivides one file per type inside its folder, and `linked-panels` is the explicit shared primitive layer. `packages/docs-viewer/src/__tests__/component-mirror.test.ts` enforces exact folder parity with docs-model's `ALL_COMPONENTS` in both directions, the descriptor registry closes over `DOC_BLOCK_TYPES`, and `editor-nodes-sync.test.ts` pins the node/block mappings. A new block component adds its viewer folder, descriptor, and node exports to pass.

- Why: Folder parity and registry closure prevent a model component or block type from silently becoming unreadable, and keep the central literals reviewable while the tests stop either side from drifting. Rejected: one central renderers file, which hides ownership and breaks the mirror.

- Applies to: `packages/docs-viewer/src/components`, `packages/docs-viewer/src/render/block-registry.ts`, the two parity tests — every future block component.
