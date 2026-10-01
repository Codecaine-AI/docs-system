The list block of the block vocabulary. There is no wrapping list container type: a list is simply a run of consecutive `list-item` siblings, and nesting is expressed by child `list-item` blocks, not by markup.

## Example

- A bullet item.

  - A nested item is a child list-item block, not markup.

2. An ordered item (`ordered: true`).

3. Numbering is derived from the sibling run.

## State Schema

**ListItemState** — packages/docs-model/src/components/rich-text/state.ts#ListItemState

```
ordered?: boolean  # true renders a numbered item; absent or false renders a bullet.
```

```json
{
  "ordered": true
}
```

Carries delta text (`carriesText: true`) with the full mark set.

## Doc Renderer

Slash menu: **Bullet list** and **Numbered list**. Input rules: `-` or `*` plus a space starts a bullet item; a number plus `.` and a space starts an ordered item. Like heading's `level`, the editor keeps an absent `ordered` prop absent across round trips.

## Agent Renderer

A `-` bullet, or `1.` numbering when `props.ordered === true`, indented two spaces per nesting depth. Numbering is computed per consecutive run of list-item siblings: a non-list sibling resets the run, so an ordered list always restarts at 1 after an interruption. A list-item's children render as nested list lines (depth + 1) instead of flowing back to depth zero.

## Agent Notes

- To nest, `moveBlock` an item into another item's `children`. Never indent with spaces in the text.

- Ordered numbering is derived at render time from sibling position; there is no stored number to keep in sync.

## Theme

This block's theme file is `components/list-item.json` in the active theme folder. By default that folder is the Global theme at `~/.local/state/codecaine-docs/themes/global/`. A repo `themes/<id>/` folder is active only when the host serves no Global theme. Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`. The contract is Theming.

| Key | CSS variable | Styles |
| --- | --- | --- |
| marker | --docs-list-marker-fg | Bullet dot / ordered counter color |
