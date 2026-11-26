The state-shape component owns one block type, `state-shape`, the object-shape block of the block vocabulary. A block carries a recursive field tree, name, type, optionality, meaning, an optional link to the defining source symbol, and an optional JSON example instance rendered beside the tree.

When creating or revising a worked component example, show the relevant state shape with a concrete instance, the real operation signature, and its returned shape beside example data. Use one consistent scenario across all three. Verify fields and return semantics against source; identify whether the result is a props patch, full state, or response envelope. For void, primitive, or event results, document the actual result or payload instead of inventing an object. Descriptions should add non-obvious information.

It is the state carrier of the corpus documentation doctrine: a state-shape block carries the shape of state and an example instance side by side, an interaction-surface lists the operations that change or query it, and annotated code blocks hold the source evidence. State comes first, then operations. A code block is for material that is not an instance of the shape, a real source listing.

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

Starting with the TableTheme field definition above, call state-shape.addField with field { name: "enabled", type: "boolean" }. Omit path and index to append at the root. StateShapeFieldsPatch below names the returned props object. It is not the action success envelope.

**Edit the Field Definition**

```
[action] state-shape.addField(field: Field, path?: string, index?: integer) -> StateShapeFieldsPatch  # Rejects duplicate sibling names; omitted path and index append at the root.
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

- `fields` is the one required key. `name`, `description`, `source`, and `example` are optional, and `additionalProperties: false` rejects anything else.

- `Field` is the shared recursive node in `packages/docs-model/src/components/shared/field.ts`, the same node interaction-surface operation params use. `required: false` means optional; omitted or `true` reads as required.

- A custom check past the schema enforces sibling-unique field names at every level, dot-path addressing depends on it, and that a present `example` parses as JSON.

- Reads are tolerant. `readStateShapeFields`, `readStateShapeExample`, and `readStateShapeSource` skip malformed entries instead of throwing.

## Typed Actions

Four actions instantiate the Typed actions contract element. Params validate against each action's TypeBox schema before `apply()` runs. Every action returns a shallow props patch, `{ fields }` from the tree actions, `{ example }` from `setExample`.

- Dot-path addressing over sibling-unique names:

  - `"operations.params"` names the `params` field under `operations`.

  - `""` or an omitted path names the root `fields` array.

- `state-shape.addField` inserts a field under the parent named by `path`; `index` defaults to the end, so document order is curated order and survives edits. Duplicate names, among the target siblings or inside the inserted subtree, are rejected.

- `state-shape.updateField` patches the field at `path`: `patch.name` renames (uniqueness re-checked), `null` clears `type`/`required`/`description`, and `patch.fields` replaces the whole subtree, `null` removes it.

- `state-shape.removeField` removes the field at `path` together with its entire subtree.

- `state-shape.setExample` sets or clears the example. The string must parse as JSON, `null` clears it.

**state-shape, actions**

```
[action] state-shape.addField(field: Field, path?: string, index?: integer) -> StateShapeFieldsPatchPatch  # Insert a field ({ name, type?, required?, description?, fields? }) under the parent named by path; index defaults to the end.
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
[action] state-shape.updateField(path: string, patch: object) -> StateShapeFieldsPatchPatch  # Patch the field at path (rename via patch.name; null clears type/required/description; patch.fields replaces the subtree, null removes it).
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
[action] state-shape.removeField(path: string) -> StateShapeFieldsPatchPatch  # Remove the field at path, together with its entire subtree.
  path: string  # Dot-path of the field to remove, e.g. "operations.params".
  Returns StateShapeFieldsPatchPatch:
    fields: Field[]  # The complete replacement field list, not only the added field.
      name: string  # Unique among siblings.
      type?: string
      required?: boolean  # Omitted means required.
      description?: string
      fields?: Field[]  # Recurses with the same field contract.
[action] state-shape.setExample(example: string | null) -> StateShapePatch  # Set the JSON example instance rendered beside the field tree (example must parse as JSON; null clears it).
  example: string | null  # JSON text of an example instance of this shape; null clears the example.
  Returns StateShapePatch:
    example?: string  # JSON text of an example instance of this shape; renders as the linked example pane.
