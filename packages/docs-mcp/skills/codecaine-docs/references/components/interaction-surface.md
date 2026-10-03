# interaction-surface

Generated from Codecaine Docs sources. Snapshot: `sha256:df3a4be4499081f6aeab443ed890b96811fe78b263b4e16687f66296bf815cbf`. Refresh the installation to regenerate these files.

Use Interaction Surface to describe the actions, queries, and events available on a state or system, including parameters and return values. Action changes state, Query reads state, and Event describes observation or notification. Each operation is one collapsed row. Hovering its name shows the kind and purpose, and opening it shows Parameters and Returns cards. Use returnShape with recursive fields and a JSON example for known object returns; keep returns for its name or a primitive type. Add exampleCall with the code text of one real example invocation (authored values, never invented). Document callback payloads separately from subscription return values. Describe only non-obvious constraints or behavior. Pair it with State Shape. Use Sequence when the question concerns ordering between participants.

Example: Document openDocument, applyOperations, and checkDocument with their parameters and results.

Canonical document: `10-system-design/40-block-vocabulary/40-structured-reference/20-interaction-surface`.

The interaction-surface component owns one block type, `interaction-surface`: the operation list of the block vocabulary. A surface lists the named operations by which a state or system is changed, queried, or observed, operation signatures on a state, not HTTP endpoints. When documenting agentic systems it is one of the three types that carry the whole model: a state-shape block holds the state, shape and example instance side by side, the interaction-surface lists the operations on it, and code blocks hold the source evidence. State first, then operations.

When creating or revising a worked component example, show the relevant state shape with a concrete instance, the real operation signature, and its returned shape beside example data. Use one consistent scenario across all three. Verify fields and return semantics against source. Identify whether the result is a props patch, full state, or response envelope. For void, primitive, or event results, document the actual result or payload instead of inventing an object. Descriptions should add non-obvious information.

Descriptions should add non-obvious information about operations, parameters, and returned fields. Omit text that only expands a name, repeats a type, or says an ID is an identifier. Keep constraints, defaults, side effects, failure behavior, lifecycle rules, and other facts the signature does not express. Follow the State Shape description rule. Do not invent details to fill missing descriptions.

## Example

This example starts with one file-tree entry. Adding src/config.ts returns the complete entries props patch. Removing src/index.ts from the same starting state returns an empty entries list. Each example starts independently from FileTreeState.

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
  Example call:
    file-tree.addEntry({
      path: "src/config.ts",
      change: "added",
    })
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
  Example call:
    file-tree.removeEntry({
      path: "src/index.ts",
    })
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

No text (`carriesText: false`), every fact lives in the two props above. The schema is closed (`additionalProperties: false` at every level). Definitions live in packages/docs-model/src/components/interaction-surface/state.ts.

- `params` are the shared recursive `Field` node, the same node state-shape fields use (packages/docs-model/src/components/shared/field.ts): a name plus optional `type`, `required`, `description`, and nested `fields`. `required: false` means optional; omitted or `true` reads as required.

- `kind` is a closed vocabulary, `"action" | "query" | "event"`, and omitted reads as action.

- Model-side reads are tolerant: `readInteractionSurfaceOperations` skips malformed entries instead of failing the block, and always returns fresh objects.

## Typed Actions

Three actions maintain the `operations` array. The surface below documents itself, and its examples start from a surface that holds only `file-tree.addEntry`.

**interaction-surface operation actions**

```
interaction-surface.addOperation(name: string, description?: string, params?: array, returns?: string, kind?: string, returnShape?: ReturnShape) -> InteractionSurfacePatch  # Rejects duplicate operation names.
  returnShape?: ReturnShape
    fields: Field[]
    example?: string
  Example call:
    interaction-surface.addOperation({
      name: "file-tree.removeEntry",
      params: [{ name: "path", type: "string" }],
      returns: "FileTreeEntriesPatch",
      kind: "action",
    })
  Returns InteractionSurfacePatch:
    operations: Operation[]  # The complete replacement operation list, not only the changed operation.
      name: string
      description?: string
      params?: Field[]
      returns?: string
      kind?: "action" | "query" | "event"
  Example:
    {
      "operations": [
        {
          "name": "file-tree.addEntry",
          "kind": "action"
        },
        {
          "name": "file-tree.removeEntry",
          "params": [
            {
              "name": "path",
              "type": "string"
            }
          ],
          "returns": "FileTreeEntriesPatch",
          "kind": "action"
        }
      ]
    }
interaction-surface.updateOperation(name: string, patch: object) -> InteractionSurfacePatch  # Renames in place; null clears description, params, returns, returnShape, or kind.
  Example call:
    interaction-surface.updateOperation({
      name: "file-tree.removeEntry",
      patch: { description: "Removes only the exact matching path." },
    })
  Returns InteractionSurfacePatch:
    operations: Operation[]  # The complete replacement operation list, not only the changed operation.
      name: string
      description?: string
      params?: Field[]
      returns?: string
      kind?: "action" | "query" | "event"
  Example:
    {
      "operations": [
        {
          "name": "file-tree.addEntry",
          "kind": "action"
        },
        {
          "name": "file-tree.removeEntry",
          "description": "Removes only the exact matching path.",
          "params": [
            {
              "name": "path",
              "type": "string"
            }
          ],
          "returns": "FileTreeEntriesPatch",
          "kind": "action"
        }
      ]
    }
interaction-surface.removeOperation(name: string) -> InteractionSurfacePatch  # Remove the operation with the given name from the surface.
  Example call:
    interaction-surface.removeOperation({
      name: "file-tree.removeEntry",
    })
  Returns InteractionSurfacePatch:
    operations: Operation[]  # The complete replacement operation list, not only the changed operation.
      name: string
      description?: string
      params?: Field[]
      returns?: string
      kind?: "action" | "query" | "event"
  Example:
    {
      "operations": [
        {
          "name": "file-tree.addEntry",
          "kind": "action"
        }
      ]
    }
```

