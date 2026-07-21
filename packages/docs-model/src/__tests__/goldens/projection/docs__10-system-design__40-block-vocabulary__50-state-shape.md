The object-shape block of the block vocabulary, and the state carrier of its documentation doctrine: a state-shape shows what a structure's state looks like — a recursive field tree of name, type, optionality, and meaning — beside a linked JSON example instance of that shape. An interaction-surface lists the operations on that state; code blocks carry annotated source evidence.

## Example

A live instance: a compact theme shape beside its linked JSON example pane. The shape that documents this block's own state sits under State below.

**TableTheme**

```
accent: string  # Accent rule color.
headerBg?: string | { light, dark }  # Header row background; one value or a per-mode pair.
slider?: object  # Numeric control metadata.
  kind: "color" | "length" | "number"
  max?: number
```

```json
{
  "accent": "#6d4cf0",
  "headerBg": {
    "light": "#f5f2ff",
    "dark": "#262040"
  },
  "slider": {
    "kind": "length",
    "max": 24
  }
}
```

## State

**StateShapeState** — packages/docs-model/src/components/state-shape/state.ts#StateShapeState

```
name?: string  # Bold header-line label; usually the type name.
description?: string  # Prose summary of the shape; not part of the markdown render.
source?: object  # Defining source location; renders as an em-dash suffix on the header line.
  path: string  # Path of the defining source file.
  symbol?: string  # Symbol within that file; renders as a #symbol suffix.
fields: Field[]  # The recursive field tree, in document order.
  name: string  # Field name; unique among siblings — dot-path addressing depends on it.
  type?: string  # Type text, rendered after a colon.
  required?: boolean  # false = optional and renders a ? suffix; omitted or true reads as required.
  description?: string  # One-liner rendered as a # suffix.
  fields?: Field[]  # Child fields, rendered two spaces deeper; the node recurses.
example?: string  # JSON text of an example instance of this shape; renders as the linked example pane.
```

```json
{
  "name": "StateShapeState",
  "source": {
    "path": "packages/docs-model/src/components/state-shape/state.ts",
    "symbol": "StateShapeState"
  },
  "fields": [
    {
      "name": "name",
      "type": "string",
      "required": false,
      "description": "Bold header-line label."
    },
    {
      "name": "source",
      "type": "object",
      "required": false,
      "fields": [
        {
          "name": "path",
          "type": "string"
        },
        {
          "name": "symbol",
          "type": "string",
          "required": false
        }
      ]
    }
  ]
}
```

No text (`carriesText: false`).

## Typed actions

Four actions: three maintain the `fields` tree, addressed by dot-path over sibling-unique field names — `"operations.params"` names the `params` field under `operations`, `""` (or an omitted path) the root array. `addField` rejects a duplicate sibling name; `updateField` renames via `patch.name`, clears `type`/`required`/`description` with `null`, and replaces the whole subtree via `patch.fields` (`null` removes it); `removeField` takes the subtree with it. `setExample` sets or clears the JSON example — `example` must parse as JSON; `null` clears it.

**state-shape — actions**

```
state-shape.addField(field: Field, path?: string, index?: integer) -> props patch: { fields }  # Insert a field ({ name, type?, required?, description?, fields? }) under the parent named by path; index defaults to the end.
  field: Field  # The field to insert.
    name: string
    type?: string
    required?: boolean  # false = optional
    description?: string
    fields?: Field[]  # Nested children — the node recurses
  path?: string  # Dot-path of the PARENT field; "" or omitted inserts into the root fields array.
  index?: integer  # Insert position among the parent's fields; default end.
state-shape.updateField(path: string, patch: object) -> props patch: { fields }  # Patch the field at path (rename via patch.name; null clears type/required/description; patch.fields replaces the subtree, null removes it).
  path: string  # Dot-path of the field to patch, e.g. "operations.params".
  patch: object  # Partial field; patch.name renames, null clears.
    name?: string  # Rename; must stay unique among siblings.
    type?: string | null
    required?: boolean | null
    description?: string | null
    fields?: Field[] | null  # Replaces the subtree; null removes it.
state-shape.removeField(path: string) -> props patch: { fields }  # Remove the field at path, together with its entire subtree.
  path: string  # Dot-path of the field to remove, e.g. "operations.params".
state-shape.setExample(example: string | null) -> props patch: { example }  # Set the JSON example instance rendered beside the field tree (example must parse as JSON; null clears it).
  example: string | null  # JSON text of an example instance of this shape; null clears the example.
```

## Renderers

In the editor: a non-editable atom leaf node rendered by `StateShapeDocsBlock`. No slash-menu entry today — shapes enter through agent ops or existing content.

In the markdown render: a `**<name>**` bold line — ` — <path>#<symbol>` suffixed when a source is present — then a bare fence, one field per line in document order: two-space indent per nesting depth, a `?` suffix when `required: false`, `: <type>` after the name, `# <description>` at the end of the line. When an `example` is present, a blank line and a fenced `json` code block follow, holding the example pretty-printed through the shared `printJsonLines` canon:

```
title?: string
columns: TableCell[]  # Header cells
  insert: string
  attributes?: DeltaSpanAttributes
rows: TableCell[][]
```

```json
{
  "title": "Latency by route",
  "columns": [
    {
      "insert": "Route"
    },
    {
      "insert": "p95"
    }
  ],
  "rows": [
    [
      {
        "insert": "/docs"
      },
      {
        "insert": "120 ms"
      }
    ]
  ]
}
```

## Agent notes

- When documenting a system, lead with one of these carrying both the shape and a real example instance (`setExample`), then an interaction-surface for the operations: state first, then operations. A code block below is only for material that is not an instance of the shape — a real source listing, for example.

- Field order is document order — `addField` appends by default and inserts at `index` when given, so curated ordering survives edits.

## Theming

This block's theme file is `components/state-shape.json` in a theme folder (`themes/<id>/`; see 20-implementation/40-theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`.

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-shape-border | Container border |
| bg | --docs-shape-bg | Container background |
| name | --docs-shape-name | Shape name in the header line |
| type | --docs-shape-type | Field type text |
| muted | --docs-shape-muted | Muted detail text — optionality markers and descriptions |
| rule | --docs-shape-rule | Rule between the header line and the field tree |

Example-pane and range-chip linking styles come from the shared linking theme component (`components/linking.json`), registered once for every linked panel: Zebra stripe (`zebra` → `--docs-zebra`), Link highlight (`highlight` → `--docs-link-bg`), Pin & rail (`pin` → `--docs-link-pin`).
