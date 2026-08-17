Undo is part of the algebra, not a feature bolted on: every successful apply returns exact inverse ops, and everything else follows. Two layers share that mechanism — the patch ledger for applied changes, and the editor's local history for typing.

## Structure

```json
// an applied op and the inverse the apply returned
{ "type": "updateBlock", "blockId": "b-x", "props": { "density": "compact" } }

// inverse
{ "type": "updateBlock", "blockId": "b-x", "props": { "density": "normal" } }
```
> **L2 (The change):** A shallow props patch, as applied.
> **L5 (The exact inverse):** Returned by the same apply — the prior value, not a guess. Applying it reverts the change.

## The Rule

- **Every apply returns its inverses**

  - Exact for the state actually changed — applying them reverts order, props, text, and subtree placement.

  - Inverses come from the apply itself, so they are never stale reconstructions.

- **The patch ledger**

  - Every applied batch is recorded as a patch with its inverses; `POST /api/undo` reverses a patch by id — document, canvas, and sequence writes alike.

  - Any surface can undo any patch: a human undoing an agent's change and an agent undoing its own are the same call.

  - A patch records its inverses together with the document hash after the apply, and undo re-enters the same hash-checked mutation authority with that hash as its precondition — if the document has moved on since, the undo refuses and the later edits survive untouched. Canvas and sequence patches restore a validated prior snapshot under the same rule.

  - An undo token is single-use: success consumes it, and a second attempt fails cleanly. The ledger is a live undo stack for the running authority, not durable history — the document file stays the only canonical record.

- **Redo is undoing the undo**

  - An undo lands as a patch like any other, with inverses of its own — reversing it restores the change. No separate redo machinery exists, because none is needed.

- **Keystroke history stays local**

  - The editor keeps its own typing history, with redo, scoped to the session.

  - It reaches the ledger only as saved op batches — the ledger never sees half-typed states.

## Why

- **Inverses make trust cheap**

  - An agent can act boldly when every patch reverses exactly; review becomes cheap because reverting is.

- **One mechanism for every writer**

  - Human edits and agent edits produce the same kind of patch, so one ledger serves both — no privileged writer.
