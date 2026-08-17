Every document change is one of seven ops. Six are generic structural/text mutations; the seventh, `componentAction`, is the typed-action bridge for component-owned actions. A successful apply always yields exact inverse ops, so undo is just another apply in the opposite direction.

The model is transport-agnostic: it defines the algebra, invariants, inverses, and refusal rules, not the UI or file write path. For the exact op surface, read the data model — doc.json shapes. For package structure and transport wiring, read the implementation tier.

The point is standardization. Components define what can change — their own actions. This model defines how any change behaves: validated, inverted, recorded, broadcast. A table cell edit and a file-tree entry undo the same way, not because they share code, but because both are ops.

## The Interactions

- Undo & redo

  - Inverses, the patch ledger, undo by patch id, redo as undoing the undo, and the editor's local history.

- Copy & paste

  - Typed clipboard payloads, top-level block-run pastes, fresh ids for copies, and the validation gate.

## The Op Algebra

The six generic ops cover document structure and rich text. `componentAction` is the seventh: it names a component-owned action, whose TypeBox params the dispatcher validates before apply, then expands to `updateBlock` semantics. Param issues use `$.params.<name>`, and unknown extra params remain tolerated.

**Seven mutation ops**

| op | semantic role |
| --- | --- |
| insertBlock | Adds a fresh non-colliding block under an existing parent at an ordered child index. |
| updateBlock | Mutates an existing block in place: shallow-merge props and/or replace text while preserving the id. |
| deleteBlock | Removes a block subtree, or splices its children into the former slot when reparenting is requested. |
| moveBlock | Detaches a block and inserts it under another parent, rejecting moves that would create cycles. |
| splitBlock | Splits one text-bearing block into two sibling blocks; the new sibling gets a fresh id. |
| mergeBlocks | Combines contiguous siblings into one fresh block. |
| componentAction | Runs a component-owned typed action and applies its validated result as an updateBlock patch. |

`updateBlock` is a shallow patch, not a replacement object. `props` keys merge one level deep; a key set to `undefined` removes that prop; `text` replaces the block's rich-text array wholesale when present. The block id is preserved, which keeps comment and backlink anchors stable through ordinary edits.

`splitBlock` and `mergeBlocks` mint fresh ids because they change identity boundaries. `updateBlock` preserves the id because the same conceptual block remains in place.

## Inverse Ops and Undo

Every successful apply returns exact inverse ops for the state it actually changed. Applying those inverses to the resulting document reverts the change, including order, props, text, and subtree placement. The undo ledger records the inverse batch under a `patch_id`; that patch id is the unit a user or agent undoes. A multi-op patch therefore rolls back as one conceptual edit instead of as individual low-level steps.

## Refusing an Apply

A syntactically valid op batch can still be refused before bytes change: hash staleness, a draft lock, or strict props validation. For `insertBlock` and `updateBlock`, applyOp validates the resulting props against the owning component’s closed state schema; `componentAction` reaches the same gate through updateBlock. Nonconforming writes return `{ ok: false, issues }` at `$.op.props.<key>`. splitBlock and mergeBlocks are not revalidated because they copy existing props. Ops also refuse structural illegality outright — a missing target block, an invalid child index, an illegal root change, or a move that would create a cycle. Reads and loads remain tolerant: structural validation never rejects a document for props content. Undo replay is exempt from strict props validation because it restores a previously-accepted state.

- `expected_hash` — the content hash the change was computed against. If the current content has a different hash, the apply is rejected; over HTTP this is `409`, and nothing is written.

- draft lock — an expiring, heartbeat-renewed per-session claim rejects a writer with a different session identity. Over HTTP this is `423`. The lock is coordination, not correctness: expiry, absence, or loss of a lock never proves freshness, so the hash precondition remains the correctness check.

One session identity threads through all of this. Each editing session — a browser tab, an agent run — carries a single `session_id` on its writes. That one id is checked against the draft lock, names the actor on the resulting change event, and lets a session filter its own echoes out of the change stream. If a session's locks and writes named different identities, the authority would reject the session's own saves as a foreign writer.

