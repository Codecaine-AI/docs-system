Canvas and Sequence are independent projects mounted in the docs-system repository as git submodules. The docs system consumes their document schemas, agent-operation descriptors, and renderers, and integrates with their standalone authoring applications without owning those implementations. This page describes the boundary mechanics, with Canvas as the complete integration and Sequence as the parallel but narrower case.

## Why They Live Under external/, Not packages/

> **Boundary: The layout makes ownership literal** — Canvas and Sequence have their own repositories, workspaces, package surfaces, and application code. Mounting them under `external/` records that the docs system supports them but does not own them. Moving either project into `packages/` would falsely assign its engine and editor to the docs-system package graph.

## Project Shape

```
external/
└── canvas/
    └── packages/
        ├── canvas/
        │   └── src/
        │       ├── InteractiveCanvasEditor.tsx  # The mutation-capable editor used by Studio.
        │       ├── InteractiveCanvasViewer.tsx  # The read-only diagram surface used by embeds.
        │       ├── actions.ts  # The engine mutation vocabulary shared by interactive and agent paths.
        │       ├── agent-schema.ts  # The narrow TypeBox operation surface imported by docs-model.
        │       ├── geometry.ts  # Pure geometry reused by server-side canvas operations.
        │       ├── interaction.ts  # The pointer-interaction state machine.
        │       └── schema.ts  # Canvas document types and the full untrusted-input validator.
        └── studio/
            └── src/
                ├── App.tsx  # Standalone board selection, deep-link handling, and editor composition.
                ├── board-store.ts  # Local Studio drafts, separate from docs-repository project boards.
                └── project-store.ts  # Docs-server project-board listing, loading, validation, and hash-guarded save.
```

The submodule identities live in `.gitmodules`. The root `package.json` admits only `external/canvas/packages/*` and `external/sequence/packages/*` into the Bun workspace. Their inner packages resolve for consumers, while each neighboring project retains its own workspace root and tooling.

## The Canvas Integration Surface

**Canvas seams**

```
[query] canvas block reference() -> an external canvas identity and optional crop  # doc.json stores canvasId or src plus optional view and title; engine state stays in the canvas document.
canvas.*() -> a request for the canvas authority  # docs-model lifts the external agent-schema descriptors into forwarded component actions.
[query] GET /api/canvas?src=() -> canvas_path, content_hash, canvas  # Reads one docs-root-relative sidecar and returns its bytes hash with the parsed payload.
PUT /api/canvas() -> the new content_hash or a 409 conflict  # Saves an existing sidecar with original_hash conflict protection; Canvas Studio uses the src-rooted form.
[query] DocsClientProvider.canvasEmbed() -> a host-owned React embed  # The viewer asks the host to render a canonicalized canvas reference without importing the engine.
Canvas Studio ?src=&server=() -> the standalone canvas editor  # Studio can open a repository sidecar directly; server is optional and otherwise comes from persisted or default configuration.
```

## Where the Boundary Is Crossed

- docs-model — The Format

  - `packages/docs-model/src/components/canvas/actions/lift.ts` imports only the external `agent-schema` descriptors and marks the resulting actions for the canvas authority. The model owns the reference block, not the canvas document or renderer.

- docs-server — the Mutation Authority

  - The server is an allowed engine consumer. It resolves and confines sidecars, serves whole documents, forwards doc-level canvas actions into typed patches, validates mutation results, applies hash and draft-lock checks, writes atomically, and records undo state.

- docs-viewer — rendering and editing

  - `packages/docs-viewer/src/client.tsx` defines the `canvasEmbed` slot. `packages/docs-viewer/src/render/DocBlockRenderer.tsx` canonicalizes bundle-relative sources and calls that slot. The viewer has no Canvas package dependency.

## Sidecar Resolution and Validation

Canvas sidecars remain canonical files in the docs repository. `packages/docs-server/src/confine.ts` accepts only safe `.canvas.json` paths under an `assets/canvases/` segment, confines reads to the docs root, and canonicalizes existing ancestors before writes to reject symlink escapes. Bundle-relative references become docs-root-relative before the host fetches them.

