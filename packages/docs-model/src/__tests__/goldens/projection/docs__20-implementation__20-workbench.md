`docs serve` starts the workbench host over one docs root. The host composes navigation, viewer/editor callbacks, persistence, annotations, live events, and static-export degradation. Human interaction semantics live in Editing Interactions; this page covers the runtime wiring.

## Edit Persistence

`packages/docs-workbench/web/src/pages/DocPage.tsx` mounts the viewer editor and supplies the host callbacks that send typed operations, acquire locks, upload assets, and adopt server results.

- Flush triggers

  - The editor flushes after about 1 second idle with a 5 second maximum wait. `Cmd/Ctrl+S`, blur, tab hiding, mode changes, document navigation, and unmount also request a flush.

- Pipeline handoff

  - Every trigger uses The save pipeline: keystroke to disk: editor state becomes `DocOp[]` and reaches `POST /api/ops` with the expected hash and session id.

- Undo

  - The host sends the latest single-use token to the server's inverse-op ledger. Undo re-enters the same hash-checked mutation authority.

- Remote changes

  - An SSE update reloads a clean editor. A dirty or saving editor suppresses the reload and leaves conflict ownership to the next hash-checked save.

- Editor-owned input

  - Link authoring, keyboard behavior, paste conversion, and slash insertion stay inside docs-viewer editor extensions. The workbench receives document updates rather than reimplementing those interactions.

- Media handoff

  - The viewer recognizes media input; the workbench supplies asset upload and canvas/sequence embed slots. The designed interaction is specified by Canvas and Media.

## Conflict Handling

Two server outcomes pause autosave without discarding the editor draft.

- Stale hash (409)

  - The server rejects an operation batch whose expected hash is stale. The draft remains local until the caller adopts current server state or retries from a current baseline.

- Draft lock (423)

  - Going dirty requests a heartbeat-renewed TTL lock. A lock held by another session pauses saves until the heartbeat observes availability; the expected hash remains the correctness check.

## Annotation Persistence

Annotate mode composes viewer targeting with a workbench-owned annotations sidecar.

- docs-viewer emits stable block targets; the injected canvas embed emits canvas-object targets.

- The workbench stores target, intent, body, and resolution state in `annotations.json` beside the bundle.

- Targets whose block or canvas object is absent remain readable and are marked dangling by resolution logic.

Annotation writes carry the sidecar hash precondition, so concurrent annotation edits fail instead of overwriting one another.

## Block Catalog

The workbench does not maintain a parallel block reference. Definitions and examples live in Block vocabulary.

## Static Export

`docs export` builds the same SPA against a generated data snapshot. Static mode omits mutation callbacks, annotation writes, SSE, theme writes, and server-only asset operations, so viewer capabilities degrade through absent host services.
