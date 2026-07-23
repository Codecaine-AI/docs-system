Editing is the default human surface: every document is always editable, with no separate read mode and no save button. Changes autosave through The save pipeline: keystroke to disk after they become typed operations. This section defines the interaction contract for typing, insertion, structural selection, movement, and object editing.

## The Editing Contract

- **Typing Model**

  - Enter, Backspace, list escape, and Markdown shortcuts preserve the block tree while matching learned Notion behavior.

- **Slash Menu**

  - A curated command surface converts the current block or inserts a true sibling without exposing every registered type.

- **Selection and Movement**

  - A contiguous block band is a real editor selection that copies, cuts, pastes, moves, and deletes as structure.

- **In-Place Editing**

  - Custom node views edit an object inside its rendered surface; types without one remain read-only atoms edited through typed actions.
