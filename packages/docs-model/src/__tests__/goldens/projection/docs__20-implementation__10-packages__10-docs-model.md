`@codecaine-ai/docs-model` is the runtime-neutral schema authority for `doc.json`. The browser viewer, Bun server, and CLI consume one definition of document state, valid mutations, canonical bytes, discovery metadata, and agent-facing Markdown. The package owns those semantics without owning storage, transport, or UI.

## The Cut

> **Decision: One Format Crosses Three Runtimes** — This package boundary is a forcing constraint. Moving React or TipTap, Bun I/O, or server policy into the model would make the shared contract unusable in at least one of its consumers.

## Module Map

```
packages/
└── docs-model/
    └── src/  # Runtime-neutral document semantics.
        ├── __tests__/  # Schema, op, serialization, rendering, and integration contracts.
        ├── components/  # Component bundle contracts and folded registries.
        │   ├── canvas/  # Canvas reference state and lifted forwarded actions.
        │   ├── code/  # Code state, line-annotation actions, and agent view.
        │   ├── file-tree/  # Path-entry collection state and actions.
        │   ├── interaction-surface/  # Operation-signature collection state and actions.
        │   ├── rich-text/  # Flow text, callouts, dividers, and media.
        │   ├── sequence/  # Sequence reference state and lifted forwarded actions.
        │   ├── shared/  # Shared field and deterministic JSON-line primitives.
        │   ├── state-shape/  # Recursive field-tree state and actions.
        │   ├── structured-table/  # Canonical cells plus row and column actions.
        │   ├── waterfall/  # Recursive process-step state, actions, and text grammar.
        │   ├── checks.ts  # Module-load ownership, schema, action, and authority checks.
        │   ├── index.ts  # Explicit bundle allow-list and derived registries.
        │   ├── types.ts  # Manifest, state, action, agent-view, and bundle interfaces.
        │   └── validate.ts  # Static state-schema registry for strict writes.
        ├── annotations-schema.ts  # Annotation sidecar schema and dangling-target detection.
        ├── delta-markdown.ts  # Delta spans to inline Markdown and plain text.
        ├── discovery.ts  # Agent-facing schema, operation, component, and action discovery.
        ├── doc-ops.ts  # Typed mutation kernel, batching, and exact inverses.
        ├── doc-schema.ts  # Document authority, full-document validation, traversal order, and canonical serialization.
        ├── index.ts  # Root re-export surface.
        ├── markdown-to-delta.ts  # Inline Markdown back to delta spans and typed references.
        ├── project-markdown.ts  # Pure document-to-Markdown render.
        └── spectre-ref.ts  # Shared typed document and source references.
```

## Public Surface

`packages/docs-model/package.json` exposes the root barrel plus focused schema, operation, annotation, Markdown, and reference subpaths. The root `packages/docs-model/src/index.ts` re-exports the complete runtime-neutral surface.

**Core Exports**

```
[query] validateDocDocument(value: unknown) -> DocValidationResult  # Validate and canonicalize one complete document envelope and normalized block graph.
[query] serializeDocDocument(document: DocDocument) -> string  # Emit stable, canonical doc.json bytes with one trailing newline.
applyOp(doc: DocDocument, op: DocOp, idFactory?: DocIdFactory, options?: { validateProps?: boolean }) -> DocOpResult  # Apply one typed operation without mutating the input and return exact inverse operations.
applyOps(doc: DocDocument, ops: DocOp[], idFactory?: DocIdFactory, options?: { validateProps?: boolean }) -> DocOpResult  # Apply a batch in order and return one inverse unit in undo order.
[query] buildBlocksDiscovery() -> BlocksDiscovery  # Derive the agent-facing operation, component, state, and action catalog from registered bundles.
[query] projectToMarkdown(doc: DocDocument) -> string  # Render a validated in-memory document to agent-facing Markdown without I/O.
[query] inlineToDelta(markdown: string) -> InlineToDeltaResult  # Parse inline Markdown into delta spans and typed internal references.
[query] validateAnnotationsDocument(value: unknown) -> AnnotationsValidationResult  # Validate the annotations.json sidecar independently of doc.json.
```

## Design Inside the Boundary

### Schema Authority

`packages/docs-model/src/doc-schema.ts` is the format authority. It defines schema version 1, the literal canonical block vocabulary, stable ids, the normalized id-keyed block map, ordered child ids, delta spans, and typed document or source references. The implementation realizes the contracts in The data model.

`validateDocDocument` validates the complete document envelope and graph rather than isolated blocks. It rejects mismatched map keys and ids, missing roots, orphan references, shared children, cycles, and unreachable blocks. Reads remain tolerant of component-prop drift, and unknown string block types canonicalize to callouts while preserving their former type as `props.kind`; strict component state belongs to the write boundary.

### Checked Component Registries

`packages/docs-model/src/components/types.ts` defines one vertical `ComponentBundle`: a manifest declares ownership, state definitions close the stored props contract, actions describe structured mutations, and `agentView` renders the family for Markdown. Each component bundle folder under `packages/docs-model/src/components` keeps those responsibilities separate in `manifest.ts`, `state.ts`, `actions/`, and `agent-view.ts`. The rich-text bundle has no named actions because its document props are scalar.

