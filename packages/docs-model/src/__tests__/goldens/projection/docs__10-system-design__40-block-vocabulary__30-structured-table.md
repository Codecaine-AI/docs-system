The structured-table family owns one block type, `structured-table`: a columns × rows grid of rich-text cells kept in typed props, not prose — each cell is a plain string or a span array carrying inline marks. Use it for index tables, comparison matrices, and anything an agent should edit cell-by-cell instead of re-flowing text. Each section below instantiates one element of the block-design contract for this family.

## Example

A live instance of the type — the default theme's five structured-table overrides (`themes/default/components/structured-table.json`), with code-marked CSS-variable cells:

**Default theme — structured-table overrides**

| Key | CSS variable | Value |
| --- | --- | --- |
| headerRuleWidth | `--docs-table-header-rule-width` | 1.5px |
| cellPaddingY | `--docs-table-cell-pad-y` | 12px |
| rowRuleOpacity | `--docs-table-row-rule-opacity` | 0.8 |
| handleOffset | `--docs-table-handle-offset` | 16px |
| selectionPadding | `--docs-table-selection-pad` | 4px |

## State Schema

**StructuredTableState** — packages/docs-model/src/components/structured-table/state.ts#StructuredTableState

```
title?: string  # Optional caption above the table; always a plain string — cell marks never apply.
columns: TableCell[]  # Header cells in order. A TableCell is a plain string or a span array whose closed mark set is bold/italic/strike/code/link.
rows: TableCell[][]  # One cell array per row; actions normalize each row to the column count. An unmarked cell stores as the plain string (canonical).
density?: "compact" | "normal" | "relaxed"  # Accepted by the schema; the renderer ignores it — spacing comes from the theme tokens.
```

```json
{
  "title": "Registry kinds",
  "columns": [
    "Key",
    "Kind"
  ],
  "rows": [
    [
      "headerRuleWidth",
      "length"
    ],
    [
      [
        {
          "insert": "rowRuleOpacity",
          "attributes": {
            "code": true
          }
        }
      ],
      "number"
    ]
  ]
}
```

All state is four typed props — `carriesText: false`, no `text` key; the schema is a closed TypeBox object. The contract is State schema.

```ts
export const StructuredTableState = Type.Object(
  {
    title: Type.Optional(Type.String()),
    columns: Type.Array(TableCellSchema),
    rows: Type.Array(Type.Array(TableCellSchema)),
    density: Type.Optional(
      Type.Union([
        Type.Literal("compact"),
        Type.Literal("normal"),
        Type.Literal("relaxed"),
      ]),
    ),
  },
  { additionalProperties: false },
);
```
> **L3 (Plain title):** The optional caption is always a plain string — cell marks never apply to it.
> **L4-5 (Cell union):** TableCellSchema is a plain string (the canonical unmarked form) or an array of spans whose closed attribute set is bold/italic/strike/code/link — reference is invalid in cells.
> **L14 (Closed schema):** additionalProperties: false — unknown props fail validation.

Cells — body and header alike — carry the inline mark set: bold, italic, strike, code, and link; the cell attribute schema is closed, so `reference` chips are rejected. An unmarked cell is stored as the plain string: a span-array cell with zero attributed spans fails validation (`checkStructuredTableProps`, the beyond-schema check that runs after the TypeBox schema passes), so an all-plain table has exactly one encoding.

## Typed Actions

Five verbs cover the grid — the family's whole agent write surface for cells. Each action validates, applies against the block's current props, and returns a shallow props patch; rejections come back at `$.params.<name>` (an out-of-range index, a duplicate or unknown column name) without touching the document. The contract is Typed actions.

- Column addressing takes exactly one of `column` (by name) or `columnIndex` (by position); name matching and the duplicate-name check compare the header's plain text.

- `addColumn` rejects a duplicate name and back-fills existing rows with `fill` (default the empty string); row and column inserts default to the end.

