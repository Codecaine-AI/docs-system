The operation list of the block vocabulary, and the other half of its documentation doctrine: where an annotated code block shows what a system's state *is*, an interaction-surface lists the named operations by which that state is changed or queried.

## State

| prop | type | required | notes |
| --- | --- | --- | --- |
| title | string | no | Optional bold caption above the surface. |
| operations | array | yes | Array of { name, description?, params?, returns?, kind? } — see below. |

**One operation**

| prop | type | required | notes |
| --- | --- | --- | --- |
| name | string | yes | Operation signature name, e.g. "file-tree.addEntry". |
| description | string | no | One-liner rendered as a # suffix. |
| params | array | no | [{ name, type?, required?, description? }] — required: false renders a ? suffix. |
| returns | string | no | What the operation returns/yields. |
| kind | "action" / "query" / "event" | no | Defaults to action; only query/event render a [kind] prefix. |

No text (`carriesText: false`).

## Markdown render

An optional `**<title>**` bold line, then a bare fence with one signature line per operation, in document order:

```
[query] table.rowCount() -> number  # How many rows the table has
table.addRow(cells: string[], index?: number) -> props patch  # Insert a row
```

## Typed actions

Yes — the surface documents itself: three actions maintain the `operations` array. `addOperation` rejects a duplicate name; `updateOperation` renames via `patch.name` and clears `description`/`params`/`returns`/`kind` with `null`.

**interaction-surface — operation actions**

```
interaction-surface.addOperation(name: string, description?: string, params?: array, returns?: string, kind?: string) -> props patch: { operations }  # Append an operation signature ({ name, description?, params?, returns?, kind? }) to the surface.
interaction-surface.updateOperation(name: string, patch: object) -> props patch: { operations }  # Patch an operation (rename via patch.name; null clears description/params/returns/kind).
interaction-surface.removeOperation(name: string) -> props patch: { operations }  # Remove the operation with the given name from the surface.
```

## In the editor

A non-editable atom leaf node rendered by `InteractionSurfaceDocsBlock`. No slash-menu entry today — surfaces enter through agent ops or existing content.

## Agent notes

- When documenting a system, pair one of these with an annotated code block: state first, then the operations on it.

- Operation order is document order — `addOperation` appends, and `updateOperation` patches in place, so curated ordering survives edits.

## Theming

This block's theme file is `components/interaction-surface.json` in a theme folder (`themes/<id>/`; see 20-implementation/40-theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`.

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-interaction-border | Container border |
| bg | --docs-interaction-bg | Container background |