- Operation names are the identity keys: `addOperation` refuses a name that already exists, and `updateOperation` refuses a rename onto an existing name.

- Action params are validated against the shared `FieldSchema` and cloned to plain JSON with only the defined keys.

- Operation order is document order, `addOperation` appends and `updateOperation` patches in place, so curated ordering survives edits.

- Every action returns a props patch of the full `{ operations }` array.

## Doc Renderer

On the doc surface, reader and editor alike, the block renders through `InteractionSurfaceBlock`, in the linked-panels family it shares with state-shape and code. The descriptor reads props strictly: any malformed operation renders the invalid-block placeholder instead of a partial card.

- Operations sit as rows in one dark panel under the surface title, in authored order.

- A closed row is one line, `receiver.method(…) → ReturnType`. Hovering or focusing the operation name opens a tooltip with the Action, Query, or Event badge and the operation purpose.

- An open operation shows a Parameters card and a Returns card. Each card lists fields on the left and shows code on the right, the authored `exampleCall` or the example return object.

- **Descriptions appear only when they add information**

  - A described parameter name carries a dotted underline, and its description opens as a tooltip on hover or keyboard focus.

  - The operation purpose shows in the tooltip on the operation name.

  - Nested fields hang off their parent with the file tree's elbow connectors.

  - A separate output section shows the returned object name, its recursive fields on the left, and a JSON example on the right.

- Linking.

  - One link group per operation, line numbering is per-operation, so keys would collide across operations.

  - Hovering or focusing a note lights the param's signature lines and vice versa. A click pins, Escape clears pins.

- Descriptions

  - Parameter and returned-field descriptions use the State Shape tooltip, with a dotted underline on the name, a 450 ms hover dwell or keyboard focus, a `role="tooltip"` bubble, and inline text in print media. The rows show only names and types, so the inputs ledger scans as a table.

  - The operation purpose and kind badge share one tooltip on the operation name. Print media prints both inline under the name.

  - Why: the two blocks share one ledger reading pattern, so a reader learns the underline cue once and every field row stays one line tall.

In the editor the type is a non-editable atom leaf node (`DocInteractionSurface`). The node view calls the same descriptor render, so a surface looks identical in view and edit mode. No slash-menu entry, surfaces enter through agent ops or existing content.

## Agent Renderer

The markdown render is an optional `**<title>**` bold line, then a bare fence with one signature line per operation, in document order.

- The signature line is `[kind] name(param: type, optional?: type) -> returns  # description`, the `[kind]` prefix only for query and event, the `-> returns` and `# description` tails only when present.

- Described or nested parameters add indented field lines beneath the signature. A returnShape adds a named Returns section, recursive fields, and the supplied example. Full operation names remain searchable.

- Operation names remain fully dotted in the agent projection. Human-readable card headings do not change stored operation identities.

```

```

[query] table.rowCount() -> number  # How many rows the table hastable.addRow(cells: string[], index?: number) -> props patch  # Insert a row  cells: string[]  # One markdown cell per column

```

```

## Theme

The Theming contract element: theme file `components/interaction-surface.json` in the active theme folder. By default that folder is the Global theme at `~/.local/state/codecaine-docs/themes/global/`. A repo `themes/<id>/` folder is active only when the host serves no Global theme. Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY` (packages/docs-workbench/web/src/theme/theme-folders.ts).

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

Content uses the shared field ledger and the code theme's syntax colors. Only the kind badge varies by kind. Linking uses the shared linked-panels behavior.

## Agent Adapter

The family uses the default adapter: no agent of its own, and nothing forwards to an external authority. The contract is Agent adapter.

Edits arrive as generic doc ops. The three typed actions ride `componentAction`, the doc op beside `insertBlock`, `updateBlock`, `deleteBlock`, `moveBlock`, `splitBlock`, and `mergeBlocks` (see the mutation model). A `componentAction` resolves the named action from the registry, validates its params, applies it to the target block, and lands the resulting `{ operations }` patch through the `updateBlock` code path, the block id is preserved and the inverse is the usual `updateBlock` inverse (packages/docs-model/src/doc-ops.ts).

## Operation Kinds

Action changes state or requests work. Query reads state without changing it. Event describes notifications or observation. These are presentation categories, not new execution mechanisms. A subscription can return an unsubscribe function. That return value is different from the event payload delivered to its callback.

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
  Example call:
    DocsStore.docGet("example")
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
  Example call:
    const unsubscribe = DocsStore.subscribeChanges((event) => {
      console.log(event.path, event.changedIds);
    });
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

Approved in Variator on 2026-09-15 from Tapered Tree List, revision 13c3f549-e558-4eec-b1bc-144d8a3d86ee. Apply d72f0fe6-cbdd-48a4-9b63-4dba3fb2c19a used a real Kernel agent and passed 40 exact visual comparisons. The component design/approval.json package keeps the original feedback, scoped decisions, revisions, and events. Earlier all-amber headers and blue Query styling are historical, superseded choices.

Description tooltips on parameter and returned-field names were approved on 2026-09-24 as a ledger decision shared with State Shape. On 2026-10-02 the operation purpose and kind badge moved into a tooltip on the operation name, so neither takes space on screen.

Reuse the State Shape field ledger, typography, and thin separators. One-line closed rows, the kind and purpose tooltip, and separate Parameters and Returns cards with list and code side by side are Interaction Surface decisions.

