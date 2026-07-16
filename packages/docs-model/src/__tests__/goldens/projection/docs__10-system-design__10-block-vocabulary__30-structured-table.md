# structured-table

The typed table of the block vocabulary: a columns × rows grid of strings kept in props, not prose. Use it for index tables, comparison matrices, and anything an agent should edit cell-by-cell instead of re-flowing text.

## State

| prop | type | required | notes |
| --- | --- | --- | --- |
| title | string | no | Optional bold caption above the table. |
| columns | string[] | yes | Header names, in order. |
| rows | string[][] | yes | One string array per row; actions normalize each row to the column count. |
| density | "compact" / "normal" / "relaxed" | no | Render density hint. |

No text (`carriesText: false`) — the whole block is typed props. Cells are plain strings: no marks, no reference chips inside a table.

## Markdown projection

An optional `**<title>**` bold line, then a markdown pipe table: header row, `---` separator row, one line per row. A title-only or table-only block projects just the part it has.

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

This block's theme file is `components/structured-table.json` in a theme folder (`themes/<id>/`; see 20-implementation/40-theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`.

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-table-border | Table and cell borders |
| headerBg | --docs-table-header-bg | Header row background |
| headerFg | --docs-table-header-fg | Header text color |
