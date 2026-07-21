# Comments & targets

Comments never live inside `doc.json`. Each bundle folder may carry a `comments.json` sidecar — `{ "schemaVersion": 1, "comments": [...] }` — so annotation churn never touches content bytes or content hashes. A comment points at its subject through a typed target and carries an intent, which is what turns the sidecar from margin notes into an agent work queue.

```json
{
  "schemaVersion": 1,
  "comments": [
    {
      "id": "c-example-1",
      "target": { "kind": "block", "blockId": "b-example-body" },
      "body": "Tighten this paragraph.",
      "intent": "note",
      "author": "ford",
      "status": "open",
      "createdAt": "2026-07-15T09:30:00Z"
    },
    {
      "id": "c-example-2",
      "target": {
        "kind": "canvas-object",
        "canvasSrc": "assets/flow.canvas.json",
        "objectId": "node-auth"
      },
      "body": "Rename this node to match the doc.",
      "intent": "agent-request",
      "author": "ford",
      "status": "resolved",
      "createdAt": "2026-07-14T18:12:00Z",
      "agentRun": {
        "sessionId": "s-20260714-1812",
        "patchId": "p-42",
        "summary": "Renamed node-auth to Auth gateway.",
        "changedIds": ["node-auth"]
      },
      "resolution": "Renamed as requested."
    }
  ]
}
```
> **L5 (Block anchor):** A block target anchors to a stable block id — the same anchor contract the tree page describes. Split and merge mint fresh ids, so anchored comments can dangle.
> **L7 (Intent):** note is a human margin note; agent-request asks an agent to act on the target.
> **L15-19 (Canvas-object target):** Canvas targets name the canvas file plus exactly one selector: objectId, connectionId, or a region rectangle.
> **L23-28 (Agent run receipt):** When an agent handles a request, the run is recorded on the comment: session, patch, summary, and the ids it actually changed.

## The comment

Comment ids follow the same stable-ASCII id rule as block ids and must be unique within the sidecar. Validation is the same style as the document validator: pure, no throw, typed issue list.

**DocComment fields**

| field | shape | meaning |
| --- | --- | --- |
| id | stable ASCII id, unique in the sidecar | Identity for resolve/edit flows. |
| target | block | canvas-object | What the comment is about; see targets below. |
| body | string | The comment text. |
| intent | "note" | "agent-request" | Margin note vs work item for an agent. |
| author | non-empty string | Who wrote it. |
| status | "open" | "resolved" | Lifecycle; resolved comments stay in the file. |
| createdAt | string timestamp | When it was created. |
| agentRun? | { sessionId, patchId, summary, changedIds? } | Receipt of the agent run that handled the request. |
| resolution? | string | Optional note persisted when resolving with a response. |

## Two target kinds

- **block** — `{ kind: "block", blockId }`. Anchors to a block id in the bundle's own `doc.json`; survives edits and moves because `updateBlock` and `moveBlock` preserve ids.

- **canvas-object** — `{ kind: "canvas-object", canvasSrc, ... }` plus *exactly one* selector: `objectId`, `connectionId`, or a `region` rectangle (`x, y` finite; `width, height` finite and positive). Zero selectors or two selectors are both validation errors.

## Agent runs and resolution

An `agent-request` comment that an agent has handled carries an `agentRun` receipt: the `sessionId` and `patchId` that produced the change, a human-readable `summary`, and optionally `changedIds` — the block ids or canvas-object ids the run actually touched, so an open viewer can flash exactly those targets without re-diffing. Resolving with a response persists the text as `resolution`.

> **Additive evolution** — `changedIds` and `resolution` are optional and additive: sidecars written before those fields existed still validate unchanged. The comments schema grows by adding optional fields, not by bumping `schemaVersion`.

## Dangling targets

Because targets anchor by id, deletion — and the fresh ids minted by split and merge — can strand them. `detectDanglingTargets` flags comments whose targets no longer resolve: a block target dangles when its `blockId` is missing from the document. Dangling comments are reported, not auto-deleted — the record of what was asked outlives the block it pointed at.

Canvas checks distinguish "not loaded yet" from "loaded and absent": while the canvas index is still loading, canvas-target checks are skipped entirely (block checks still run) — otherwise every canvas-object comment would flash "target removed" during load. Once loaded, a missing `canvasSrc`, `objectId`, or `connectionId` is genuinely dangling.

---

The anchor contract comments depend on is defined in the document & block tree; how comment writes are hashed and persisted next to content is part of the save pipeline.
