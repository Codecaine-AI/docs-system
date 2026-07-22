The interaction-surface component owns one block type, `interaction-surface`: the operation list of the block vocabulary. A surface lists the named operations by which a state or system is changed, queried, or observed — operation signatures on a state, not HTTP endpoints. When documenting agentic systems it is one of the three types that carry the whole model: a state-shape block holds the state — shape and example instance side by side — the interaction-surface lists the operations on it, and code blocks hold the source evidence. State first, then operations.

## Example

A live surface — two of the file-tree block's entry operations. Each operation renders as its own card: signature left, description and param notes right; hovering a note lights the param's signature lines.

**file-tree — entry operations**

```
file-tree.addEntry(path: string, note?: string, change?: "added" | "removed" | "modified" | "renamed") -> props patch: { entries }  # Append a path entry (optional note and change marker) to the file tree.
  path: string  # /-separated path, no leading "./"; a trailing "/" marks an explicit directory.
  note?: string  # Short annotation rendered after the path.
  change?: "added" | "removed" | "modified" | "renamed"  # Change marker rendered as a badge.
file-tree.removeEntry(path: string) -> props patch: { entries }  # Remove the entry with the given path from the file tree.
  path: string  # Exact path of the entry to remove.
```

## State Schema

**InteractionSurfaceState** — packages/docs-model/src/components/interaction-surface/state.ts#InteractionSurfaceState

```
title?: string  # Optional bold caption above the surface.
operations: Operation[]  # Operation signatures, in document order.
  name: string  # Operation signature name, e.g. "file-tree.addEntry".
  description?: string  # One-line description of what the operation does.
  params?: Field[]  # Shared recursive Field nodes; required: false means optional.
    name: string
    type?: string
    required?: boolean  # false = optional
    description?: string
    fields?: Field[]  # Nested params — the node recurses
  returns?: string  # What the operation returns/yields.
  kind?: "action" | "query" | "event"  # Defaults to action; renders mark only query and event.
```

No text (`carriesText: false`) — every fact lives in the two props above. The schema is closed (`additionalProperties: false` at every level); definitions live in `packages/docs-model/src/components/interaction-surface/state.ts`.

- `params` are the shared recursive `Field` node — the same node state-shape fields use (`packages/docs-model/src/components/shared/field.ts`): a name plus optional `type`, `required`, `description`, and nested `fields`. `required: false` means optional; omitted or `true` reads as required.

- `kind` is a closed vocabulary — `"action" | "query" | "event"` — and omitted reads as action.

- Model-side reads are tolerant: `readInteractionSurfaceOperations` skips malformed entries instead of failing the block, and always returns fresh objects.

## Typed Actions

Three actions maintain the `operations` array — one file each in `packages/docs-model/src/components/interaction-surface/actions`. The surface below documents itself.

**interaction-surface — operation actions**

```
interaction-surface.addOperation(name: string, description?: string, params?: array, returns?: string, kind?: string) -> props patch: { operations }  # Append an operation signature ({ name, description?, params?, returns?, kind? }) to the surface.
interaction-surface.updateOperation(name: string, patch: object) -> props patch: { operations }  # Patch an operation (rename via patch.name; null clears description/params/returns/kind).
interaction-surface.removeOperation(name: string) -> props patch: { operations }  # Remove the operation with the given name from the surface.
```

- Operation names are the identity keys: `addOperation` refuses a name that already exists, and `updateOperation` refuses a rename onto an existing name.

- Action params are validated against the shared `FieldSchema` and cloned to plain JSON with only the defined keys.

- Operation order is document order — `addOperation` appends and `updateOperation` patches in place, so curated ordering survives edits.

- Every action returns a props patch of the full `{ operations }` array.

## Doc Renderer

On the doc surface — reader and editor alike — the block renders through `InteractionSurfaceBlock` in `packages/docs-viewer/src/components/interaction-surface/InteractionSurfaceDocsBlock.tsx`, in the linked-panels family it shares with state-shape and code. The descriptor (`packages/docs-viewer/src/components/interaction-surface/descriptor.tsx`) reads props strictly: any malformed operation renders the invalid-block placeholder instead of a partial card.

- One card per operation.

  - An optional bold title caption sits above the stack; the block itself has no header bar.

  - Each card splits into a signature pane and a notes pane; when no operation carries a description or params, the block collapses to single-column signature cards.

