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
  type?: string  # Type text. Union members render as separate blue monospace chips; free-text types render as plain blue text.
  required?: boolean  # false = optional and renders an ochre optional pill; omitted or true reads as required.
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

StateShapeBlock renders the approved bounded card with a textured title and description header, a field/type ledger, and an Example pane. The header separates both columns with one rule. The example separator ends at the content height. On desktop the field column defaults to 46% of the lane; narrow layouts stack the panes.

- Tree pane

  - The header shows a bold monospace shape name; a described name carries a dotted underline and opens its description as the same tooltip. The full defining source path and symbol remain in data-shape-source for inspection.

  - Every field row has a separator, a bold monospace name, a blue type chip, and an accessible question-mark optional marker. A described name carries a dotted underline; its description opens as a tooltip after a short hover dwell or on keyboard focus, and prints inline beneath the name. The object name in the header works the same way. Union types render one chip per member; prose types remain unchipped.

  - Child branches use thin connected strokes aligned with field names. The last sibling terminates the branch at its tick; ancestor rails continue through deeper children when later siblings remain. Branch start, depth indentation, tick length, text gap, vertical offset, thickness, and color are retained in the tuned renderer.

- Example pane

  - The example pretty-prints through the shared `printJsonLines` canon: line numbers, zebra stripes.

  - JSON token toning is deterministic, a tiny line tokenizer over the canonical print, no highlight.js.

- Cross-linking

  - Field rows and example lines link by field dot-path; array indices normalize away, so a field matches its path at every array position.

  - Hover or pin paints the field's full extent in both panes; activating an ancestor lights its whole brace-to-brace range.

  - Without an example the card is the single-pane tree, nothing linkable.

- Props read

  - The descriptor reads `fields` and `source` strictly: any malformed entry renders the invalid-block placeholder.

  - `example` is read tolerantly: present-but-invalid JSON falls back to the single-pane tree; schema validation reports it at authoring time.

- Descriptions

  - A field name or object name with a description carries a dotted underline and a help cursor; a name without one renders plain. The ledger shows only names and types, so a shape scans as a table.

  - The description opens as a tooltip beneath the name after a 450 ms hover dwell, or at once on keyboard focus. The name is focusable and points at the bubble through `aria-describedby`; the bubble has `role="tooltip"`, shows the name as a monospace label above the description, and stays under 36ch wide. The bottom two rows open upward so the card's rounded clip never cuts a bubble.

  - The tooltip is CSS only: `:hover` and `:has(:focus-visible)` on the name wrapper, no script. The reader, the editor's atom view, and published static HTML behave the same. The bubble takes no pointer events, so row hover keeps lighting the linked JSON lines.

  - In print media, which PDF export uses, the description renders inline beneath the name and the underline and bubble chrome drop, so an exported page carries every description.

  - Why: a shape often lists many fields and a reader consults a description rarely. The dwell keeps casual pointer travel from flashing bubbles, and the underline keeps descriptions discoverable. `descFg` colours the description text in the bubble and in print alike. Interaction Surface parameter and returned-field names use the same tooltip.

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

The Theming contract element: theme file `components/state-shape.json` in a theme folder (`themes/<id>/`; system docs at Theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against the `state-shape` entry of `THEME_TOKEN_REGISTRY` in `packages/docs-workbench/web/src/theme/theme-folders.ts`. Thirteen tokens, twelve colors and one length:

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-shape-border | Card border |
| bg | --docs-shape-bg | Card background |
| name | --docs-shape-name | Shape name in the header row |
| type | --docs-shape-type | Field type text |
| typeBg | --docs-shape-type-bg | Type chip background |
| muted | --docs-shape-muted | Muted detail text, the source ref and empty-state note |
| optionalFg | --docs-shape-optional-fg | Optional marker text |
| optionalBg | --docs-shape-optional-bg | Optional marker background |
| rule | --docs-shape-rule | Hairlines: header underline, top-level row dividers, pane split |
| headerBg | --docs-shape-header-bg | Header row background |
| descFg | --docs-shape-desc-fg | Description text in the tooltip bubble and in print, header and field rows |
| childRule | --docs-shape-child-rule | Left rule containing nested fields |
| rowPad | --docs-shape-row-pad | Top-level row vertical padding; length slider, 4–16 px, default 9 px |

Example-pane and range-chip linking styles come from the shared linking theme component (`components/linking.json`), registered once for every linked panel: Zebra stripe (`zebra` → `--docs-zebra`), Link highlight (`highlight` → `--docs-link-bg`), Pin & rail (`pin` → `--docs-link-pin`).

## Agent Adapter

The type uses the default adapter, no agent of its own; the contract is Agent adapter. The four typed actions ride `componentAction` ops in the doc-op vocabulary (`packages/docs-model/src/doc-ops.ts`).

- A `componentAction` names the registry key (`"state-shape.addField"`), resolves the action, validates params, and runs `apply()` against the target block.

- The returned props patch executes through the existing `updateBlock` path, merge semantics are single-sourced, the block id is preserved, and the inverse is the usual `updateBlock` inverse.

- Structural edits ride the generic ops, `insertBlock`, `updateBlock`, `deleteBlock`, `moveBlock`. `splitBlock` and `mergeBlocks` never apply: the type carries no text.
