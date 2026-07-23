The slash menu turns a typed query into a deliberately small set of block commands. It defines what appears, how the list filters and moves, and where the chosen block lands. The contract preserves familiar AFFiNE interaction metrics while keeping the editor's own runtime and block structure.

## Structure

A slash at the start of an inline run or after whitespace opens the menu. The uninterrupted text between that slash and the caret is the live query.

| Group | Commands |
| --- | --- |
| Basic | Text; Heading 1, 2, and 3; Other Headings (4–6); Bullet list; Numbered list; Code Block; Quote; Divider |
| Blocks | Callout; Canvas; Image |

- **Menu Geometry**

  - The panel is 280px wide and scrolls past a 390px maximum height. Padding is 8px on the top, bottom, and left and 4px on the right.

  - Each row is 44px tall with a 28px bordered icon box, a name, and one truncated description line.

  - The panel starts 6px below the query range. A submenu starts 12px from its parent row and flips when the available space is tight.

## The Rule

> **Decision: Membership Is Curated** — The slash menu is an authoring policy, not an inventory of every registered block type. A type earns a command only when a blank instance should be user-insertable.

The type registry described in Block design and slash-menu membership are separate contracts. Registering a type does not add a command.

- **Menu Keys Outrank Editor Keymaps**

  - Arrow Up, Arrow Down, Tab, and Shift-Tab move through the active rows with circular wrap.

  - Arrow Right or Enter opens the selected submenu. Arrow Left closes it and returns control to the parent row.

  - Enter runs the selected action. Escape closes the menu without inserting.

  - When the query has no results, keys pass through to the editor. Backspace keeps the query open so it can match again; any other key closes it.

- **Commands Preserve Block Structure**

  - A wrapped text command converts the current block in place when the slash query is the whole line. The block keeps its identity.

  - Code and atom commands replace an emptied trigger block because their content shape differs from wrapped text.

  - When text remains before the slash, the new block lands immediately after the current block as a true sibling. It never enters the current block's child slot.

- **Filtering Keeps One Selection Model**

  - An empty query shows the group-sorted command set. Hover and keyboard movement update the same selected row.

  - A query fuzzy-matches names and aliases, expands submenu contents, ranks matches by substring relevance, and hides group headers so results read as one flat list.

- **Commands Outside the Menu**

  - Sequence and state-shape are deliberately absent.

  - Structured-table is absent. It enters through typed agent operations or existing document content.

  - Video is absent because its authoring path is content-driven: provider URL paste or drop, or a host-backed video file drop.

  - Waterfall is absent.

  - File-tree and interaction-surface are absent.

## Why

- **Borrowed Semantics, Local Runtime**

  - The AFFiNE-derived data model, filtering order, keyboard behavior, and measured geometry provide one coherent command interaction instead of locally invented variants.

  - AFFiNE supplies the interaction precedent, not a second editor architecture. The document's block structure and editor runtime remain authoritative.

- **A Small Authoring Vocabulary**

  - Curated membership keeps the authoring vocabulary opinionated while the registered block contract remains broader.
