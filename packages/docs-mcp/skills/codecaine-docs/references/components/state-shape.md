# state-shape

Generated from Codecaine Docs sources. Snapshot: `sha256:df48bff505633507af34872daf2950bc392aeeae845c9eb67ff4956ad352fb08`. Refresh the installation to regenerate these files.

Use State Shape to define persisted or in-memory state, its nested fields, optionality, and meaning. Include a JSON example instance and a defining source reference. Describe state before the Interaction Surface that changes or queries it.

Example: Define an edit task with its project, revision, and status, then show one valid task instance.

Canonical document: `10-system-design/40-block-vocabulary/40-structured-reference/10-state-shape`.

The state-shape component owns one block type, `state-shape`, the object-shape block of the block vocabulary. A block carries a recursive field tree, name, type, optionality, meaning, an optional link to the defining source symbol, and an optional JSON example instance rendered beside the tree.

When creating or revising a worked component example, show the relevant state shape with a concrete instance, the real operation signature, and its returned shape beside example data. Use one consistent scenario across all three. Verify fields and return semantics against source; identify whether the result is a props patch, full state, or response envelope. For void, primitive, or event results, document the actual result or payload instead of inventing an object. Descriptions should add non-obvious information.

It is the state carrier of the corpus documentation doctrine: a state-shape block carries the shape of state and an example instance side by side, an interaction-surface lists the operations that change or query it, and annotated code blocks hold the source evidence. State first, then operations; a code block is for material that is not an instance of the shape, a real source listing.

Write field and type descriptions only when they add information beyond the name, type, nesting, and optionality. Omit restatements such as "Record identifier" for recordId or "Source to capture" for source. Keep non-obvious constraints, units, defaults, ownership, null meaning, side effects, or lifecycle rules. For a path, "Path to the source" adds nothing; "Relative to the repository root" adds a useful constraint. Do not invent semantics to fill an empty description. This rule also applies to Interaction Surface parameters and returned fields.

## Example

A live instance: a compact theme shape beside its linked JSON example pane. The shape documenting this block's own state sits under State Schema below.

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

Starting with the TableTheme field definition above, call state-shape.addField with field { name: "enabled", type: "boolean" }. Omit path and index to append at the root. StateShapeFieldsPatch below names the returned props object; it is not the action success envelope.

**Edit the Field Definition**

```
state-shape.addField(field: Field, path?: string, index?: integer) -> StateShapeFieldsPatch  # Rejects duplicate sibling names; omitted path and index append at the root.
  field: Field
    name: string  # Unique among siblings.
    type?: string
    required?: boolean  # Omitted means required.
    description?: string
    fields?: Field[]  # Recurses with the same field contract.
  path?: string  # Dot-path of the parent; empty or omitted selects the root.
  index?: integer  # Position among siblings; omitted appends.
  Returns StateShapeFieldsPatch:
    fields: Field[]  # The complete replacement field list, not only the added field.
      name: string  # Unique among siblings.
      type?: string
      required?: boolean  # Omitted means required.
      description?: string
      fields?: Field[]  # Recurses with the same field contract.
  Example:
    {
      "fields": [
        {
          "name": "accent",
          "type": "string",
          "description": "Accent rule color."
        },
        {
          "name": "headerBg",
          "type": "string | { light, dark }",
          "required": false,
          "description": "Header row background; one value or a per-mode pair."
        },
        {
          "name": "slider",
          "type": "object",
          "required": false,
          "description": "Numeric control metadata.",
          "fields": [
            {
              "name": "kind",
              "type": "\"color\" | \"length\" | \"number\""
            },
            {
              "name": "max",
              "type": "number",
              "required": false
            }
          ]
        },
        {
          "name": "enabled",
          "type": "boolean"
        }
      ]
    }
```

**StateShapeFieldsPatch**

```
fields: Field[]  # The complete replacement field list, not only the added field.
  name: string  # Unique among siblings.
  type?: string
  required?: boolean  # Omitted means required.
  description?: string
  fields?: Field[]  # Recurses with the same field contract.
```

```json
{
  "fields": [
    {
      "name": "accent",
      "type": "string",
      "description": "Accent rule color."
    },
    {
      "name": "headerBg",
      "type": "string | { light, dark }",
      "required": false,
      "description": "Header row background; one value or a per-mode pair."
    },
    {
      "name": "slider",
      "type": "object",
      "required": false,
      "description": "Numeric control metadata.",
      "fields": [
        {
          "name": "kind",
          "type": "\"color\" | \"length\" | \"number\""
        },
        {
          "name": "max",
          "type": "number",
          "required": false
        }
      ]
    },
    {
      "name": "enabled",
      "type": "boolean"
    }
  ]
}
```

## State Schema

The State schema contract element: all state lives in typed props, defined by `StateShapeState` in `packages/docs-model/src/components/state-shape/state.ts`. The type carries no delta text (`carriesText: false`).

**StateShapeState** — packages/docs-model/src/components/state-shape/state.ts#StateShapeState

