Structural decisions for the workbench composition host, the shell that binds the viewer and server into a running app. Source: `packages/docs-workbench`.

## Governed By

Editor design defines the surfaces the host composes.

Editing Interactions defines save, conflict, and reload behavior.

The mutation model defines the write contract behind every host callback.

Reading Surface defines PDF selection, format, and printed-content behavior.

## Decisions

### The workbench is a thin composition host

- Decision: Capabilities live in docs-viewer and docs-server; the workbench composes them and supplies the callbacks, data, persistence, locks, uploads, navigation, embeds, without defining block rendering, editor semantics, or write rules of its own.

- Why: Reimplementing interactions in the host was rejected. A second implementation drifts from the packages and breaks every other host that embeds them.

- Applies to: `packages/docs-workbench`. Every future host page and shell feature stays composition glue.

### Editor-owned input stays inside the viewer

- Decision: Link authoring, keyboard behavior, paste conversion, and slash insertion live inside docs-viewer's editor extensions; the workbench receives document updates through the host callbacks rather than intercepting input.

- Why: One interaction implementation serves every host; host-side input handling was rejected because it duplicates editor behavior per host.

- Applies to: `packages/docs-viewer/src/editor`, `packages/docs-workbench/web/src/pages`. Future input features land as viewer extensions.

### No parallel block catalog

- Decision: The workbench maintains no block reference of its own; block definitions and examples belong to Block vocabulary.

- Why: A host-local catalog was rejected. It drifts from the model registry and the design vocabulary the moment a block changes.

- Applies to: `packages/docs-workbench`. Future block UI reads the model registries and design docs, never a host copy.

### Static export is read-only by construction

- Decision: The static export ships no write endpoints, the exported artifact contains no mutation surface, and the build-time data adapter in `packages/docs-workbench/web/src/data/api.ts`, the reduced `DocsClient` wiring in `packages/docs-workbench/web/src/data/client.ts`, and the page selection over `packages/docs-workbench/src/export.ts` must agree on the same capability set.

- Why: Runtime capability flags alone were rejected. An export that merely hides write UI but still ships write paths can drift; omitting the endpoints makes the read-only guarantee structural.

### PDF Export Reuses the Viewer and an Offline Printer

- Decision: `ExportDialog.tsx` selects saved pages, requests one PDF per page, and assembles the final download. `pdf-document.tsx` reuses DocBlockRenderer with print-specific code and HTML output, static diagram embeds, and inline image assets.

- Why: Reusing the viewer retains typed block rendering while print-specific transformations handle pagination and content that cannot remain interactive. pdf-lib joins PDFs and adds combined page numbers. fflate packages per-page PDFs under the paths computed by `pdf-selection.ts`.

- Applies to: Future export formats under `packages/docs-workbench/web/src/lib` and the export dialog must use saved bundles without mutating source documents.

### PDF Rendering Belongs to the Live Host

- Decision: `pdf-export.ts` handles POST /api/export-pdf in the standalone host and in `managed-runtime.ts` for central project routes. It launches an isolated Chromium context with author JavaScript, service workers, and network requests disabled.

- Why: Browser printing retains selectable text and browser layout while keeping credentials and project filesystem reads out of the printer. The client supplies self-contained HTML. Playwright resolves at runtime because its browser resources cannot be included in the central service's single-file bundle.

- Applies to: Both route mounts use the same handler. It bounds each request to 20 MiB, allows one active render per runtime, closes the browser after completion, and enforces a 60-second post-launch deadline. Embedded HTML frames above 970 CSS pixels fail before printing.

- Applies to: `packages/docs-workbench/src/export.ts`, `packages/docs-workbench/web/src/data`. Future capability additions must be wired through the same adapter and capability agreement.
