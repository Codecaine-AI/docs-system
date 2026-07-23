# One Server Owns Every Accepted Write

`@codecaine-ai/docs-server` is the React-free mutation authority for one filesystem-backed docs tree. It binds reads, preconditioned writes, undo, and change notifications to an explicit docs root, combines them with process-local draft locks, then exposes the same authority through TypeScript and an embeddable Elysia route factory. This page describes the server's internal guarantees; The save pipeline: keystroke to disk owns the cross-package path from editor input to persistence.

## The Cut

> **Package boundary: Embeddable in host apps** — Host embeddability is the forcing constraint. A host mounts the `/api/*` route factory in its own Elysia server and brings its own UI. A dependency on docs-viewer — rendering and editing or React would force every host to carry the browser stack.

The server owns filesystem and concurrency policy, not application identity. Project lookup, authentication, process lifetime, routing outside `/api/*`, and UI composition remain host responsibilities.

> **Open call: docs-index may fold into docs-server** — Folding docs-index — Backlinks into docs-server is a live candidate because both are Bun-only and the server is the index's main consumer. The current split is a judgment call: the index is derived, rebuildable state with no HTTP surface and remains useful to the CLI without a server.

## Module Map

```
packages/
└── docs-server/
    └── src/
        ├── __tests__  # Route, concurrency, validation-gate, event, confinement, and sidecar contracts.
        ├── agent-tools.ts  # Named document, canvas, sequence, annotation, and undo tools over the same authority.
        ├── assets.ts  # Confined asset upload and read primitives.
        ├── atomic-write.ts  # Same-directory temporary write followed by atomic rename.
        ├── backlinks-cache.ts  # Docs-root-keyed backlinks connection cache and best-effort reindexing.
        ├── bundle.ts  # Bundle loading, validation, canonical hashing, and annotations-sidecar primitives.
        ├── canvas-sidecar.ts  # Canvas sidecar reads, writes, inventory, and legacy MDX reference upkeep.
        ├── confine.ts  # Relative-path, size, extension, and write-time symlink confinement.
        ├── content-hash.ts  # Shared SHA-256 content-hash implementation.
        ├── doc-ops.ts  # Document and annotation mutation core.
        ├── docs-events.ts  # Process-local change-event pub/sub.
        ├── docs-tree.ts  # Bundle-aware docs tree walker.
        ├── draft-locks.ts  # Canonicalized, expiring advisory lock store.
        ├── fs-watch.ts  # Out-of-band filesystem changes translated into change events.
        ├── index.ts  # Public barrel for the package's stores, routes, tools, and server primitives.
        ├── patch-ledger.ts  # Process-local inverse and prior-snapshot ledger for single-use undo.
        ├── path-mutex.ts  # In-process async mutex keyed by absolute target path.
        ├── routes.ts  # Embeddable Elysia transport and wire-status mapping.
        ├── sequence-sidecar.ts  # Sequence sidecar reads and whole-document mutations.
        ├── store.ts  # Docs-root-bound facade shared by HTTP hosts and direct tool callers.
        └── themes.ts  # Repository theme-folder reads and writes.
```

## Public Surface

`packages/docs-server/package.json` exposes a root barrel and focused subpath exports. `packages/docs-server/src/index.ts` collects the direct TypeScript surface; hosts normally start with `createDocsStore` and `createDocsRoutes`.

**docs-server — authority seams**

```
createDocsStore(docsRoot: string) -> DocsStore  # Bind the server's read, mutation, undo, backlinks, lock, and event methods to one resolved docs root.
createDocsRoutes(store: DocsStore, options?: { themeLocked?: boolean }) -> Elysia plugin  # Adapt a DocsStore to an embeddable Elysia plugin mounted under /api/*.
POST /api/ops(path: string, ops: DocOp[], expected_hash?: string, expected_canvas_hash?: string, expected_sequence_hash?: string, session_id?: string) -> canonical document or sidecar, authority hash, and patch_id; refusal status depends on the selected authority  # Apply document operations or route one forwarded canvas or sequence action through its owning authority.
POST /api/undo(patch_id: string) -> restored document or sidecar and new hash; 404 or 409 on refusal  # Consume one undo token only if the target still matches the hash recorded after the original apply.
POST /api/draft-lock/{acquire,heartbeat,release}(kind: "doc" | "canvas" | "sequence", path: string, sessionId: string) -> lock state or 423 when another session holds it  # Coordinate an expiring editor claim without replacing content-hash correctness.
GET /api/events() -> connected and keepalive frames plus DocsChangeEvent messages  # Stream committed and out-of-band change hints to clients over SSE.
```