```
name?: string  # Bold header-line label; usually the type name.
description?: string  # Prose summary of the shape; not part of the markdown render.
source?: object  # Defining source location; renders as an em-dash suffix on the header line.
  path: string  # Path of the defining source file.
  symbol?: string  # Symbol within that file; renders as a #symbol suffix.
fields: Field[]  # The recursive field tree, in document order.
  name: string  # Field name; unique among siblings, dot-path addressing depends on it.
  type?: string  # Type text, drawn in the code theme's type color. String literal members take the string color, and union pipes take the punctuation color.
  required?: boolean  # false marks the field optional and adds a ? after its name. Omitted or true reads as required.
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

- `fields` is the one required key; `name`, `description`, `source`, and `example` are optional, and `additionalProperties: false` rejects anything else.

- `Field` is the shared recursive node in `packages/docs-model/src/components/shared/field.ts`, the same node interaction-surface operation params use. `required: false` means optional; omitted or `true` reads as required.

- A custom check past the schema enforces sibling-unique field names at every level, dot-path addressing depends on it, and that a present `example` parses as JSON.

- Reads are tolerant: `readStateShapeFields`, `readStateShapeExample`, and `readStateShapeSource` skip malformed entries instead of throwing.

## Typed Actions

Four actions instantiate the Typed actions contract element. Params validate against each action's TypeBox schema before `apply()` runs; every action returns a shallow props patch, `{ fields }` from the tree actions, `{ example }` from `setExample`.

- Dot-path addressing over sibling-unique names: `"operations.params"` names the `params` field under `operations`; `""` or an omitted path names the root `fields` array.

- `state-shape.addField` inserts a field under the parent named by `path`; `index` defaults to the end, so document order is curated order and survives edits. Duplicate names, among the target siblings or inside the inserted subtree, are rejected.

- `state-shape.updateField` patches the field at `path`: `patch.name` renames (uniqueness re-checked), `null` clears `type`/`required`/`description`, and `patch.fields` replaces the whole subtree, `null` removes it.

- `state-shape.removeField` removes the field at `path` together with its entire subtree.

- `state-shape.setExample` sets or clears the example; the string must parse as JSON, `null` clears it.

**state-shape, actions**

```
state-shape.addField(field: Field, path?: string, index?: integer) -> StateShapeFieldsPatchPatch  # Insert a field ({ name, type?, required?, description?, fields? }) under the parent named by path; index defaults to the end.
  field: Field  # The field to insert.
    name: string
    type?: string
    required?: boolean  # false = optional
    description?: string
    fields?: Field[]  # Nested children, the node recurses
  path?: string  # Dot-path of the PARENT field; "" or omitted inserts into the root fields array.
  index?: integer  # Insert position among the parent's fields; default end.
  Returns StateShapeFieldsPatchPatch:
    fields: Field[]  # The complete replacement field list, not only the added field.
      name: string  # Unique among siblings.
      type?: string
      required?: boolean  # Omitted means required.
      description?: string
      fields?: Field[]  # Recurses with the same field contract.
state-shape.updateField(path: string, patch: object) -> StateShapeFieldsPatchPatch  # Patch the field at path (rename via patch.name; null clears type/required/description; patch.fields replaces the subtree, null removes it).
  path: string  # Dot-path of the field to patch, e.g. "operations.params".
  patch: object  # Partial field; patch.name renames, null clears.
    name?: string  # Rename; must stay unique among siblings.
    type?: string | null
    required?: boolean | null
    description?: string | null
    fields?: Field[] | null  # Replaces the subtree; null removes it.
  Returns StateShapeFieldsPatchPatch:
    fields: Field[]  # The complete replacement field list, not only the added field.
      name: string  # Unique among siblings.
      type?: string
      required?: boolean  # Omitted means required.
      description?: string
      fields?: Field[]  # Recurses with the same field contract.
state-shape.removeField(path: string) -> StateShapeFieldsPatchPatch  # Remove the field at path, together with its entire subtree.
  path: string  # Dot-path of the field to remove, e.g. "operations.params".
  Returns StateShapeFieldsPatchPatch:
    fields: Field[]  # The complete replacement field list, not only the added field.
      name: string  # Unique among siblings.
      type?: string
      required?: boolean  # Omitted means required.
      description?: string
      fields?: Field[]  # Recurses with the same field contract.
state-shape.setExample(example: string | null) -> StateShapePatch  # Set the JSON example instance rendered beside the field tree (example must parse as JSON; null clears it).
  example: string | null  # JSON text of an example instance of this shape; null clears the example.
  Returns StateShapePatch:
    example?: string  # JSON text of an example instance of this shape; renders as the linked example pane.
