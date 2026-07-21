The operation list of the block vocabulary, and the operations surface of its documentation doctrine: where a state-shape block carries a system's state — shape and example instance side by side — an interaction-surface lists the named operations by which that state is changed or queried; code blocks carry the source evidence.

## Example

A live surface — two of the `file-tree` block's entry operations, described params rendering as note lines:

**file-tree — entry operations**

```
file-tree.addEntry(path: string, note?: string, change?: "added" | "removed" | "modified" | "renamed") -> props patch: { entries }  # Append a path entry (optional note and change marker) to the file tree.
  path: string  # /-separated path, no leading "./"; a trailing "/" marks an explicit directory.
  note?: string  # Short annotation rendered after the path.
  change?: "added" | "removed" | "modified" | "renamed"  # Change marker rendered as a badge.
file-tree.removeEntry(path: string) -> props patch: { entries }  # Remove the entry with the given path from the file tree.
  path: string  # Exact path of the entry to remove.
```

## State

**InteractionSurfaceState** — packages/docs-model/src/components/interaction-surface/state.ts#InteractionSurfaceState

```
title?: string  # Optional bold caption above the surface.
operations: Operation[]  # Operation signatures, in document order.
  name: string  # Operation signature name, e.g. "file-tree.addEntry".
  description?: string  # One-liner rendered as a # suffix.
  params?: Field[]  # Recursive field nodes; required: false renders a ? suffix.
    name: string
    type?: string
    required?: boolean  # false = optional
    description?: string
    fields?: Field[]  # Nested params — the node recurses
  returns?: string  # What the operation returns/yields.
  kind?: "action" | "query" | "event"  # Defaults to action; only query/event render a [kind] prefix.
```

No text (`carriesText: false`).

## Typed actions

Yes — the surface documents itself: three actions maintain the `operations` array. `addOperation` rejects a duplicate name; `updateOperation` renames via `patch.name` and clears `description`/`params`/`returns`/`kind` with `null`.

**interaction-surface — operation actions**

```
interaction-surface.addOperation(name: string, description?: string, params?: array, returns?: string, kind?: string) -> props patch: { operations }  # Append an operation signature ({ name, description?, params?, returns?, kind? }) to the surface.
interaction-surface.updateOperation(name: string, patch: object) -> props patch: { operations }  # Patch an operation (rename via patch.name; null clears description/params/returns/kind).
interaction-surface.removeOperation(name: string) -> props patch: { operations }  # Remove the operation with the given name from the surface.
```

## Renderers

In the editor, a non-editable atom leaf node rendered by `InteractionSurfaceDocsBlock`: one multi-line entry per operation, params always visible. No slash-menu entry today — surfaces enter through agent ops or existing content.

The markdown projection: an optional `**<title>**` bold line, then a bare fence with one signature line per operation, in document order. A param carrying a description or nested fields adds indented detail lines beneath its signature — two-space indent per depth, `<name><?>: <type>  # <description>`:

```
[query] table.rowCount() -> number  # How many rows the table has
table.addRow(cells: string[], index?: number) -> props patch  # Insert a row
  cells: string[]  # One markdown cell per column
```

## Agent notes

- When documenting a system, pair one of these with a state-shape block carrying both the shape and an example instance: state first, then the operations on it.

- Operation order is document order — `addOperation` appends, and `updateOperation` patches in place, so curated ordering survives edits.

## Theming

This block's theme file is `components/interaction-surface.json` in a theme folder (`themes/<id>/`; see 20-implementation/40-theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`.

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-interaction-border | Container border |
| bg | --docs-interaction-bg | Container background |
