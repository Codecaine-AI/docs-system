The structured-table family owns one block type, `structured-table`: a columns × rows grid of rich-text cells kept in typed props, not prose. Each cell is a plain string or a span array carrying inline marks. Use it for index tables, comparison matrices, and anything an agent should edit cell-by-cell instead of re-flowing text. Each section below instantiates one element of the block-design contract for this family.

When creating or revising a worked component example, show the relevant state shape with a concrete instance, the real operation signature, and its returned shape beside example data. Use one consistent scenario across all three. Verify fields and return semantics against source. Identify whether the result is a props patch, full state, or response envelope. For void, primitive, or event results, document the actual result or payload instead of inventing an object. Descriptions should add non-obvious information.

## Example

A live instance of the type, the `docs-system-classic` repo theme's five structured-table overrides (`themes/docs-system-classic/components/structured-table.json`), with code-marked CSS-variable cells:

**docs-system-classic theme structured-table overrides**

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
title?: string  # Not displayed. It names the table for screen readers through `aria-label`, and the agent markdown view prints it as a bold line. It is always a plain string.
columns: TableCell[]  # Header cells in order. A TableCell is a plain string or a span array whose closed mark set is bold/italic/strike/code/link.
rows: TableCell[][]  # One cell array per row; actions normalize each row to the column count. An unmarked cell stores as the plain string (canonical).
density?: "compact" | "normal" | "relaxed"  # Accepted by the schema, but the renderer ignores it. Spacing comes from the theme tokens.
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

All state is four typed props, with `carriesText: false`, no `text` key. The schema is a closed TypeBox object. The contract is State schema.

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

Cells, body and header alike, carry the inline mark set: bold, italic, strike, code, and link. The cell attribute schema is closed, so `reference` chips are rejected. An unmarked cell is stored as the plain string: a span-array cell with zero attributed spans fails validation (`checkStructuredTableProps`, the beyond-schema check that runs after the TypeBox schema passes), so an all-plain table has exactly one encoding.

## Typed Actions

Five verbs cover the grid and form the family's whole agent write surface for cells. Each action validates, applies against the block's current props, and returns a shallow props patch. Rejections come back at `$.params.<name>` (an out-of-range index, a duplicate or unknown column name) without touching the document. The contract is Typed actions.

- Column addressing takes exactly one of `column` (by name) or `columnIndex` (by position); name matching and the duplicate-name check compare the header's plain text.

- `addColumn` rejects a duplicate name and back-fills existing rows with `fill` (default the empty string). Row and column inserts default to the end.

- `addRow` pads or truncates `cells` to the column count. The column actions re-normalize every row on the way through.

- Cell-content params (`value`, `cells`, `name`, `fill`) are inline markdown, parsed to spans by the shared inline tokenizer (`parseTableCellInput`). Unmarked input stays the plain string.

- Links the parser classifies as doc or source references downgrade to plain `link` marks (`href` is the path plus a `#section`, `#L<line>`, or `#<symbol>` suffix) because cells forbid `reference`.

**structured-table row and column actions**

