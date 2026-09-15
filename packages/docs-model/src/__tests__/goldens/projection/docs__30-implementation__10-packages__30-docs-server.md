The React-free mutation authority for one filesystem-backed docs tree — reads, preconditioned writes, undo, locks, and change events, exposed as a TypeScript store and an embeddable route factory. Source: `packages/docs-server`.

## Governed By

The mutation model — op semantics, inverses, undo, and refusal behavior the server's write path realizes.

Serialization — canonical bytes and the content hashes that make write preconditions possible.

## Decisions

### The server is the sole mutation authority

- Decision: Every accepted write goes through the ops path in `packages/docs-server/src/doc-ops.ts` — behind `POST /api/ops` and the direct agent tools alike — with an expected-hash guard, a per-path mutex around the whole read-check-apply-write sequence, atomic temp-then-rename persistence, and inverse ops recorded in the undo ledger. Undo re-enters the same guarded path. No client, tool, or secondary route writes document bytes.

- Why: Hash preconditions, validation, undo, and change events stay consistent only when there is exactly one guarded critical section. Client-side writes and parallel write paths were rejected — a second path would bypass those guarantees and give agents a weaker authority.

- Applies to: `packages/docs-server/src/doc-ops.ts`, `packages/docs-server/src/routes.ts`, `packages/docs-server/src/agent-tools.ts` — every future mutation surface converges on this path.

### Embeddable and React-free

- Decision: The package exposes `createDocsStore` and the `createDocsRoutes` Elysia route factory mounted under `/api/*`; it depends on no React, docs-viewer, or docs-workbench code.

- Why: Host embeddability is the forcing constraint — a host mounts the route factory in its own server and brings its own UI. A viewer or React dependency was rejected because it would force every host to carry the browser stack.

- Applies to: `packages/docs-server` — future server capability lands behind the store and route factory.

### A docs root is the unit of authority

- Decision: `createDocsStore(docsRoot)` in `packages/docs-server/src/store.ts` binds every method to one resolved root and accepts root-relative paths; the package holds no project identifiers, project records, or host database connections. A host resolves its own workspace, project, or command-line selection to a docs root before entering the package.

- Why: Filesystem and concurrency policy belong to the server; application identity, authentication, and routing outside `/api/*` belong to hosts. A project-aware server was rejected — it would pull every host's identity model into the reusable package.

- Applies to: `packages/docs-server/src/store.ts` and every future store method — host identity never enters the signature.
