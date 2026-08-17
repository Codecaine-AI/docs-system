A change-set is the reviewable unit for one logical change spanning multiple documents. It groups ordinary per-document proposals with document-tree operations, then accepts, rejects, and undoes the group as one PR-like action. The model keeps the existing proposal mutation path intact, so each document retains its own staged diff and hash precondition.

## Structure

```ts
type DocChangeSet = {
  id: string;
  summary: string;
  status: "open" | "applied" | "declined";
  sessionId?: string;
  annotationId?: string;
  alias?: string;
  entries: Array<{ docPath: string; proposalId: string }>;
  treeOps: Array<
    | { kind: "create-doc"; docPath: string; title: string }
    | { kind: "delete-doc"; docPath: string }
    | { kind: "move-doc"; from: string; to: string }
  >;
  createdAt: string;
  resolvedAt?: string;
};
```

Each record is one file at `docs/.changesets/<id>.json`. The corpus-level sidecar sits outside every bundle because its entries span bundles; its absence means no change-sets, writes are atomic and path-mutex guarded, and the dot-directory is invisible to the document tree and corpus audit.

## Entry State and Review

An entry points at the staged proposal in one document, while the change-set supplies the cross-document order and review state. The card derives state from those proposals instead of creating a second mutation representation.

**Change-set entry state**

| derived state | source | review meaning |
| --- | --- | --- |
| staleness | the entry proposal's base hash and current document | A changed document makes its entry stale before acceptance. |
| progress | entries already accepted through the ordinary proposal route | The card shows partial completion without hiding the remaining entries. |
| adds and deletes | the staged ops for each proposal | Each row shows the document-local diff summary and navigates to that document's existing staged regions. |

## The Accept Protocol

Accept is one ordered action with rollback, not a second write authority. Every proposal still goes through the ordinary per-document accept path, which preserves its hash check, draft lock, ledger inverse, and change notification.

- The coordinator acquires locks for every entry path and every tree-operation target in sorted path order, so overlapping change-sets cannot deadlock.

- It accepts entries in recorded order, applying tree operations at their recorded positions through the document-tree operations.

- A failed entry replays the already applied prefix's ledger inverses in reverse order. The record remains open and reports the stale or failed entry, so no partial merge is represented as applied.

- A complete accept marks the record applied, attaches the agent run, resolves its originating annotation, and records one compound ledger entry containing the member patch ids.

- A reviewer may accept one entry through the ordinary proposal route. That resolves only that entry and updates change-set progress; the grouped Accept action remains the primary review path.

## Reject, Undo, and Retention

- Reject drops every staged entry through the existing per-document reject behavior and marks the record declined. It never changes document content.

- Undo consumes the successful compound ledger entry and replays the grouped work as one action, restoring the member patches through the same inverse mechanism used by undo and redo.

- Applied and declined records remain in `docs/.changesets/` as review history. Resolution changes status and records `resolvedAt`; it does not prune the record.

## Cross-Document Primitives

move_blocks is the primitive that turns a cross-document structural change into a generic change-set. Merge and split compose it, so content identity and sidecars follow the same rules in every document-level workflow.

- `move_blocks(sourceDocPath, blockIds[], destDocPath, destPosition)`

  - The destination proposal inserts the selected blocks with their existing ids and content, while the source proposal deletes those ids.

  - A destination id collision mints fresh ids and carries an id-remap map through the rest of the transaction.

  - After both proposals apply, matching annotation sidecar entries move from source to destination; block targets remain valid when ids persist, text-range offsets move verbatim, and collision fallback rewrites targets through the remap.

  - Inbound references found by the docs index retarget to the destination docPath as additional reviewable entries in the same change-set.

- `merge_docs(a, b)`

  - Moves every root child of a into b, deletes a, and retargets inbound links to a.

- `split_doc`

  - Creates the destination document, then delegates the selected block move to move_blocks.

## Why

A cross-document request is one review decision even when it produces several document diffs. Grouping the existing proposals preserves local visibility while the ordered protocol supplies the missing all-or-rollback boundary.

Stable block ids keep annotations and links anchored through a move. The collision remap and reviewable link-retarget entries make the exceptional case explicit instead of silently stranding references.