```
structured-table.addRow(cells: string[], index?: number) -> StructuredTablePatch  # Insert a row (cells are inline markdown, padded/truncated to the column count); index defaults to the end.
  Returns StructuredTablePatch:
    rows: TableCell[][]  # One cell array per row; actions normalize each row to the column count. An unmarked cell stores as the plain string (canonical).
structured-table.removeRow(index: number) -> StructuredTablePatch  # Remove the row at the given index.
  Returns StructuredTablePatch:
    rows: TableCell[][]  # One cell array per row; actions normalize each row to the column count. An unmarked cell stores as the plain string (canonical).
structured-table.updateCell(rowIndex: number, column?: string, columnIndex?: number, value: string) -> StructuredTablePatch  # Set one cell to inline markdown, addressing the column by name (column) or position (columnIndex).
  Returns StructuredTablePatch:
    rows: TableCell[][]  # One cell array per row; actions normalize each row to the column count. An unmarked cell stores as the plain string (canonical).
structured-table.addColumn(name: string, index?: number, fill?: string) -> StructuredTablePatch  # Insert a column (default at the end), extending every row with the fill value; name and fill are inline markdown.
  Returns StructuredTablePatch:
    columns: TableCell[]  # Header cells in order. A TableCell is a plain string or a span array whose closed mark set is bold/italic/strike/code/link.
    rows: TableCell[][]  # One cell array per row; actions normalize each row to the column count. An unmarked cell stores as the plain string (canonical).
structured-table.removeColumn(column?: string, columnIndex?: number) -> StructuredTablePatch  # Remove a column by name (column) or position (columnIndex), shrinking every row.
  Returns StructuredTablePatch:
    columns: TableCell[]  # Header cells in order. A TableCell is a plain string or a span array whose closed mark set is bold/italic/strike/code/link.
    rows: TableCell[][]  # One cell array per row; actions normalize each row to the column count. An unmarked cell stores as the plain string (canonical).
```

## Doc Renderer

The read surface and the editor at rest share one light-grid look. The table is a panel that shrinks to its content inside a thin outer border. A header rule tinted by the header-rule tokens sits under the header row, light rules split the body rows, and a hover wash marks the current row. Column rules are `0px` wide by default, so only row rules show. A theme that widens them with `--docs-table-column-rule-width` gets the row-rule color and opacity unless it sets its own. The block's `title` is never drawn. It only names the table for screen readers through `aria-label`.

Every cell is padded on both sides so text never touches a rule. Columns size to their content, one prose column wraps at 60ch, and the first column stays pinned when the table scrolls, as described in Block Widths and Lanes. The class strings live in `table-classes.ts` and are imported verbatim by both the read renderer (`StructuredTableDocsBlock.tsx`) and the editor grid, so the two surfaces cannot drift. Header cells keep a 60px minimum width so a new empty column stays visible. A block with missing or malformed columns renders the invalid-block placeholder. The contract is Doc renderer.

In the editor the block is a ProseMirror atom leaf that swaps in its own editable node view (`editor-node-view.tsx`). Cells edit in place, Notion-style, instead of through the generic static atom views. There is no slash-menu entry. Structured tables enter a document through agent ops or existing content.

### Editing

Notion-style grid controls, revealed on hover.

- Add bars sit just outside the right edge (column) and bottom edge (row), with a corner square that adds both: click adds one, dragging adds several live (ghost preview plus a count) or removes trailing empty columns/rows.

- Hovering a column shows a six-dot grab handle above it. Body rows get one on the left.

- Clicking a handle selects the whole column or row (a single accent outline) and opens its menu: insert left/right or above/below, move, duplicate, clear contents, and delete.

- Dragging a handle past a small dead zone reorders it: a semi-transparent preview follows the cursor, the source dims, and an accent drop-indicator line marks the target gap.

- After a single add, focus lands in the new column's header cell or the new row's first cell, the added region flashes accent briefly, and empty header cells show a muted "Column N" placeholder (edit mode only, renumbered with position).

Each cell hosts its own mini rich-text editor: a single paragraph carrying the five cell marks, with hard breaks as in-cell newlines.

- Marks apply through the main editor's keyboard shortcuts (`Cmd+B`, `Cmd+I`, strike, `Cmd+E` for code).

- Input rules auto-convert `**bold**` and backtick code while typing. The italic and strike input rules are off, matching the main editor.

- Pasting a URL over a selection creates a link. There is no other link UI and no floating toolbar.

- `Tab`/`Shift-Tab` move between cells (header first, wrapping across rows), `Enter` moves down the column, `Shift-Enter` inserts a newline, `Escape` exits.

- `Cmd+A` selects only the cell's contents, never the document. `Cmd+Z` / `Cmd+Shift+Z` commit pending text and forward to the editor's history, so table edits undo and redo like any other.

- The focused cell draws a 2px accent outline plus small gray notches on its column's top edge and row's left edge.

