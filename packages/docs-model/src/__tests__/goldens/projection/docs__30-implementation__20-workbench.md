Structural decisions for the workbench composition host — the shell that binds the viewer and server into a running app. Source: `packages/docs-workbench`.

## Governed By

Editor design — the surfaces the host composes.

Editing Interactions — the human interaction semantics, including save, conflict, and reload behavior.

The mutation model — the write contract behind every host callback.

## Decisions

### The workbench is a thin composition host

- Decision: Capabilities live in docs-viewer and docs-server; the workbench composes them and supplies the callbacks — data, persistence, locks, uploads, navigation, embeds — without defining block rendering, editor semantics, or write rules of its own.

- Why: Reimplementing interactions in the host was rejected — a second implementation drifts from the packages and breaks every other host that embeds them.

- Applies to: `packages/docs-workbench` — every future host page and shell feature stays composition glue.

### Editor-owned input stays inside the viewer

- Decision: Link authoring, keyboard behavior, paste conversion, and slash insertion live inside docs-viewer's editor extensions; the workbench receives document updates through the host callbacks rather than intercepting input.

- Why: One interaction implementation serves every host; host-side input handling was rejected because it duplicates editor behavior per host.

- Applies to: `packages/docs-viewer/src/editor`, `packages/docs-workbench/web/src/pages` — future input features land as viewer extensions.

### No parallel block catalog

- Decision: The workbench maintains no block reference of its own; block definitions and examples belong to Block vocabulary.

- Why: A host-local catalog was rejected — it drifts from the model registry and the design vocabulary the moment a block changes.

- Applies to: `packages/docs-workbench` — future block UI reads the model registries and design docs, never a host copy.

### Static export is read-only by construction

- Decision: The static export ships no write endpoints — the exported artifact contains no mutation surface — and the build-time data adapter in `packages/docs-workbench/web/src/data/api.ts`, the reduced `DocsClient` wiring in `packages/docs-workbench/web/src/data/client.ts`, and the page selection over `packages/docs-workbench/src/export.ts` must agree on the same capability set.

- Why: Runtime capability flags alone were rejected — an export that merely hides write UI but still ships write paths can drift; omitting the endpoints makes the read-only guarantee structural.

- Applies to: `packages/docs-workbench/src/export.ts`, `packages/docs-workbench/web/src/data` — future capability additions must be wired through the same adapter and capability agreement.