```

## Doc Renderer

StateShapeBlock renders one dark code panel with a header, a field ledger, and an Example pane. The whole panel is a code surface, so it stays dark on both the light and the dark page and takes the code theme's colors, as Code Colors From Your Editor describes. The ledger and the Example pane split 44/56 when the block is at least 560px wide. The ledger keeps at least 360px and the Example pane at least 260px, and a narrower block stacks them. Both panes have 16px of inner padding and render as follows:

- Tree pane

  - The header shows the shape name in monospace and, at the right, the source as `file#Symbol`. Hover or keyboard focus on the source opens the full `path#Symbol` in a tooltip.

  - Every field row shows only a name and a type. The name takes the key color with a punctuation-colored `?` when the field is optional, and the type takes the type color.

  - Nested fields hang off their parent with the file tree's elbow connectors, a tee for a middle child and an end for the last child.

  - Every field ledger uses one 24ch name column, so type columns line up across blocks. A long name wraps inside that column, also at `_`.

- Example pane

  - The example pretty-prints through the shared `printJsonLines` canon: line numbers, zebra stripes.

  - JSON token toning is deterministic, a tiny line tokenizer over the canonical print, no highlight.js.

  - A long line soft-wraps with a hanging indent instead of scrolling.

- Cross-linking

  - Field rows and example lines link by field dot-path; array indices normalize away, so a field matches its path at every array position.

  - Hover or pin paints the field's full extent in both panes; activating an ancestor lights its whole brace-to-brace range.

  - Without an example the card is the single-pane tree, nothing linkable.

- Props read

  - The descriptor reads `fields` and `source` strictly: any malformed entry renders the invalid-block placeholder.

  - `example` is read tolerantly: present-but-invalid JSON falls back to the single-pane tree; schema validation reports it at authoring time.

- Descriptions

  - A field name with a description carries a dotted underline. The description opens as a tooltip under the name after a 450 ms hover dwell, or at once on keyboard focus.

  - Print media, which PDF export uses, prints each description inline beneath its name, so an exported page carries every description.

In the editor the block is a ProseMirror atom leaf (`docStateShape`) rendered read-only through the shared `AtomBlockView`, the same `StateShapeBlock` output as the reader. No slash-menu entry; instances enter through agent ops or existing content.

## Agent Renderer

The Agent renderer contract element: a deterministic markdown projection.

- Header line: `**<name>**`, with ` — <path>#<symbol>` appended when a source is present; without a name the source stands alone as `— <path>`.

- Then a bare fence, one line per field in the shared field-line grammar: two-space indent per nesting depth, `<name><? when required: false>: <type>  # <description>`.

- When a valid `example` is present, a blank line and a `json` fence follow, pretty-printed through `printJsonLines`; the tolerant read drops a non-JSON example, so a malformed prop renders no fence rather than crashing.

Projected, the live Example above is the header line `**TableTheme**` plus this field fence:

```
accent: string  # Accent rule color.
headerBg?: string | { light, dark }  # Header row background; one value or a per-mode pair.
slider?: object  # Numeric control metadata.
  kind: "color" | "length" | "number"
  max?: number
```

and this `json` fence:

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

## Theme

The Theming contract element: theme file `components/state-shape.json` in the active theme folder. By default that folder is the Global theme at `~/.local/state/codecaine-docs/themes/global/`. A repo `themes/<id>/` folder is active only when the host serves no Global theme. Every value is one string for both modes or a `{ light, dark }` pair, validated against the `state-shape` entry of `THEME_TOKEN_REGISTRY` in `packages/docs-workbench/web/src/theme/theme-folders.ts`. Thirteen tokens, twelve colors and one length:

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-shape-border | Card border |
| bg | --docs-shape-bg | Card background |
| name | --docs-shape-name | Field names, in the key color |
| type | --docs-shape-type | Field types, in the type color |
| muted | --docs-shape-muted | Type punctuation and union pipes |
| optionalFg | --docs-shape-optional-fg | The optional `?` marker |
| optionalBg | --docs-shape-optional-bg | Optional marker background |
| rule | --docs-shape-rule | Hairlines: header underline, top-level row dividers, pane split |
| headerBg | --docs-shape-header-bg | Header row background |
| descFg | --docs-shape-desc-fg | Description tooltip text, and description text in print |
| childRule | --docs-shape-child-rule | Elbow connectors of nested fields |
| rowPad | --docs-shape-row-pad | Top-level row vertical padding, a 4–16 px length slider with a 9 px default |

Example-pane and range-chip linking styles come from the shared linking theme component (`components/linking.json`), registered once for every linked panel: Zebra stripe (`zebra` → `--docs-zebra`), Link highlight (`highlight` → `--docs-link-bg`), Pin & rail (`pin` → `--docs-link-pin`).

## Agent Adapter

The type uses the default adapter, no agent of its own; the contract is Agent adapter. The four typed actions ride `componentAction` ops in the doc-op vocabulary (`packages/docs-model/src/doc-ops.ts`).

- A `componentAction` names the registry key (`"state-shape.addField"`), resolves the action, validates params, and runs `apply()` against the target block.

- The returned props patch executes through the existing `updateBlock` path, merge semantics are single-sourced, the block id is preserved, and the inverse is the usual `updateBlock` inverse.

- Structural edits ride the generic ops, `insertBlock`, `updateBlock`, `deleteBlock`, `moveBlock`. `splitBlock` and `mergeBlocks` never apply: the type carries no text.