- Operation header band.

  - The humanized name: `addOperation` reads "Add Operation".

  - The component namespace is stripped when the bare verbs stay unique within the block; a collision falls back to full dotted names. The agent render keeps full names either way.

  - `query` and `event` carry a kind badge beside the name; `action` is the unbadged default.

- Signature pane.

  - Line-numbered, zebra-striped code lines; numbering restarts at 1 per operation.

  - The grammar: a `name(` opening line, one `param?: type,` line per param at two spaces per depth (`?` marks `required: false`; an object param opens `name: {` and closes `},`), then a closing `) -> returns` line. Zero-param operations stay on one line.

  - Token tints are deterministic spans over this grammar — the operation name, param types, and the returns tail each carry their own token color; no highlight.js.

- Notes pane.

  - The operation description under a "Description" band, then one note row per param: bold mono name, muted `· type` sub-label, the description beneath where one exists.

  - An object param's nested notes group behind a light left rule, one step per depth.

- Linking.

  - One link group per operation — line numbering is per-operation, so keys would collide across operations.

  - Hovering or focusing a note lights the param's signature lines and vice versa; a click pins, Escape clears pins.

In the editor the type is a non-editable atom leaf node (`DocInteractionSurface`, `packages/docs-viewer/src/components/interaction-surface/editor-nodes.ts`); the node view calls the same descriptor render, so a surface looks identical in view and edit mode. No slash-menu entry — surfaces enter through agent ops or existing content.

## Agent Renderer

The markdown render (`packages/docs-model/src/components/interaction-surface/agent-view.ts`): an optional `**<title>**` bold line, then a bare fence with one signature line per operation, in document order.

- The signature line: `[kind] name(param: type, optional?: type) -> returns  # description` — the `[kind]` prefix only for query and event, the `-> returns` and `# description` tails only when present.

- A param carrying a description or nested fields adds indented detail lines beneath its signature, in the shared field-line grammar: two-space indent per depth, `<name><?>: <type>  # <description>`.

- Operation names stay fully dotted — the greppable identity; only the doc renderer strips namespaces.

```
[query] table.rowCount() -> number  # How many rows the table has
table.addRow(cells: string[], index?: number) -> props patch  # Insert a row
  cells: string[]  # One markdown cell per column
```

## Theme

This block's theme file is `components/interaction-surface.json` in a theme folder (`themes/<id>/`; see Theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY` (`packages/docs-workbench/web/src/theme/theme-folders.ts`).

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-interaction-border | Card border |
| bg | --docs-interaction-bg | Card background |
| rule | --docs-interaction-rule | Internal hairlines: row dividers and the column rule |
| headerBg | --docs-interaction-header-bg | Section header band background |
| headerFg | --docs-interaction-header-fg | Section header band text |
| sigName | --docs-interaction-sig-name | Operation name in the signature |
| sigType | --docs-interaction-sig-type | Param types and the -> returns tail |
| sigPunct | --docs-interaction-sig-punct | Signature punctuation and the ? marker |
| noteName | --docs-interaction-note-name | Param note name |
| noteType | --docs-interaction-note-type | Param note · type sub-label |
| noteFg | --docs-interaction-note-fg | Note text |
| childRule | --docs-interaction-child-rule | Left rule grouping an object param's nested notes |
| rowPad | --docs-interaction-row-pad | Note row padding (length slider, 4–16px, default 8) |
| opGap | --docs-interaction-op-gap | Gap between operation cards (length slider, 6–28px, default 14) |

The zebra stripe, link wash, and pin accent come from the shared linking file (`components/linking.json`) — registered once for the linked-panels layer, not per component.

## Agent Adapter

The family uses the default adapter: no agent of its own, and nothing forwards to an external authority. The contract is Agent adapter.

Edits arrive as generic doc ops. The three typed actions ride `componentAction` — the seventh op beside `insertBlock`, `updateBlock`, `deleteBlock`, `moveBlock`, `splitBlock`, and `mergeBlocks` (see the mutation model). A `componentAction` resolves the named action from the registry, validates its params, applies it to the target block, and lands the resulting `{ operations }` patch through the `updateBlock` code path — the block id is preserved and the inverse is the usual `updateBlock` inverse (`packages/docs-model/src/doc-ops.ts`).