> **Validation boundary: Canvas uses two validation depths** — `packages/docs-server/src/canvas-sidecar.ts` applies a lightweight structural gate on general sidecar reads and whole-document saves. Typed agent reads and patches in `packages/docs-server/src/agent-tools.ts` run the full external validator before use and again after mutation. The workbench embed and Canvas Studio also run the full validator after loading; the general `PUT /api/canvas` server path does not.

## Viewer Injection and Studio Handoff

The workbench supplies `StandaloneCanvasEmbed` through `DocsClientProvider` in `packages/docs-workbench/web/src/shell/App.tsx`. The adapter in `packages/docs-workbench/web/src/pages/CanvasEmbed.tsx` loads the sidecar through the host data layer, validates it with the Canvas package, and passes it to `InteractiveCanvasViewer`. Read and annotation surfaces stay mutation-free; edit mode opts into the separate Studio action. Canvas and Media owns the presentation and interaction contract.

Authoring mode in `packages/docs-workbench/web/src/pages/DocPage.tsx` enables an Edit in Canvas action. The action opens a new tab so the docs page retains its position and in-progress document state, and passes the canonical docs-root-relative sidecar as `?src=`. Canvas Studio opens that project board directly rather than copying it into its local draft store.

> **Integration constraint: The workbench deep link sends src, not server** — Canvas Studio accepts both `?src=` and optional `?server=` in `external/canvas/packages/studio/src/App.tsx`, but the current workbench URL supplies only `src`. Studio therefore uses its stored docs-server origin or the `http://localhost:4803` default. `external/canvas/packages/studio/src/project-store.ts` lists and loads boards from that server, saves with the loaded `content_hash` as `original_hash`, and turns a 409 into an explicit reload conflict.

## The Sequence Neighbor

Sequence follows the same ownership and injection pattern. It is a separate submodule with inner workspace packages; docs-model lifts only `@codecaine-ai/sequence/agent-schema`; docs-viewer exposes a `sequenceEmbed` slot; and the workbench adapter loads, validates, and renders `SequenceViewer`. Unlike Canvas, `packages/docs-server/src/sequence-sidecar.ts` runs the full Sequence validator on every sidecar read and write.

> **Current difference: Sequence Studio has no project-board handoff** — The Sequence Studio persists local drafts through `external/sequence/packages/studio/src/draft-store.ts`. It does not implement Canvas Studio's docs-server board listing, `?src=` deep link, or hash-guarded save-back flow.

## Boundary Invariants

- **Types and operation schemas cross the pure-model boundary; the engines do not.**

  - `import-boundaries.test.ts` restricts docs-model imports to the Canvas and Sequence `agent-schema` leaves.

- **The reusable viewer never imports either engine.**

  - Hosts inject Canvas and Sequence components through provider slots, so another host may supply different loaders or renderers.

- **Viewer injection never grants mutation authority.**

  - Read surfaces receive validated documents. Canvas mutation routes through docs-server typed patches or a separate Studio save to the canonical sidecar.

- **Project boards stay in the docs repository.**

  - Canvas Studio keeps local drafts and server-backed project boards separate; opening a project board does not create a second authoritative copy.

> **Clone caveat: Check for a submodule cycle** — A host repository may embed both docs-system and Canvas directly. `README.md` requires a flat clone followed by targeted submodule initialization when that arrangement would create a recursive cycle.

## Related Files

**Docs-system seam**

- `.gitmodules`

  - Pins the independent Canvas and Sequence repositories under external/.

- `import-boundaries.test.ts`

  - Restricts pure-model imports to each neighboring project's agent-schema leaf.

- `packages/docs-model/src/components/canvas/actions/lift.ts`

  - Lifts external operation descriptors into forwarded docs component actions.

- `packages/docs-viewer/src/client.tsx`

  - Defines the Canvas and Sequence host-injection slots.

- `packages/docs-server/src/canvas-sidecar.ts`

  - Owns general Canvas sidecar loading, structural validation, and whole-document persistence.

**Neighbor implementation**

- `external/canvas/packages/canvas/src/schema.ts`

  - Defines and fully validates the Canvas document.

- `external/canvas/packages/studio/src/project-store.ts`

  - Keeps repository boards on their docs server and saves them with hash preconditions.

- `external/sequence/packages/sequence/src/agent-schema.ts`

  - Defines the narrow Sequence operation and style-patch surface lifted into docs-model.
