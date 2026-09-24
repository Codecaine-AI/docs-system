The interaction-surface component owns one block type, `interaction-surface`: the operation list of the block vocabulary. A surface lists the named operations by which a state or system is changed, queried, or observed, operation signatures on a state, not HTTP endpoints. When documenting agentic systems it is one of the three types that carry the whole model: a state-shape block holds the state, shape and example instance side by side, the interaction-surface lists the operations on it, and code blocks hold the source evidence. State first, then operations.

When creating or revising a worked component example, show the relevant state shape with a concrete instance, the real operation signature, and its returned shape beside example data. Use one consistent scenario across all three. Verify fields and return semantics against source; identify whether the result is a props patch, full state, or response envelope. For void, primitive, or event results, document the actual result or payload instead of inventing an object. Descriptions should add non-obvious information.

Descriptions should add non-obvious information about operations, parameters, and returned fields. Omit text that only expands a name, repeats a type, or says an ID is an identifier. Keep constraints, defaults, side effects, failure behavior, lifecycle rules, and other facts the signature does not express. Follow the State Shape description rule. Do not invent details to fill missing descriptions.

## Example

This example starts with one file-tree entry. Adding src/config.ts returns the complete entries props patch inside its operation card. Removing src/index.ts from the same starting state returns an empty entries list. Each example starts independently from FileTreeState.

**FileTreeState**

```
entries: FileTreeEntry[]  # Paths are unique; array order controls document order.
  path: string  # No leading "./"; a trailing "/" marks a directory.
  note?: string
  change?: "added" | "removed" | "modified" | "renamed"
  from?: string  # Previous path when renamed.
```

```json
{
  "entries": [
    {
      "path": "src/index.ts"
    }
  ]
}
```

**file-tree entry operations**

```
file-tree.addEntry(path: string, note?: string, change?: "added" | "removed" | "modified" | "renamed") -> FileTreeEntriesPatch  # Duplicate paths are rejected. Returns the props patch, not the action success envelope.
  path: string  # /-separated path, no leading "./"; a trailing "/" marks an explicit directory.
  note?: string  # Short annotation rendered after the path.
  change?: "added" | "removed" | "modified" | "renamed"  # Change marker rendered as a badge.
  Returns FileTreeEntriesPatch:
    entries: FileTreeEntry[]  # The complete replacement list after the operation.
      path: string  # No leading "./"; a trailing "/" marks a directory.
      note?: string
      change?: "added" | "removed" | "modified" | "renamed"
      from?: string  # Previous path when renamed.
  Example:
    {
      "entries": [
        {
          "path": "src/index.ts"
        },
        {
          "path": "src/config.ts",
          "change": "added"
        }
      ]
    }
file-tree.removeEntry(path: string) -> FileTreeEntriesPatch  # Removes only the exact matching path. Returns the props patch.
  path: string  # Exact path of the entry to remove.
  Returns FileTreeEntriesPatch:
    entries: FileTreeEntry[]  # The complete replacement list after the operation.
      path: string  # No leading "./"; a trailing "/" marks a directory.
      note?: string
      change?: "added" | "removed" | "modified" | "renamed"
      from?: string  # Previous path when renamed.
  Example:
    {
      "entries": []
    }
```

## State Schema

**InteractionSurfaceState** — packages/docs-model/src/components/interaction-surface/state.ts#InteractionSurfaceState

```
title?: string  # Optional bold caption above the surface.
operations: Operation[]  # Operation signatures, in document order.
  name: string  # Operation signature name, e.g. "file-tree.addEntry".
  description?: string  # Only constraints or behavior not already clear from the signature.
  params?: Field[]  # Shared recursive Field nodes; required: false means optional.
    name: string
    type?: string
    required?: boolean  # false = optional
    description?: string
    fields?: Field[]  # Nested params, the node recurses
  returns?: string  # What the operation returns/yields.
  kind?: "action" | "query" | "event"  # Omitted means action. All three kinds have an explicit badge.
  returnShape?: ReturnShape  # Known object result; omit for void, primitive values, or an unsubscribe function.
    fields: Field[]  # Uses the same recursive field nodes as State Shape.
    example?: string  # JSON instance of the returned object.
```