`packages/docs-model/src/components/index.ts` keeps an explicit `ALL_COMPONENTS` allow-list, then folds it into type, action, state, and agent-view lookups. This is controlled extensibility rather than run-time plug-in discovery: a component is locally cohesive, while `DOC_BLOCK_TYPES` and the central allow-list remain deliberate review points. `packages/docs-model/src/components/checks.ts` runs at module load and throws on missing, unknown, or duplicate ownership; missing owned state; open nested object schemas; malformed or duplicate action keys; action/type ownership drift; and unknown forwarded authorities.

`packages/docs-model/src/components/validate.ts` compiles a static state-schema registry for every component-owned block type in the mutation path. `insertBlock` and `updateBlock` validate the resulting props object against its compiled checker, so unknown stored keys fail the closed schema even when an edit only touches text. Action parameter schemas are not required to be closed; local action dispatch ignores and discards stray parameters. `packages/docs-model/src/components/__tests__/schema-over-corpus.test.ts` applies every registered state schema to repository documents, while full-document validation remains a separate structural gate. This split keeps structural reads tolerant while registered mutation checks reject undeclared state.

### Typed Operations and Named Actions

`packages/docs-model/src/doc-ops.ts` owns immutable typed-operation contracts, exact inverse batches, strict state-validation handoff for local component actions, and forwarded descriptors for canvas and sequence. Structural and text operations share one inverse boundary with named local actions. The behavioral contract is specified by The mutation model: ops, inverses, undo.

> **Decision: Named Action Iff Structured-Collection Semantics** — D7 reserves named actions for mutations with positional or keyed collection semantics. Scalar props and block text change through updateBlock. Local collection actions return a props patch; canvas and sequence actions carry external schema truth and forward to their owning authorities.

### Canonical Bytes and Markdown Rendering

`serializeDocDocument` in `packages/docs-model/src/doc-schema.ts` fixes key order at the document, block, span, mark, and reference levels; sorts prop keys; emits blocks in depth-first document order; and adds one trailing newline. Equal in-memory documents therefore produce equal bytes even when their object insertion order differs. `packages/docs-model/src/__tests__/goldens.test.ts` reserializes the fixture and documentation corpus against their exact on-disk bytes. The byte contract is specified by Serialization.

`packages/docs-model/src/project-markdown.ts` owns pure document-to-Markdown rendering and delegates each non-root block to its registered `agentView`. `projectToMarkdown` is pure: it accepts an in-memory document and returns a string without filesystem access. Delta references render as plain labels on this greppable surface, while `packages/docs-model/src/markdown-to-delta.ts` parses edited inline Markdown back into spans and typed references. The two reader-facing forms are defined by Translation layer.

### Annotations Stay Beside the Document

`packages/docs-model/src/annotations-schema.ts` defines the independent `annotations.json` sidecar. Targets name stable document block ids or exactly one canvas object, connection, or region selector. Validation normalizes the sidecar, and `detectDanglingTargets` reports removed targets without re-anchoring them or crashing the document path. Workflow state therefore stays out of canonical `doc.json` bytes.

## Invariants and Firewalls

`import-boundaries.test.ts` enforces the package's import limits. It walks every JavaScript and TypeScript module under `packages/docs-model/src` and inspects static imports, re-exports, dynamic imports, and `require` calls.

- **UI independence**

  - The test rejects imports from `react`, `react-dom`, and `@tiptap/*`. Schema, mutation, and Markdown consumers never inherit the viewer stack.

- **External authority containment**

  - Canvas and sequence imports may cross only through their `agent-schema` leaves. The model lifts typed operation descriptors and forwards them; it never imports either engine.

- **Runtime purity**

  - The package performs no document filesystem, HTTP, or DOM work. Its schema, operation, serialization, and Markdown contracts stay in memory.

- **Identity and tree safety**

  - Updates preserve block ids; split and merge mint non-colliding ids; operations refuse illegal root changes, missing targets, invalid indices, and cycles. Annotations, backlinks, reconciliation, and undo rely on those invariants.

## Dependencies

**Package Boundary**

| Direction | Package or Layer | Relationship |
| --- | --- | --- |
| Depends on | @sinclair/typebox | Defines and compiles runtime state and action schemas. |
| Depends on through a leaf | @codecaine-ai/canvas/agent-schema | Supplies canvas operation descriptors and parameter schemas without the engine. |
| Depends on through a leaf | @codecaine-ai/sequence/agent-schema | Supplies sequence operation descriptors and parameter schemas without the engine. |
| Consumed by | docs-index, docs-server, docs-viewer, docs-workbench, docs-cli | Shares document types, validation, operations, discovery, references, and Markdown rendering across runtime roles. |

## Related Files

- `packages/docs-model/src/doc-schema.ts`

  - Owns the document shape, structural validator, traversal order, and canonical serializer.

- `packages/docs-model/src/doc-ops.ts`

  - Owns pure typed operation application, validation handoff, batching, and inverses.

- `packages/docs-model/src/components/index.ts`

  - Folds the explicit component allow-list into the model's runtime registries.

- `packages/docs-model/src/components/checks.ts`

  - Rejects registry ownership, schema, action, and authority drift at module load.

- `packages/docs-model/src/project-markdown.ts`

  - Walks the normalized tree and delegates agent-facing Markdown to component bundles.

- `import-boundaries.test.ts`

  - Enforces React and TipTap exclusion plus canvas and sequence leaf-only imports.