The header row is the `columns` array: it has a column handle but no row handle (it cannot be moved or deleted), and the last remaining column cannot be deleted. Structural actions first commit any focused cell's pending text and apply to the freshest data, so cell edits are never lost or duplicated by a move. Every edit lands as a single `updateBlock` replacing `columns`/`rows` through the standard op pipeline (validation, undo ledger, and auto-save), and agent-facing mutations stay on the typed actions above.

## Agent Renderer

The agent-facing markdown projection (`agent-view.ts`): an optional `**<title>**` bold line, then a markdown pipe table: header row, `---` separator row, one line per row. A title-only or table-only block renders just the part it has. Cell marks render as inline markdown (`**bold**`, `*italic*`, `~~strike~~`, ``code``, `[text](href)`) so table reads round-trip with table writes. The contract is Agent renderer. The Example table above projects as:

```markdown
**docs-system-classic theme structured-table overrides**

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

This block's theme file is `components/structured-table.json` in the active theme folder. By default that folder is the Global theme at `~/.local/state/codecaine-docs/themes/global/`. A repo `themes/<id>/` folder is active only when the host serves no Global theme. Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`. The registry is kind-aware: each key declares color, length, or number, so the workbench theme rail renders a color picker or a bounded slider (min/max/step from the registry) per key. Lengths carry a px unit, and opacities are bare numbers. The contract is Theming.

| Key | CSS variable | Kind | Notes |
| --- | --- | --- | --- |
| border | --docs-table-border | color | Outer wrapper border (default: the row-rule grey) |
| headerBg | --docs-table-header-bg | color | Header row background (default transparent) |
| headerFg | --docs-table-header-fg | color | Header text color |
| headerRule | --docs-table-header-rule | color | Header rule color (falls back to headerFg) |
| headerRuleWidth | --docs-table-header-rule-width | length | Header rule thickness (default 1.5px) |
| headerRuleOpacity | --docs-table-header-rule-opacity | number | Header rule opacity (default 0.5) |
| rowRule | --docs-table-row-rule | color | Row rule color (falls back to the UI border color) |
| rowRuleWidth | --docs-table-row-rule-width | length | Row rule thickness (default 1px) |
| rowRuleOpacity | --docs-table-row-rule-opacity | number | Row rule opacity (default 1) |
| columnRule | --docs-table-column-rule | color | Column rule color (falls back to rowRule) |
| columnRuleWidth | --docs-table-column-rule-width | length | Column rule thickness (default 0px, so no column rules) |
| columnRuleOpacity | --docs-table-column-rule-opacity | number | Column rule opacity (falls back to rowRuleOpacity) |
| cellPaddingY | --docs-table-cell-pad-y | length | Vertical cell padding (default 10px) |
| cellPaddingX | --docs-table-cell-pad-x | length | Horizontal cell padding on each side (default 12px) |
| fontSize | --docs-table-font-size | length | Cell text size (default 14px, headers render 1px smaller) |
| handleRadius | --docs-table-handle-radius | length | Corner radius of the column/row grab handles (default 3px) |
| handleOffset | --docs-table-handle-offset | length | How far outside the table edge the grab handles sit (default 12px) |
| selectionPadding | --docs-table-selection-pad | length | Outward padding of the column/row selection outline (default 3px) |

## Agent Adapter

The family uses the default adapter: no agent of its own and no forwarding authority. All five actions carry a local apply. On the wire an edit is a `componentAction` op (one of the generic doc ops) naming the block, the action key, and params. The kernel (`doc-ops.ts`) resolves the action from the registry, validates params against the action's schema, runs apply, and executes the returned patch through the standard `updateBlock` path. The undo inverse is an ordinary `updateBlock`. Structural work on the table as a block, such as insert, move, and delete, stays on the generic ops. The contract is Agent adapter.

Edit cells through the actions, never by hand-patching the `rows` array. Actions validate, normalize row widths, and return undo inverses.