```

## Doc Renderer

`StateShapeBlock` renders one dark code panel with a header, a field ledger, and an Example pane. The panel is a code surface, so it stays dark on both the light and the dark page. It takes the code theme's colors, as Code Colors From Your Editor describes. At 560px wide or more, the ledger and the Example pane sit side by side, and each pane has 16px of inner padding.

- Tree pane

  - The header shows the shape name in monospace and, at the right, the source as `file#Symbol`. Hover or keyboard focus on the source opens the full `path#Symbol` in a tooltip.

  - Every field row shows a name and a type.

    - The name takes the key color with a punctuation-colored `?` right after it when the field is optional.

    - A field with no `?` is required, and the block prints no legend line for this.

  - A name of several words, such as `kind "command" adds`, colors a quoted word as a string literal and each later word as a keyword.

  - Nested fields hang off their parent with the file tree's elbow connectors, a tee for a middle child and an end for the last child.

  - The name column fits the longest name at its depth, from 10ch to 8ch past the 24ch of `--docs-shape-name-width`. In a block narrower than 560px, the knob alone caps it.

- Example pane

  - The example pretty-prints through the shared `printJsonLines` canon with no line numbers. An object or array folds onto one line when that line fits in 42 columns.

    - `exampleFolds` folds an array of 3 or more items when its items after the first take 8 or more lines. A folded array shows its first item and a `… N more` button, and the chevron on its opening line opens or closes it.

  - JSON token toning is deterministic, a tiny line tokenizer over the canonical print, no highlight.js.

  - A long line soft-wraps instead of scrolling, and each key stays on the line of its value.

    - In a block 560px wide or more, the pane fits its widest line, up to 48 columns and 56% of the block.

  - A path value whose parts are 32 characters or shorter breaks only after a `/`.

  - A wrapped string value with no space continues under the first character inside its opening quote.

- Cross-linking

  - Field rows and example lines link by field dot-path. Array indices normalize away, so a field matches its path at every array position.

  - Hover or pin paints the field's full extent in both panes with the link wash and the left rail.

    - A pin draws no ring around each line, so a pinned span reads as one section.

    - Activating an ancestor lights its whole brace-to-brace range.

  - Escape clears the pin. A click outside every linked row and line also clears it.

  - Without an example the card is the single-pane tree, nothing linkable.

- Props read

  - The descriptor reads `fields` and `source` strictly: any malformed entry renders the invalid-block placeholder.

  - `example` is read tolerantly: present-but-invalid JSON falls back to the single-pane tree. Schema validation reports it at authoring time.

- Descriptions

  - A row hides its description until the reader opens the row.

    - A click on a described row opens its description under its type, and a second click closes it.

    - The row toggle is a button with `aria-expanded`, and a chevron shows on hover. A row without a description has no toggle.

  - The Descriptions switch at the right of the header shows every description in every ledger on the page.

    - The switch shows only its track, and its label Descriptions slides out over 320 ms on hover or keyboard focus. Reduced motion turns the slide off.

    - The switch value lives in memory only, so a reload turns it off. Interaction Surface ledgers read the same switch.

  - While a described row is closed, a string-literal union of 4 or more values shows its first 2 values and a muted `+N`. A row without a description shows its whole union.

  - An open description sits beside its type at a ledger width of 600px or more, and under the type below that. Each backtick span in a description renders as inline code.

  - Static markup, such as a published page, has no JS to run a toggle. It prints every description beside its type and shows no switch.

  - Print media, which PDF export uses, prints every description and every union value, so an exported page carries them all.

In the editor the block is a ProseMirror atom leaf (`docStateShape`) rendered read-only through the shared `AtomBlockView`, the same `StateShapeBlock` output as the reader. The block has no slash-menu entry. Instances enter through agent ops or existing content.

## Agent Renderer

The Agent renderer contract element: a deterministic markdown projection.

- Header line: `**<name>**`, with ` — <path>#<symbol>` appended when a source is present; without a name the source stands alone as `— <path>`.

- Then a bare fence, one line per field in the shared field-line grammar: two-space indent per nesting depth, `<name><? when required: false>: <type>  # <description>`.

- When a valid `example` is present, a blank line and a `json` fence follow, pretty-printed through `printJsonLines`. The tolerant read drops a non-JSON example, so a malformed prop renders no fence rather than crashing.

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

The type uses the default adapter, no agent of its own. The contract is Agent adapter. The four typed actions ride `componentAction` ops in the doc-op vocabulary (`packages/docs-model/src/doc-ops.ts`).

- A `componentAction` names the registry key (`"state-shape.addField"`), resolves the action, validates params, and runs `apply()` against the target block.

- The returned props patch runs through the existing `updateBlock` path. Merge semantics are single-sourced, the block id is preserved, and the inverse is the usual `updateBlock` inverse.

- Structural edits ride the generic ops, `insertBlock`, `updateBlock`, `deleteBlock`, `moveBlock`. `splitBlock` and `mergeBlocks` never apply: the type carries no text.
