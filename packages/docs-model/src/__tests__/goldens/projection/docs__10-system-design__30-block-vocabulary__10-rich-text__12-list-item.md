The list block of the block vocabulary. There is no wrapping list container type: a list is simply a run of consecutive `list-item` siblings, and nesting is expressed by child `list-item` blocks, not by markup.

## State

| prop | type | required | notes |
| --- | --- | --- | --- |
| ordered | boolean | no | true renders a numbered item; absent or false renders a bullet. |

Carries delta text (`carriesText: true`) with the full mark set.

## Markdown render

A `-` bullet, or `1.` numbering when `props.ordered === true`, indented two spaces per nesting depth. Numbering is computed per consecutive run of list-item siblings: a non-list sibling resets the run, so an ordered list always restarts at 1 after an interruption. A list-item's children render as nested list lines (depth + 1) instead of flowing back to depth zero.

## In the editor

Slash menu: **Bullet list** and **Numbered list**. Input rules: `-` or `*` plus a space starts a bullet item; a number plus `.` and a space starts an ordered item. Like heading's `level`, the editor keeps an absent `ordered` prop absent across round trips.

## Agent notes

- To nest, `moveBlock` an item into another item's `children` — never indent with spaces in the text.

- Ordered numbering is derived at render time from sibling position; there is no stored number to keep in sync.

## Theming

This block's theme file is `components/list-item.json` in a theme folder (`themes/<id>/`; see 20-implementation/40-theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`.

| Key | CSS variable | Styles |
| --- | --- | --- |
| marker | --docs-list-marker-fg | Bullet dot / ordered counter color |