```json
{
  "title": "file-tree, entry operations",
  "operations": [
    {
      "name": "file-tree.removeEntry",
      "description": "Remove the entry with the given path from the file tree.",
      "params": [
        {
          "name": "path",
          "type": "string",
          "required": true,
          "description": "Exact path of the entry to remove."
        }
      ],
      "returns": "props patch: { entries }"
    }
  ]
}
```

No text (`carriesText: false`), every fact lives in the two props above. The schema is closed (`additionalProperties: false` at every level); definitions live in packages/docs-model/src/components/interaction-surface/state.ts.

- `params` are the shared recursive `Field` node, the same node state-shape fields use (packages/docs-model/src/components/shared/field.ts): a name plus optional `type`, `required`, `description`, and nested `fields`. `required: false` means optional; omitted or `true` reads as required.

- `kind` is a closed vocabulary, `"action" | "query" | "event"`, and omitted reads as action.

- Model-side reads are tolerant: `readInteractionSurfaceOperations` skips malformed entries instead of failing the block, and always returns fresh objects.

## Typed Actions

Three actions maintain the `operations` array. The surface below documents itself.

**interaction-surface operation actions**

```
interaction-surface.addOperation(name: string, description?: string, params?: array, returns?: string, kind?: string, returnShape?: ReturnShape) -> InteractionSurfacePatch  # Rejects duplicate operation names.
  returnShape?: ReturnShape
    fields: Field[]
    example?: string
  Returns InteractionSurfacePatch:
    operations: Operation[]  # Operation signatures, in document order.
      name: string  # Operation signature name, e.g. "file-tree.addEntry".
      description?: string  # Only constraints or behavior not already clear from the signature.
      params?: Field[]  # Shared recursive Field nodes; required: false means optional.
        name: string
        type?: string
        required?: boolean  # false = optional
        description?: string
        fields?: Field[]  # Nested params, the node recurses
      returns?: string  # What the operation returns/yields.
      kind?: "action" | "query" | "event"  # Omitted means action. All three kinds have an explicit badge.
      returnShape?: ReturnShape  # Known object result; omit for void, primitive values, or an unsubscribe function.
        fields: Field[]  # Uses the same recursive field nodes as State Shape.
        example?: string  # JSON instance of the returned object.
interaction-surface.updateOperation(name: string, patch: object) -> InteractionSurfacePatch  # Renames in place; null clears description, params, returns, returnShape, or kind.
  Returns InteractionSurfacePatch:
    operations: Operation[]  # Operation signatures, in document order.
      name: string  # Operation signature name, e.g. "file-tree.addEntry".
      description?: string  # Only constraints or behavior not already clear from the signature.
      params?: Field[]  # Shared recursive Field nodes; required: false means optional.
        name: string
        type?: string
        required?: boolean  # false = optional
        description?: string
        fields?: Field[]  # Nested params, the node recurses
      returns?: string  # What the operation returns/yields.
      kind?: "action" | "query" | "event"  # Omitted means action. All three kinds have an explicit badge.
      returnShape?: ReturnShape  # Known object result; omit for void, primitive values, or an unsubscribe function.
        fields: Field[]  # Uses the same recursive field nodes as State Shape.
        example?: string  # JSON instance of the returned object.
interaction-surface.removeOperation(name: string) -> InteractionSurfacePatch  # Remove the operation with the given name from the surface.
  Returns InteractionSurfacePatch:
    operations: Operation[]  # Operation signatures, in document order.
      name: string  # Operation signature name, e.g. "file-tree.addEntry".
      description?: string  # Only constraints or behavior not already clear from the signature.
      params?: Field[]  # Shared recursive Field nodes; required: false means optional.
        name: string
        type?: string
        required?: boolean  # false = optional
        description?: string
        fields?: Field[]  # Nested params, the node recurses
      returns?: string  # What the operation returns/yields.
      kind?: "action" | "query" | "event"  # Omitted means action. All three kinds have an explicit badge.
      returnShape?: ReturnShape  # Known object result; omit for void, primitive values, or an unsubscribe function.
        fields: Field[]  # Uses the same recursive field nodes as State Shape.
        example?: string  # JSON instance of the returned object.
```