- `addRow` pads or truncates `cells` to the column count; the column actions re-normalize every row on the way through.

- Cell-content params (`value`, `cells`, `name`, `fill`) are inline markdown, parsed to spans by the shared inline tokenizer (`parseTableCellInput`); unmarked input stays the plain string.

- Links the parser classifies as doc or source references downgrade to plain `link` marks — `href` is the path plus a `#section`, `#L<line>`, or `#<symbol>` suffix — because cells forbid `reference`.

**structured-table — row and column actions**

```
structured-table.addRow(cells: string[], index?: number) -> props patch: { rows }  # Insert a row (cells are inline markdown, padded/truncated to the column count); index defaults to the end.
structured-table.removeRow(index: number) -> props patch: { rows }  # Remove the row at the given index.
structured-table.updateCell(rowIndex: number, column?: string, columnIndex?: number, value: string) -> props patch: { rows }  # Set one cell to inline markdown, addressing the column by name (column) or position (columnIndex).
structured-table.addColumn(name: string, index?: number, fill?: string) -> props patch: { columns, rows }  # Insert a column (default at the end), extending every row with the fill value; name and fill are inline markdown.
structured-table.removeColumn(column?: string, columnIndex?: number) -> props patch: { columns, rows }  # Remove a column by name (column) or position (columnIndex), shrinking every row.
```

## Doc Renderer

One accent-rule look, shared by the read surface and the editor at rest: an optional title line, a rule under the header tinted by the header-rule tokens, light rules between body rows (none after the last), a row hover wash, and no vertical rules or cell boxes. The class strings live in `table-classes.ts` and are imported verbatim by both the read renderer (`StructuredTableDocsBlock.tsx`) and the editor grid, so the two surfaces cannot drift. Header cells keep a 60px minimum width so a freshly added empty column stays visible, and every spacing and rule value routes through the `--docs-table-*` theme tokens. A block whose columns are missing or malformed renders the invalid-block placeholder. The contract is Doc renderer.

In the editor the block is a ProseMirror atom leaf that swaps in its own editable node view (`editor-node-view.tsx`) — cells edit in place, Notion-style, instead of through the generic static atom views. There is no slash-menu entry; structured tables enter a document through agent ops or existing content.

### Editing

Notion-style grid controls, revealed on hover. Add bars sit just outside the right edge (column) and bottom edge (row), with a corner square that adds both: click adds one, dragging adds several live (ghost preview plus a count) or removes trailing empty columns/rows. Hovering a column shows a six-dot grab handle above it; body rows get one on the left. Clicking a handle selects the whole column or row (a single accent outline) and opens its menu — insert left/right or above/below, move, duplicate, clear contents, delete — while dragging past a small dead zone reorders it: a semi-transparent preview follows the cursor, the source dims, and an accent drop-indicator line marks the target gap. After a single add, focus lands in the new column's header cell or the new row's first cell, the added region flashes accent briefly, and empty header cells show a muted "Column N" placeholder (edit mode only, renumbered with position).

Each cell hosts its own mini rich-text editor: a single paragraph carrying the five cell marks, with hard breaks as in-cell newlines. Marks apply through the main editor's keyboard shortcuts (`Cmd+B`, `Cmd+I`, strike, `Cmd+E` for code); input rules auto-convert `**bold**` and backtick code while typing — the italic and strike input rules are off, matching the main editor. Pasting a URL over a selection creates a link; there is no other link UI and no floating toolbar. `Tab`/`Shift-Tab` move between cells (header first, wrapping across rows), `Enter` moves down the column, `Shift-Enter` inserts a newline, `Escape` exits. `Cmd+A` selects only the cell's contents, never the document; `Cmd+Z` / `Cmd+Shift+Z` commit pending text and forward to the editor's history, so table edits undo and redo like any other. The focused cell draws a 2px accent outline plus small gray notches on its column's top edge and row's left edge.