## Atomicity and the Validation Gate

The write authority serializes the whole read–check–apply–write sequence per document, and the `expected_hash` comparison happens inside that critical section — two writers holding the same baseline cannot both pass and overwrite one another. Writes to different documents proceed concurrently, and a refused batch does not poison the writers queued behind it. A batch is all-or-nothing: on success every op applies, the inverse batch is recorded under a `patch_id`, a change event broadcasts, and the new document and hash return to the caller. On any refusal, nothing is written.

> **Write gate: Invalid post-op documents never reach disk** — Applying ops cannot by itself establish that every span and cross-reference is reloadable, so the authority validates the complete post-op document before persistence. Failure refuses the batch (`422` over HTTP) with typed issue paths; the existing file, undo ledger, and derived indexes stay untouched. What persists on success is the validator's normalized document, so the returned hash matches the next load's canonical bytes — an editor or agent bug cannot save a document the next load refuses.

## Component Actions (the Seventh Op)

The structured bundles — tables, file trees, interaction surfaces, code, and the diagram types — expose named actions for their collections. A `componentAction` carries an action name plus params; the folded registry validates the params schema, applies, and returns the same inverse-op contract as every generic op. Discovery lists the current roster.

**componentAction examples**

```
structured-table.updateCell(rowIndex: number, column?: string, columnIndex?: number, value: string) -> updateBlock props patch (standard inverse)  # Set one cell, addressing the column by name (column) or position (columnIndex)
  column?: string  # exactly one of column/columnIndex
code.setAnnotation(lines: string, note: string, label?: string) -> updateBlock props patch (standard inverse)  # Upsert a line annotation keyed by its exact "lines" string
  lines: string  # line range key, e.g. "4-9"
```

Canvas and sequence actions are the exception that proves the authority boundary: they carry their owning engine's schema truth and forward to that engine's authority instead of patching document props. A forwarded action travels alone — a batch that mixes one with any other op is refused, because no single transaction can span the document file and another authority's sidecar, and the model does not pretend otherwise. The document's bytes stay unchanged; the sidecar authority applies the action under its own hash precondition and returns its own hash and undo token.

## Change Events

A successful apply broadcasts an SSE change event carrying the ids of blocks whose content or placement changed. Consumers use that id set to flash the affected blocks; the event is a notification of the applied patch, not a second write path.

The event carries `{ path, changedIds, patchId, actor }` and publishes only after the mutation commits — never for a refused write. It is a hint, not state: canonical content stays on disk and consumers re-fetch it. Out-of-band filesystem edits enter the same stream under the actor `fs`. Derived indexes such as backlinks update best-effort after the commit; a broken or unavailable index can make derived lookups stale but can never veto a valid save.

Auto-apply of incoming change events is held while a consumer has an unsaved or dirty draft. Remote changes therefore never clobber local work; if both sides touched overlapping state, the overlap appears as the `409` when the dirty draft is saved against its stale `expected_hash`.

> **Gotcha: Why didn't the live update apply?** — SSE auto-apply is suppressed while your editor is dirty or a save is in flight — incoming remote changes are held rather than clobbering your unsaved draft. Nothing is lost: once you save (or reload), any true overlap surfaces as the save-time 409 instead of a silent merge.

## Discovery

`GET /api/blocks` exposes `{ schemaVersion: 2, ops, components }`. Ops carry kernel descriptions. Each component has name, description, types, and actions; types contain `{ type, carriesText, state }`, and actions contain `{ action, description, params }`. TypeBox state and params schemas are served verbatim as JSON Schema. There is no text/object category.

## Multi-Document Change-Sets

Multi-document change-sets extend this model without adding a second mutation path. Each member proposal still accepts through the per-document path, preserving its hash precondition, draft lock, and ledger inverse; the coordinator accepts members in recorded order, interleaves document-tree operations and annotation migrations, and rolls back the applied prefix on failure. A successful set records one compound ledger entry, so undo is one action. The change-sets page defines the record and protocol.
