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

### Reads Run Outside the Store Lock

- **Decision**

  - `createDocsStore` wraps each mutation in one `withPathLock` on `.changesets/.store-operation-lock`, so multi-file reorganizations see one corpus authority. A read never takes that lock.

  - `UNLOCKED_READS` in `store.ts` names the reads: `tree`, `treeSnapshot`, `bundle`, `projection`, the annotation, proposal, changeset, doc, canvas, sequence and asset getters, and `backlinks`. Every other method is a mutation and keeps the lock.

  - A single-file write is atomic through temp-then-rename, so a read sees the old or the new file, never a torn one.

  - A read during a multi-file move can see the move half done for one request.

  - A tree read is eventually consistent, and a bundle read that lands mid-move answers 404 once.

- **Why**

  - Behind one lock, a bundle read waited for any tree walk in flight: 3 ms when it bypassed the store, 3,384 ms through `createDocsStore`. On a 4,000-folder knowledge base, every doc open in a host app waited 2 to 31 s while agents wrote.

  - Serializing reads behind a changeset accept was rejected, because a large accept holds the lock for seconds and every doc open would wait for it.

- **Applies to**

  - The rule covers `store.ts`. A new store method joins `UNLOCKED_READS` only when it writes nothing, and `store-lock.test.ts` proves a read finishes beside a held lock.

### The Tree Is an Index, Not a Walk

- **Decision**

  - **The snapshot**

    - A docs root's tree lives in memory as an immutable snapshot `{ tree, revision, builtAt }` in `tree-index.ts`, keyed by canonical root and exclude-policy fingerprint. `revision` is the sha256 of the serialized tree.

    - The host that owns a root's watcher registers it with `treeIndex.watch(root)`, and an unwatched root walks per call.

    - On a watched root `store.tree()` answers from the snapshot, and the first call awaits one shared build.

  - **How it stays current**

    - A change event rebuilds the whole tree after 200 ms of quiet, and a change during a build starts one more build when it ends. There is no incremental patch.

    - A mutation made through this process calls `treeIndex.invalidate` after its write: a move, a page create or delete, a changeset accept or undo with tree ops, or a changed exclude policy. That build starts at once, and the read that follows waits for it.

    - A failed build keeps the last snapshot, leaves the index dirty, and retries from 1 s doubling to 10 s.

    - While the policy is unreadable, `tree()` returns the policy error.

  - **How it is read and built**

    - `GET /api/tree` sets a strong quoted `ETag` from the revision and answers 304 with no body when `If-None-Match` lists that tag, its weak form, or `*`.

    - The build walks with one guarded listing per folder (`listingWalk` in `packages/docs-index/src/safe-path.ts`), a per-build policy snapshot, and a `setImmediate` yield after 8 ms. A child folder is listed only while its real path equals its canonical path.

- **Why**

  - A walk per request made the tree the hub's most expensive route. It took 2,070 ms in a quiet process and 2.4 to 11 s in a running hub, for 4,010 folders, while hosts asked for it after every docs change.

  - The index pays one build per change instead of one walk per request. A build takes 211 to 334 ms on that knowledge base with an 11 ms longest stall, and a `GET /api/tree` answers in 2.8 to 7.6 ms.

  - A read that always waits for a fresh build was rejected, because every tree read would pay for the watcher's quiet window. Only a read that follows this process's own mutation waits.

- **Applies to**

  - The rule covers `tree-index.ts`, `docs-tree.ts`, `tree-etag.ts` and the tree route in `routes.ts`.

  - A new store mutation that changes the tree shape calls `treeIndex.invalidate` after its write, and a new host registers its roots with `treeIndex.watch`.
