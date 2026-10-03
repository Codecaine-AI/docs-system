The React-free mutation authority for one filesystem-backed docs tree: reads, preconditioned writes, undo, locks, and change events, exposed as a TypeScript store and an embeddable route factory. Source: `packages/docs-server`.

## Governed By

The mutation model: op semantics, inverses, undo, and refusal behavior the server's write path realizes.

Serialization: canonical bytes and the content hashes that make write preconditions possible.

Text Measurement defines the measuring backends and the startup rule every docs host follows.

## Decisions

### The Server Is the Sole Mutation Authority

- **Decision**

  - Every accepted write goes through the ops path in `packages/docs-server/src/doc-ops.ts`, behind both `POST /api/ops` and the direct agent tools.

  - The path checks an expected hash and holds a per-path mutex around the whole read-check-apply-write sequence.

  - Each write persists atomically through temp-then-rename, and its inverse ops land in the undo ledger.

  - Undo re-enters the same guarded path. No client, tool, or secondary route writes document bytes.

- **Why**

  - Hash preconditions, validation, undo, and change events stay consistent only when there is exactly one guarded critical section.

  - Client-side writes and parallel write paths were rejected, because a second path would bypass those guarantees and give agents a weaker authority.

- **Applies to**

  - The rule covers `doc-ops.ts`, `routes.ts`, and `agent-tools.ts`. Every future mutation surface converges on this path.

### Embeddable and React-Free

- **Decision**

  - The package exposes `createDocsStore` and the `createDocsRoutes` Elysia route factory mounted under `/api/*`.

  - It depends on no React, docs-viewer, or docs-workbench code.

- **Why**

  - Host embeddability is the forcing constraint. A host mounts the route factory in its own server and brings its own UI.

  - A viewer or React dependency was rejected because it would force every host to carry the browser stack.

- **Applies to**

  - The rule covers `packages/docs-server`. Future server capability lands behind the store and route factory.

### A Docs Root Is the Unit of Authority

- **Decision**

  - `createDocsStore(docsRoot)` in `packages/docs-server/src/store.ts` binds every method to one resolved root and accepts root-relative paths.

  - The package holds no project identifiers, project records, or host database connections.

  - A host resolves its own workspace, project, or command-line selection to a docs root before entering the package.

- **Why**

  - Filesystem and concurrency policy belong to the server. Application identity, authentication, and routing outside `/api/*` belong to hosts.

  - A project-aware server was rejected, because it would pull every host's identity model into the reusable package.

- **Applies to**

  - The rule covers `store.ts` and every future store method. Host identity never enters the signature.

### Save-Time Lints Wait for HarfBuzz

- **Decision**

  - `createDocsRoutes` starts loading the exact HarfBuzz backend of `@codecaine-ai/text-measure`, and every save-time lint in `doc-ops.ts` and `proposal-ops.ts` waits for it.

  - `textMeasureReady()` in `packages/docs-server/src/text-measure.ts` loads the backend once per process. A failed load logs an error and keeps the approximate table backend, and the next lint retries, up to 3 loads per process (`TEXT_MEASURE_LOAD_ATTEMPTS`).

- **Why**

  - A host that embeds the routes, such as the workbench server or the docs MCP service, gets exact layout lints with no setup of its own.

- **Applies to**

  - The rule covers `routes.ts`, `doc-ops.ts`, `proposal-ops.ts`, and `text-measure.ts`. Every future lint call awaits `textMeasureReady()` first.