`packages/docs-server/src/routes.ts` owns request validation, response shapes, status mapping, development CORS, and SSE framing. Reads for bundles, Markdown, backlinks, assets, sidecars, themes, and the docs tree share the same store as the write routes; document mutation semantics stay below the transport.

`GET /api/blocks` serves static operation and component-action discovery built from docs-model. Direct agent calls in `packages/docs-server/src/agent-tools.ts` converge on the same mutation primitives, so agents do not receive a weaker mutation path.

## One Store per Docs Root

`createDocsStore(docsRoot)` in `packages/docs-server/src/store.ts` resolves the supplied root once and closes every method over it. The resolved root is also the change-event channel, so store instances bound to the same tree share notifications. Draft locks are process-wide and keyed by kind plus root-relative path, so different roots in one process share that lock namespace. The factory does not cache stores; the host keeps and shares one store instance for each root it serves.

> **Scope contract: A docs root is the unit of authority** — DocsStore accepts paths relative to one docs root. It has no project identifier, project record, or host database connection. A host must resolve its own workspace, project, or command-line selection to a docs root before entering the package.

## The Mutation Critical Section

The save pipeline: keystroke to disk covers the end-to-end editor and host flow. The server's part begins when a batch reaches `applyDocOpsToBundle` in `packages/docs-server/src/doc-ops.ts`.

`packages/docs-server/src/path-mutex.ts` serializes the complete read-check-apply-write sequence by resolved absolute file path. Same-path callers cannot interleave, different paths remain concurrent, and a rejected critical section does not poison the queue behind it.

`packages/docs-server/src/doc-ops.ts` owns the guarded mutation transaction across docs-model operations, complete-document validation, atomic persistence, undo recording, and best-effort reindexing. No transport or tool caller can enter between those contracts.

`applyOps` and inverse construction remain in `packages/docs-model/src/doc-ops.ts`; their semantics belong to The mutation model: ops, inverses, undo. The server composes those pure results with persistence guarantees in `packages/docs-server/src/atomic-write.ts` instead of reimplementing the operation catalogue.

## Hashes Decide; Locks Coordinate

The normal mutation protocol supplies `expected_hash`. The server compares it with the canonical hash derived after load-time validation and serialization. A mismatch returns `409` before mutation; performing this comparison inside the path mutex prevents two same-state callers from both passing and overwriting one another in the supported single-process authority.

Draft locks in `packages/docs-server/src/draft-locks.ts` are expiring, in-memory coordination. Canonicalization makes `docs/guide`, `guide`, and `guide/doc.json` address the same lock. A foreign live session receives `423`; the holder passes. Expiry, absence, or loss of a lock never proves freshness, so the hash precondition remains the correctness backstop.

## Validation Guards the Reload Boundary

> **Write gate: Invalid post-op documents never reach disk** — Operation application cannot establish that every rich-text span and cross-reference is reloadable. The server therefore validates the complete post-op document before persistence. Failure returns `422` with issue paths; the existing file, undo ledger, and backlinks index remain untouched.

A successful gate persists the validator's normalized document rather than the unchecked operation result. That makes the returned hash match the next load's canonical bytes. `packages/docs-server/src/__tests__/doc-validation-gate.routes.test.ts` locks the refusal shape and byte-unchanged guarantee.

## Undo Reuses the Authority

`packages/docs-server/src/patch-ledger.ts` stores each document patch's path, inverse operations, and `hashAfterApply` under a `patch_id`. The ledger is process-local and is an undo stack, not durable history.