- Operation names are the identity keys: `addOperation` refuses a name that already exists, and `updateOperation` refuses a rename onto an existing name.

- Action params are validated against the shared `FieldSchema` and cloned to plain JSON with only the defined keys.

- Operation order is document order, `addOperation` appends and `updateOperation` patches in place, so curated ordering survives edits.

- Every action returns a props patch of the full `{ operations }` array.

## Doc Renderer

On the doc surface, reader and editor alike, the block renders through `InteractionSurfaceBlock`, in the linked-panels family it shares with state-shape and code. The descriptor reads props strictly: any malformed operation renders the invalid-block placeholder instead of a partial card.

- Each operation has a separate rounded card. The overall title uses title case above the stack. Card order follows authored operation order.

- Each card header shows the operation name and an explicit Action, Query, or Event badge. Action is amber, Query is green-teal, and Event is violet. A restrained curved texture stays in the header.

- Inputs use Field and Type columns on the left and the linked signature on the right. Aligned mini headers and a thin divider preserve the State Shape reading pattern.

- Descriptions appear only when they add information. A described parameter name carries a dotted underline; its description opens as a tooltip after a short hover dwell or on keyboard focus, and prints inline beneath the name. The operation purpose stays inline under the operation name. Nested fields retain their tree branches. A separate output section shows the actual returned object name, recursive fields on the left, and JSON example on the right. Its header has a softer matching tint and a return cue.

- Linking.

  - One link group per operation, line numbering is per-operation, so keys would collide across operations.

  - Hovering or focusing a note lights the param's signature lines and vice versa; a click pins, Escape clears pins.

- Descriptions

  - Parameter and returned-field descriptions use the State Shape tooltip: a dotted underline on the name, a 450 ms hover dwell or keyboard focus, a `role="tooltip"` bubble labelled with the name, and inline text in print media. The rows show only names and types, so the inputs ledger scans as a table.

  - The operation purpose stays a paragraph under the operation name in the card header. It describes the whole operation and reads first; only per-field detail lives in tooltips.

  - Why: the two blocks share one ledger reading pattern, so a reader learns the underline cue once and every field row stays one line tall.

In the editor the type is a non-editable atom leaf node (`DocInteractionSurface`); the node view calls the same descriptor render, so a surface looks identical in view and edit mode. No slash-menu entry, surfaces enter through agent ops or existing content.

## Agent Renderer

The markdown render: an optional `**<title>**` bold line, then a bare fence with one signature line per operation, in document order.

- The signature line: `[kind] name(param: type, optional?: type) -> returns  # description`, the `[kind]` prefix only for query and event, the `-> returns` and `# description` tails only when present.

- Described or nested parameters add indented field lines beneath the signature. A returnShape adds a named Returns section, recursive fields, and the supplied example. Full operation names remain searchable.

- Operation names remain fully dotted in the agent projection. Human-readable card headings do not change stored operation identities.

```

```

[query] table.rowCount() -> number  # How many rows the table hastable.addRow(cells: string[], index?: number) -> props patch  # Insert a row  cells: string[]  # One markdown cell per column

```

```

## Theme

