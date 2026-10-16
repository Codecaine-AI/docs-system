The list block of the block vocabulary. There is no wrapping list container type: a list is simply a run of consecutive `list-item` siblings. Nesting is expressed by child `list-item` blocks, not by markup. An item with `checked` set is a checklist task with a box.

## Example

- A bullet item.

  - A nested item is a child list-item block, not markup.

2. An ordered item (`ordered: true`).

3. Numbering is derived from the sibling run.

A checklist is a run of items with `checked` set.

- [ ] An open task (`checked: false`).

- [x] A done task (`checked: true`).

## State Schema

**ListItemState** — packages/docs-model/src/components/rich-text/state.ts#ListItemState

```
ordered?: boolean  # true renders a numbered item; absent or false renders a bullet.
checked?: boolean  # Task state. Absent renders an ordinary item, false an open task, and true a done task. It works with ordered.
```

```json
{
  "ordered": true,
  "checked": false
}
```

Carries delta text (`carriesText: true`) with the full mark set.

## Doc Renderer

The slash menu lists **Bullet list** and **Numbered list**. Input rules: `-` or `*` plus a space starts a bullet item. A number plus `.` and a space starts an ordered item. Like heading's `level`, the editor keeps an absent `ordered` prop absent across round trips.

A task item draws a box before its text. A done task shows a ticked box and muted text.

- Click the box in the editor to toggle the task.

- The slash menu lists **To-do list**, which starts an open task.

- At the start of a line, `[ ]` or `[x]` plus a space starts an open or a done task.

- Enter on a task item starts a new open task.

- The viewer and published pages show the box, but a click does not toggle it. These read-only surfaces have no op channel.

## Agent Renderer

A `-` bullet, or `1.` numbering when `props.ordered === true`, indented two spaces per nesting depth. Numbering is computed per consecutive run of list-item siblings. A non-list sibling resets the run, so an ordered list always restarts at 1 after an interruption. A list-item's children render as nested list lines (depth + 1) instead of flowing back to depth zero.

A task item adds a box after its marker: `- [ ]` for an open task and `- [x]` for a done task. An ordered task renders as `1. [ ]`. Migration reads GitHub task-list syntax back into `checked`.

## Agent Notes

- To nest, `moveBlock` an item into another item's `children`. Never indent with spaces in the text.

- Ordered numbering is derived at render time from sibling position. There is no stored number to keep in sync.

- Use a checklist to track open and done work, such as an install checklist or a release checklist. Use plain bullets for facts and for steps nobody ticks off.

- Tick a task with `docs_list_item_set_checked` and `{ checked: true }`. An `updateBlock` patch of `props.checked` through `docs_apply_ops` has the same result.

- The flat-hierarchy, packed-bullet, and list-length lint rules skip task items. A checklist can be long, and short imperative items are fine.

## Theme

This block's theme file is `components/list-item.json` in the active theme folder. By default that folder is the Global theme at `~/.local/state/codecaine-docs/themes/global/`. A repo `themes/<id>/` folder is active only when the host serves no Global theme. Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`. The contract is Theming.

| Key | CSS variable | Styles |
| --- | --- | --- |
| marker | --docs-list-marker-fg | Bullet dot / ordered counter color |
