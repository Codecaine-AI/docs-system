@codecaine-ai/docs-viewer is the browser-only React package that turns validated DocDocument values into reading, editing, peeking, and annotation surfaces. It depends on docs-model — The Format for data and operations while hosts supply data access, navigation, persistence callbacks, and embed implementations. The package can therefore render without a server and gain host capabilities without learning transport or storage policy. Interaction and presentation rules live in Editor design; this page covers the source structure and data flow that implement them.

## The Package Cut

> **Forcing constraint: Browser purity in both directions** — The model must remain usable by server and CLI code without React or TipTap, so rendering and editing cannot live in docs-model. In the other direction, docs-viewer has only docs-model as a workspace dependency and imports no filesystem, SQLite, Elysia, server, or workbench implementation. The split is forced because it keeps the format dependency-pure and the browser package liftable into an arbitrary React host.

The dependency direction is visible in `packages/docs-viewer/package.json`. The reverse constraint is enforced by `import-boundaries.test.ts`, which keeps docs-model free of React and TipTap and rejects package imports into host application code. The viewer manifest excludes docs-server and docs-workbench; no dedicated test enumerates those two package names.

## Module Map

```
packages/
└── docs-viewer/
    └── src/
        ├── annotate/  # Stable target resolution and host-callback annotation workflows.
        ├── components/  # Component-mirrored descriptors, editor nodes, and component-specific renderers.
        ├── editor/
        │   ├── core/  # The ProseMirror schema and doc.json conversion/diff boundary.
        │   ├── input/  # Schema-aware input rules, paste, keymap, and video insertion.
        │   ├── menus/  # Slash commands, links, and inline references.
        │   ├── views/  # React NodeViews and ProseMirror-owned selection and drag extensions.
        │   └── DocEditor.tsx  # TipTap composition, dirty state, flush scheduling, locks, and save reconciliation.
        ├── peek/  # Cross-document peek state, effects, and read-only panel.
        ├── render/  # Document traversal, descriptor registry, delta rendering, and pure bundle-path helpers.
        ├── ui/  # Viewer-local UI primitives shared by product surfaces.
        ├── client.tsx  # Host data and embed capability injection.
        └── index.ts  # The root barrel for the embeddable viewer product.
```

## The Public Surface

The public surface is a set of seams, not a catalogue of React components. Values enter through the provider and render props; host-dependent actions leave through callbacks. The export map in `packages/docs-viewer/package.json` exposes the root barrel plus stable subpaths for the renderer, editor, peek panel, annotation layer, and pure bundle helpers.

**Host Seams**

```
[query] DocsClient.getDocsTree(projectId: string) -> Promise<{ tree: DocsTreeNode[] }>  # Loads reference-picker data without exposing its transport.
[query] DocsClient.getDocBundle?(projectId: string, path: string) -> Promise<{ doc: unknown; documentPath?: string } | null>  # Optional cross-document read used by side peek; the viewer validates the returned payload.
DocsClient draft-lock methods(projectId: string, path: string, kind: DraftLockKind, sessionId: string) -> Promise<AcquireDraftLockResult> or Promise<void>  # Optional acquire, heartbeat, and release capability for advisory edit coordination.
[query] canvasEmbed / sequenceEmbed(id, source identity, title, host context: embed props) -> ReactNode  # Provider-injected React slots for external visual engines; missing slots leave those engine surfaces unavailable.
[event] DocEditor.onApplyOps(ops: DocOp[]) -> Promise<DocBlockSaveResult>  # Emits the format-level mutation batch; the host chooses how and where to apply it.
[event] Navigation and annotation callbacks(reference, target, or annotation action: typed callback input) -> host-defined effect  # Report intent outward so routing and annotation persistence remain host policy.
```

## Capability Degradation

- No provider

  - `DocBlockRenderer` still renders a supplied document. Reference discovery has no entries, cross-document peek becomes host navigation, and canvas or sequence blocks use their unavailable fallbacks.