The Theming contract element: theme file `components/interaction-surface.json` in a theme folder (`themes/<id>/`; system docs at Theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY` (packages/docs-workbench/web/src/theme/theme-folders.ts).

| Key | CSS variable | Use |
| --- | --- | --- |
| actionHeaderBg | --docs-operation-action-header-bg | Card header background; light and dark values |
| actionHeaderInk | --docs-operation-action-header-ink | Curved texture and return cue |
| queryHeaderBg | --docs-operation-query-header-bg | Card header background; light and dark values |
| queryHeaderInk | --docs-operation-query-header-ink | Curved texture and return cue |
| eventHeaderBg | --docs-operation-event-header-bg | Card header background; light and dark values |
| eventHeaderInk | --docs-operation-event-header-ink | Curved texture and return cue |
| State Shape tokens | --docs-shape-* | Shared content colors, hierarchy, and separators |
| Legacy interaction tokens | --docs-interaction-* | Retained for compatibility; shared content follows State Shape |

Content uses the approved State Shape palette, typography, chips, mini headers, and separators. Only operation and return headers vary by kind. Linking still uses the shared linked-panels behavior.

## Agent Adapter

The family uses the default adapter: no agent of its own, and nothing forwards to an external authority. The contract is Agent adapter.

Edits arrive as generic doc ops. The three typed actions ride `componentAction`, the doc op beside `insertBlock`, `updateBlock`, `deleteBlock`, `moveBlock`, `splitBlock`, and `mergeBlocks` (see the mutation model). A `componentAction` resolves the named action from the registry, validates its params, applies it to the target block, and lands the resulting `{ operations }` patch through the `updateBlock` code path, the block id is preserved and the inverse is the usual `updateBlock` inverse (packages/docs-model/src/doc-ops.ts).

## Operation Kinds

Action changes state or requests work. Query reads state without changing it. Event describes notifications or observation. These are presentation categories, not new execution mechanisms. A subscription can return an unsubscribe function; that return value is different from the event payload delivered to its callback.

The query example uses the real DocsStore.docGet operation from packages/docs-server/src/store.ts and agent-tools.ts. Its success result includes the document, revision hash, Markdown projection, and bundle path. Failure returns ok: false, status, and detail. The example below is a successful read of a minimal document.

**DocDocument**

```
schemaVersion: 1
id: string
title: string
root: string  # ID of the root block.
blocks: Record<string, DocBlock>
```

```json
{
  "schemaVersion": 1,
  "id": "example",
  "title": "Example",
  "root": "root",
  "blocks": {
    "root": {
      "id": "root",
      "type": "paragraph",
      "props": {},
      "text": [
        {
          "insert": "Example state."
        }
      ],
      "children": []
    }
  }
}
```

**Document Observation**

```
[query] DocsStore.docGet(path: string) -> DocGetResult
  path: string  # Bundle path relative to this store's docs root.
  Returns DocGetResult:
    ok: true
    doc: DocDocument
    hash: string  # Use as the expected revision for a subsequent edit.
    markdown: string
    bundlePath: string
  Example:
    {
      "ok": true,
      "doc": {
        "schemaVersion": 1,
        "id": "example",
        "title": "Example",
        "root": "root",
        "blocks": {
          "root": {
            "id": "root",
            "type": "paragraph",
            "props": {},
            "text": [
              {
                "insert": "Example state."
              }
            ],
            "children": []
          }
        }
      },
      "hash": "7e01e3ded8ac40dea291baff1a553f41e968a5eb5d804557aedadb4c5446b9dd",
      "markdown": "",
      "bundlePath": "example"
    }
[event] DocsStore.subscribeChanges(listener: (event: DocsChangeEvent) => void) -> () => void  # Receives notifications in this process. Call the returned function to unsubscribe.
  listener: (event: DocsChangeEvent) => void
    event: DocsChangeEvent
      path: string
      changedIds: string[]
      patchId: string
      actor: string
```

**DocsChangeEvent**

```
path: string
changedIds: string[]
patchId: string
actor: string
```

```json
{
  "path": "example",
  "changedIds": [
    "root"
  ],
  "patchId": "example-edit",
  "actor": "external-agent"
}
```

DocsChangeEvent is the callback payload, not the subscription return object. The example uses the in-process publishChange and subscribeChanges contract in packages/docs-server/src/docs-events.ts.

## Approved Design and Reuse

Approved in Variator on 2026-09-15 from Tapered Tree List, revision 13c3f549-e558-4eec-b1bc-144d8a3d86ee. Apply d72f0fe6-cbdd-48a4-9b63-4dba3fb2c19a used a real Kernel agent and passed 40 exact visual comparisons. The component design/approval.json package retains the original feedback, scoped decisions, revisions, and events. Earlier all-amber headers and blue Query styling are historical, superseded choices.

Description tooltips on parameter and returned-field names were approved on 2026-09-24 as a ledger decision shared with State Shape. The operation purpose paragraph staying inline in the card header is an Interaction Surface decision from the same review.

Reuse the State Shape content palette, typography, spacing, restrained texture, and thin separators. Do not turn its blue identity or field-only layout into a rule for every component. Operation cards, kind colors, inputs before outputs, and softly tinted return headers are Interaction Surface decisions. Exact green-teal and violet tones and the 48 percent return tint were implementer choices accepted with the final design.