The header row is the `columns` array: it has a column handle but no row handle (it cannot be moved or deleted), and the last remaining column cannot be deleted. Structural actions first commit any focused cell's pending text and apply to the freshest data, so cell edits are never lost or duplicated by a move. Every edit lands as a single `updateBlock` replacing `columns`/`rows` through the standard op pipeline — validation, undo ledger, auto-save — and agent-facing mutations stay on the typed actions above.

## Agent Renderer

The agent-facing markdown projection (`agent-view.ts`): an optional `**<title>**` bold line, then a markdown pipe table: header row, `---` separator row, one line per row. A title-only or table-only block renders just the part it has. Cell marks render as inline markdown — `**bold**`, `*italic*`, `~~strike~~`, ``code``, `[text](href)` — so table reads round-trip with table writes. The contract is Agent renderer. The Example table above projects as:

```markdown
**Default theme — structured-table overrides**

| Key | CSS variable | Value |
| --- | --- | --- |
| headerRuleWidth | `--docs-table-header-rule-width` | 1.5px |
| cellPaddingY | `--docs-table-cell-pad-y` | 12px |
| rowRuleOpacity | `--docs-table-row-rule-opacity` | 0.8 |
| handleOffset | `--docs-table-handle-offset` | 16px |
| selectionPadding | `--docs-table-selection-pad` | 4px |
```
> **L1 (Title line):** The optional title projects as one bold line above the table.
> **L5-9 (Cells):** Plain-string cells pass through verbatim; span cells render their marks as inline markdown — here the code mark's backticks.

## Theme

This block's theme file is `components/structured-table.json` in a theme folder (`themes/<id>/`; the system is Theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`. The registry is kind-aware: each key declares color, length, or number, so the workbench theme rail renders a color picker or a bounded slider (min/max/step from the registry) per key — lengths carry a px unit, opacities are bare numbers. The contract is Theming.

| Key | CSS variable | Kind | Notes |
| --- | --- | --- | --- |
| border | --docs-table-border | color | Outer wrapper border (default transparent) |
| headerBg | --docs-table-header-bg | color | Header row background (default transparent) |
| headerFg | --docs-table-header-fg | color | Header text color |
| headerRule | --docs-table-header-rule | color | Header rule color (falls back to headerFg) |
| headerRuleWidth | --docs-table-header-rule-width | length | Header rule thickness (default 1.5px) |
| headerRuleOpacity | --docs-table-header-rule-opacity | number | Header rule opacity (default 0.5) |
| rowRule | --docs-table-row-rule | color | Row rule color (falls back to the UI border color) |
| rowRuleWidth | --docs-table-row-rule-width | length | Row rule thickness (default 1px) |
| rowRuleOpacity | --docs-table-row-rule-opacity | number | Row rule opacity (default 1) |
| cellPaddingY | --docs-table-cell-pad-y | length | Vertical cell padding (default 10px) |
| cellPaddingX | --docs-table-cell-pad-x | length | Column gap (default 16px) |
| fontSize | --docs-table-font-size | length | Cell text size (default 14px; headers render 1px smaller) |
| handleRadius | --docs-table-handle-radius | length | Corner radius of the column/row grab handles (default 3px) |
| handleOffset | --docs-table-handle-offset | length | How far outside the table edge the grab handles sit (default 12px) |
| selectionPadding | --docs-table-selection-pad | length | Outward padding of the column/row selection outline (default 3px) |

## Agent Adapter

The family uses the default adapter: no agent of its own, no forwarding authority — all five actions carry a local apply. On the wire an edit is a `componentAction` op (one of the generic doc ops) naming the block, the action key, and params; the kernel (`doc-ops.ts`) resolves the action from the registry, validates params against the action's schema, runs apply, and executes the returned patch through the standard `updateBlock` path — the undo inverse is an ordinary `updateBlock`. Structural work on the table as a block — insert, move, delete — stays on the generic ops. The contract is Agent adapter.

Edit cells through the actions, never by hand-patching the `rows` array — actions validate, normalize row widths, and return undo inverses.
