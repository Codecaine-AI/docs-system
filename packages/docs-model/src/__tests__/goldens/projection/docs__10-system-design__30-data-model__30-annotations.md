An annotation marks a spot in a doc and says what should change there. It is the human-to-agent channel: this system is one person working with agents, and annotations carry the requests. 

They never live inside `doc.json` — each bundle may carry an `annotations.json` sidecar, so annotation churn never touches content bytes or content hashes.

## Structure

```json
{
  "schemaVersion": 1,
  "annotations": [
    {
      "id": "a-example-1",
      "target": { "kind": "block", "blockId": "b-example-body" },
      "body": "Tighten this paragraph.",
      "intent": "agent-request",
      "author": "ford",
      "status": "open",
      "createdAt": "2026-07-15T09:30:00Z"
    },
    {
      "id": "a-example-2",
      "target": {
        "kind": "canvas-object",
        "canvasSrc": "assets/flow.canvas.json",
        "objectId": "node-auth"
      },
      "body": "Rename this node to match the doc.",
      "intent": "agent-request",
      "author": "ford",
      "status": "resolved",
      "createdAt": "2026-07-15T09:31:00Z",
      "agentRun": {
        "sessionId": "s-20260715-a",
        "patchId": "p-114",
        "summary": "Renamed node-auth to Session Manager.",
        "changedIds": ["node-auth"]
      },
      "resolution": "Renamed as asked."
    }
  ]
}
```
> **L3 (The canonical key):** The sidecar is annotations.json with an annotations array — the only accepted shape.
> **L25-30 (The receipt):** The agent run that handled the request — session, patch, summary, and exactly which ids changed.

## The Annotation

Annotation ids follow the same stable-ASCII id rule as block ids and must be unique within the sidecar. Validation is the same style as the document validator: pure, no throw, typed issue list.

| field | shape | meaning |
| --- | --- | --- |
| id | stable ASCII id, unique in the sidecar | Identity for resolve/edit flows. |
| target | block | canvas-object | What the annotation is about; see targets below. |
| body | string | The request — what should change. |
| intent | "note" | "agent-request" | Margin note vs work item for an agent. |
| author | non-empty string | Who wrote it. |
| status | "open" | "resolved" | Lifecycle; resolved annotations stay in the file. |
| createdAt | string timestamp | When it was created. |
| agentRun? | { sessionId, patchId, summary, changedIds? } | Receipt of the agent run that handled the request. |
| resolution? | string | Optional note persisted when resolving with a response. |

## The Target

A target addresses anything a reader can point at. The annotation shape is the same for every one of them — what differs is how it gets processed, and that is the block type's business, not the annotation's.

- `block`

  - A whole block by id; survives edits and moves because the generic ops preserve ids.

- `text_range`

  - A span inside a block's text: offsets plus the quoted text and its surrounding context, so the anchor can re-attach after edits.

- `visual_point`

  - A coordinate on a visual surface — a spot on a canvas or an image.

- `custom_element`

  - An element inside a complex component — a canvas object, a connection, a sequence participant — by element id and type.

  - The sidecar's canvas-object target (`canvasSrc` plus exactly one selector: `objectId`, `connectionId`, or a region rectangle) is this kind's persisted form today.

The shape never specializes: an annotation on a sequence diagram looks exactly like an annotation on a paragraph. Special cases are handled at processing time by the type's agent adapter. The sidecar schema persists block and canvas-object targets today; the remaining kinds land additively, under the same optional-fields growth rule.

## The Lifecycle

- **Open annotations are the work queue**

  - You mark spots and state requests; the set of open annotations is what the agent works through.

- **A handled request carries its receipt**

  - The `agentRun` records the session and patch that produced the change, a human-readable summary, and optionally `changedIds` — the exact block or canvas-object ids touched.

  - An open viewer can flash exactly those targets without re-diffing.

- **Execution is per-type**

  - How the agent edits the target is the block type's business — the agent adapter in block design. Canvas and sequence bring their own agents.

- **Resolved annotations stay**

  - Resolving persists an optional `resolution` note; nothing is deleted.

  - The kept record is reference material — real request-to-change pairs, including for building eval sets.

> **Direction: Annotate mode is not wired up yet** — The surface flow — leave annotations, an AI processes them and reports back — is the target design, not current behavior. The shapes and validation for all of it exist today; the processing loop does not.

> **Compatibility** — `changedIds` and `resolution` are optional and additive: sidecars written before those fields existed still validate unchanged. The schema grows by adding optional fields, not by bumping `schemaVersion`.

The name is deliberately shared across packages: the canvas package's own agent processes annotations on canvas objects through this same concept and shape — one vocabulary everywhere annotations appear.

## Dangling Targets

Because targets anchor by id, deletion — and the fresh ids minted by split and merge — can strand them. `detectDanglingTargets` flags annotations whose targets no longer resolve: a block target dangles when its blockId is missing from the document. Dangling annotations are reported, not auto-deleted — the record of what was asked outlives the block it pointed at.

Canvas checks distinguish "not loaded yet" from "loaded and absent": while the canvas index is still loading, canvas-target checks are skipped entirely (block checks still run) — otherwise every canvas-object annotation would flash "target removed" during load. Once loaded, a missing `canvasSrc`, `objectId`, or `connectionId` is genuinely dangling.