`undo_patch` in `packages/docs-server/src/agent-tools.ts` sends a document inverse back through `applyDocOpsToBundle` with `hashAfterApply` as the precondition. Later edits produce `409` and survive untouched. Success consumes the original token, so a second use returns `404`. Canvas and sequence patches store validated prior snapshots and restore them under a path lock, hash precondition, and atomic write.

## Events Follow Commits

`packages/docs-server/src/docs-events.ts` carries change hints shaped as `{ path, changedIds, patchId, actor }`. Route handlers publish only after their mutation succeeds. The payload identifies what may have changed and who caused it; canonical state remains on disk and clients re-fetch it.

`GET /api/events` adapts the root-scoped in-process pub/sub to SSE. Each connection owns a queue, receives an immediate named frame so headers flush, receives unnamed JSON change messages, emits keepalives while idle, and unsubscribes on close. The stream is neither persisted nor fanned out across processes.

`packages/docs-server/src/fs-watch.ts` lets a host feed hand edits and other out-of-band writes into the same stream. It marks them with actor `fs`, ignores backlinks database paths and atomic temporary names, and debounces repeated paths.

## Forwarded Actions Keep Authority Honest

> **Authority boundary: A forwarded action travels alone** — `POST /api/ops` refuses a batch that mixes a forwarded canvas or sequence action with any other operation. The server cannot promise one atomic transaction across the document file and another authority's sidecar, so it does not present the batch as atomic.

The docs-model action registry identifies the forwarding authority. `packages/docs-server/src/store.ts` coordinates the document precondition and the canvas or sequence patch under the document path lock. The document bytes stay unchanged. The route returns the updated sidecar, its hash, and an undo token, then publishes the changed IDs in the sidecar event.

## Invariants and Firewalls

**Server boundary**

| Invariant | Mechanism | Consequence |
| --- | --- | --- |
| UI-free | The manifest and source imports contain no React, docs-viewer, or docs-workbench dependency. | A host can mount the server without bundling a browser UI. |
| Host-neutral | DocsStore accepts one docs root and root-relative paths. | Project records, authentication, and host databases stay outside the package. |
| Reloadable documents | Every accepted doc-op result passes complete document validation before atomic persistence. | An editor or agent bug cannot persist a doc.json that the next load refuses. |
| Single-process coordination | Path mutexes, draft locks, the undo ledger, and event listeners live in memory. | Horizontal or multi-process deployment requires a different coordination layer. |
| Derived backlinks | Reindexing begins after commit and swallows index failures. | A broken or locked index cannot fail a document save. |

The dependency manifest in `packages/docs-server/package.json` allows server-side dependencies: docs-model for format and operations, docs-index for paths and backlinks, canvas and sequence for sidecar authorities, and Elysia for HTTP. React and docs-viewer remain outside the graph.

Path acceptance is also part of the authority boundary. `packages/docs-server/src/confine.ts` rejects traversal and invalid asset or sidecar shapes; write-safe sidecar resolvers canonicalize the deepest existing ancestor so a symlink cannot redirect a mutation outside the docs root.

The mutation authority assumes one Bun process owns a docs root. `withPathLock` prevents races among callers in that process; it is not a cross-process file lock.

Backlinks remain derived state. `packages/docs-server/src/backlinks-cache.ts` caches a database connection by resolved docs root and makes save-path indexing best-effort. Persistence succeeds or fails before the index is consulted.

## Related Files

- `packages/docs-server/src/store.ts`

  - Binds the public server facade and event channel to one resolved docs root.

- `packages/docs-server/src/routes.ts`

  - Maps the root-bound store to the embeddable HTTP and SSE surface.

- `packages/docs-server/src/doc-ops.ts`

  - Owns the document critical section and annotations-sidecar mutations.

- `packages/docs-server/src/agent-tools.ts`

  - Converges direct agent operations and single-use undo on the same mutation authority.

- `packages/docs-server/src/docs-events.ts`

  - Defines the process-local change-event shape and pub/sub lifecycle.
