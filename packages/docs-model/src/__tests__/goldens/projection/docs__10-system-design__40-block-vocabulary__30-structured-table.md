The typed table of the block vocabulary: a columns × rows grid of strings kept in props, not prose. Use it for index tables, comparison matrices, and anything an agent should edit cell-by-cell instead of re-flowing text.

## State

| prop | type | required | notes |
| --- | --- | --- | --- |
| title | string | no | Optional bold caption above the table. |
| columns | string[] | yes | Header names, in order. |
| rows | string[][] | yes | One string array per row; actions normalize each row to the column count. |
| density | "compact" / "normal" / "relaxed" | no | Render density hint. |

No text (`carriesText: false`) — the whole block is typed props. Cells are plain strings: no marks, no reference chips inside a table.

## Markdown render

An optional `**<title>**` bold line, then a markdown pipe table: header row, `---` separator row, one line per row. A title-only or table-only block renders just the part it has.

## Typed actions

Five actions cover the grid. Column addressing accepts exactly one of `column` (by name) or `columnIndex` (by position); `addColumn` rejects a duplicate name and back-fills existing rows with `fill` (default empty string); row inserts default to the end and pad or truncate `cells` to the column count.

**structured-table — row and column actions**

```
structured-table.addRow(cells: string[], index?: number) -> props patch: { rows }  # Insert a row (cells padded/truncated to the column count); index defaults to the end.
structured-table.removeRow(index: number) -> props patch: { rows }  # Remove the row at the given index.
structured-table.updateCell(rowIndex: number, column?: string, columnIndex?: number, value: string) -> props patch: { rows }  # Set one cell, addressing the column by name (column) or position (columnIndex).
structured-table.addColumn(name: string, index?: number, fill?: string) -> props patch: { columns, rows }  # Insert a column (default at the end), extending every row with the fill value.
structured-table.removeColumn(column?: string, columnIndex?: number) -> props patch: { columns, rows }  # Remove a column by name (column) or position (columnIndex), shrinking every row.
```

## In the editor

A non-editable atom leaf node with its own React render surface (`StructuredTableDocsBlock`). There is no slash-menu entry today — structured tables enter a document through agent ops or existing content.

## Agent notes

- Edit cells through the actions, never by hand-patching the `rows` array — actions validate, normalize row widths, and return undo inverses.

- Rejections come back at `$.params.<name>` (e.g. an out-of-range `index` or a duplicate column name) without touching the document.

## Theming

This block's theme file is `components/structured-table.json` in a theme folder (`themes/<id>/`; see 20-implementation/40-theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`. Spacing and rule tokens (widths, paddings, opacity, and fontSize) are non-color values stored as single strings: lengths use a px unit and opacities are bare numbers.

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-table-border | Outer wrapper border (default transparent) |
| headerBg | --docs-table-header-bg | Header row background (default transparent) |
| headerFg | --docs-table-header-fg | Header text color |
| headerRule | --docs-table-header-rule | Header rule color |
| headerRuleWidth | --docs-table-header-rule-width | Header rule thickness |
| headerRuleOpacity | --docs-table-header-rule-opacity | Header rule opacity |
| rowRule | --docs-table-row-rule | Row rule color |
| rowRuleWidth | --docs-table-row-rule-width | Row rule thickness |
| rowRuleOpacity | --docs-table-row-rule-opacity | Row rule opacity |
| cellPaddingY | --docs-table-cell-pad-y | Vertical cell padding |
| cellPaddingX | --docs-table-cell-pad-x | Column gap |
| fontSize | --docs-table-font-size | Cell text size |
| handleRadius | --docs-table-handle-radius | Corner radius of the column/row grab handles (default 3px) |
| handleOffset | --docs-table-handle-offset | How far outside the table edge the grab handles sit (default 12px) |
| selectionPadding | --docs-table-selection-pad | Outward padding of the column/row selection outline (default 3px) |

## Editing

Notion-style grid controls, revealed on hover. Add bars sit just outside the right edge (column) and bottom edge (row), with a corner square that adds both: click adds one, dragging adds several live (ghost preview plus a count) or removes trailing empty columns/rows. Hovering a column shows a six-dot grab handle above it; body rows get one on the left. Clicking a handle selects the whole column or row (a single accent outline) and opens its menu — insert left/right or above/below, move, duplicate, clear contents, delete — while dragging past a small dead zone reorders it: a semi-transparent preview follows the cursor, the source dims, and an accent drop-indicator line marks the target gap. After a single add, focus lands in the new column's header cell or the new row's first cell, the added region flashes accent briefly, and empty header cells show a muted "Column N" placeholder (edit mode only, renumbered with position).

Cells edit in place as plain text — the schema stays `string[][]`, no rich text. `Tab`/`Shift-Tab` move between cells (header first, wrapping across rows), `Enter` moves down the column, `Shift-Enter` inserts a newline, `Escape` exits. `Cmd+A` selects only the cell's contents, never the document; `Cmd+Z` / `Cmd+Shift+Z` commit pending text and forward to the editor's history, so table edits undo and redo like any other. The focused cell draws a 2px accent outline plus small gray notches on its column's top edge and row's left edge.

The header row is the `columns` array: it has a column handle but no row handle (it cannot be moved or deleted), and the last remaining column cannot be deleted. Structural actions first commit any focused cell's pending text and apply to the freshest data, so cell edits are never lost or duplicated by a move. Every edit lands as a single `updateBlock` replacing `columns`/`rows` through the standard op pipeline — validation, undo ledger, auto-save — and agent-facing mutations stay on the typed actions above.