- Read-only client

  - A host can implement the read methods and mount `DocBlockRenderer` without exposing a write path. The renderer contains no edit affordances; editing appears only when the host separately mounts `DocEditor` and supplies its required `onApplyOps` callback. Omitting draft-lock methods merely skips advisory lock management and must not be treated as authorization.

- Partial capabilities

  - Missing `getDocBundle` downgrades a peek intent to `onNavigate`. Missing `uploadAsset` leaves local video-file drops to the default browser and ProseMirror behavior. Optional annotation callbacks suppress only the actions they would perform.

The embed boundary follows the same capability rule. `DocsClientProvider` in `packages/docs-viewer/src/client.tsx` injects canvas and sequence components for the read renderer. `DocBlockRenderer` canonicalizes bundle-relative sources and passes stable block identity, host context, view selection, and optional object-selection callbacks into the slot. `DocEditor` accepts equivalent render functions as props and threads them through its NodeView context. The viewer never imports either external engine. The designed behavior of these embedded surfaces lives in Canvas and Media.

## Descriptor-Driven Rendering

- One traversal, one registry

  - `packages/docs-viewer/src/render/DocBlockRenderer.tsx` starts at the root container, renders its ordered children, and resolves each block through `packages/docs-viewer/src/render/block-registry.ts`. Descriptors receive a common context for text, child recursion, Markdown, assets, and external embeds, so block implementations do not acquire host knowledge.

## Component-Mirrored Ownership

- Descriptor and node colocation

  - Each component-named folder under `packages/docs-viewer/src/components` owns its read descriptor and its ProseMirror node exports. Rich text subdivides within its component folder, while `linked-panels` is the explicit shared primitive layer rather than a model component.

- Folder and descriptor closure

  - `packages/docs-viewer/src/__tests__/component-mirror.test.ts` compares the viewer folder names with docs-model's `ALL_COMPONENTS` in both missing and unexpected directions. The descriptor registry separately refuses missing, extra, or duplicate entries against `DOC_BLOCK_TYPES`.

- Editor-map parity

  - `packages/docs-viewer/src/__tests__/editor-nodes-sync.test.ts` flattens every component's `editor-nodes.ts` exports, checks that `NODE_TYPE_TO_BLOCK_TYPE` has exactly those keys, pins the schema construction order, checks the complete inverse literal, and round-trips every entry through `BLOCK_TYPE_TO_NODE_TYPE`. The central literals remain reviewable while the test prevents either side from drifting.

## The Editor Pipeline

`packages/docs-viewer/src/editor/DocEditor.tsx` is the composition point for TipTap, the component node schema, ProseMirror plugins, and the save state machine. It keeps the editor's mutable representation separate from the normalized document and crosses that boundary only through `packages/docs-viewer/src/editor/core/convert.ts`.

1. Seed the ProseMirror document

  - The conversion boundary preserves stable block identities and typed props as document blocks enter the editor. It assigns identities to new blocks on the return path.

2. Edit through the component schema

  - The schema distinguishes inline-editable blocks from structured atom blocks and preserves ordered child relationships.

3. Reconstruct canonical state

  - The conversion boundary reconstructs a complete DocDocument while preserving surviving identities and assigning collision-free ids to inserted blocks.

4. Diff by identity

  - The conversion boundary compares the edited document with the current host baseline by block identity. Content changes produce block updates, while structural changes produce insertion, deletion, or move operations. A block-type change receives a new identity.

5. Hand the batch to the host

  - `onApplyOps` is the single write handoff. The host may return the authoritative post-save document or a stale/error result; docs-viewer does not construct a request.

React NodeViews do not create a second rendering system. `packages/docs-viewer/src/editor/views/node-views.tsx` reconstructs atom blocks from ProseMirror attrs and delegates them to the same descriptors used by the read renderer. Code and structured table supply specialized editable NodeViews, while the editor context carries the host's embed and asset resolvers into the ProseMirror-owned subtree.

Every flush reaches the same conversion, diff, and `onApplyOps` boundary. Explicit and automatic triggers share that path. Edits that arrive during an in-flight save remain dirty and schedule another batch; stale results and lock conflicts pause automatic retries.

> **Decision: Emit operations instead of writing documents** — The editor understands the format, so it emits DocOp batches. It does not understand request URLs, expected-hash envelopes, disk, undo storage, reindexing, or event delivery. It carries an opaque id for the optional draft-lock capability but does not own server session policy. A direct document write here would cross the host boundary and bypass the mutation authority that supplies those guarantees. The save pipeline: keystroke to disk owns the end-to-end write contract.

## Save Reconciliation

A successful save that returns a document makes that document the editor's next diff baseline. When the host passes the same object back as the `document` prop, the editor preserves its current ProseMirror state instead of reseeding it. The save therefore keeps cursor and selection state intact.

A semantically identical refetch with a new object identity also advances the baseline without reseeding. A genuinely different external document does reseed the editor, clears dirty state, and unpauses a stale-save error. `packages/docs-viewer/src/editor/__tests__/DocEditor.test.tsx` pins the identity-preserving round trip and the external-document control case.

## Viewer-Owned Product Logic

- Targeting and annotation workflows

  - `packages/docs-viewer/src/annotate` resolves DOM selections to stable block, text-range, visual-point, and canvas-object targets. Components collect and display annotation state, but callbacks leave creation, resolution, agent runs, undo, and persistence to the host.

- Cross-document peek

  - `packages/docs-viewer/src/peek` keeps a DOM-free reducer separate from event subscription and loading effects. It fetches through optional `DocsClient.getDocBundle`, validates unknown payloads through docs-model, drops stale responses, and renders the target through `DocBlockRenderer`.

## Invariants and Firewalls

- Model-only workspace dependency

  - The package may know `@codecaine-ai/docs-model` schemas, references, annotations, and operations. It must not import docs-index, docs-server, docs-workbench, or an external canvas or sequence engine.

- No hidden writer

  - Rendering, peeking, annotation, and editing code performs no repository or backend mutation directly. Every host-dependent action is an injected method, component, resolver, uploader, or callback.

- Stable identity and closed parity

  - Surviving blocks keep their ids across `DocDocument` and ProseMirror representations. Folder parity and descriptor closure prevent a model component or block type from silently becoming unreadable. Editor-node parity prevents a known component node export or central node mapping from drifting in either direction.

## Related Files

### Runtime

- `packages/docs-viewer/src/client.tsx`

  - The host client, optional capabilities, embed slots, provider, and hooks.

- `packages/docs-viewer/src/render/DocBlockRenderer.tsx`

  - The read-only traversal and provider-injected embed adaptation.

- `packages/docs-viewer/src/render/block-registry.ts`

  - The folded descriptor registry and block-type closure check.

- `packages/docs-viewer/src/editor/DocEditor.tsx`

  - The mounted editor, flush triggers, advisory locks, and save reconciliation.

- `packages/docs-viewer/src/editor/core/convert.ts`

  - The DocDocument ↔ ProseMirror bridge and identity-based DocOp diff.

### Schema and Guards

- `packages/docs-viewer/src/editor/core/schema.ts`

  - The component node lists and bidirectional node/block mappings.

- `packages/docs-viewer/src/editor/views/node-views.tsx`

  - The descriptor-delegating atom NodeViews and specialized editor views.

- `packages/docs-viewer/src/__tests__/component-mirror.test.ts`

  - The exact viewer-folder to model-component mirror.

- `packages/docs-viewer/src/__tests__/editor-nodes-sync.test.ts`

  - The exact component export, construction-order, and bidirectional map parity.

- `import-boundaries.test.ts`

  - The host-app import firewall and React-free model guard.
