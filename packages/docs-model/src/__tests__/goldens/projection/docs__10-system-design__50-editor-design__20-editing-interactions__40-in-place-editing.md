Object blocks edit inside the surface where they render; no modal editor replaces the document context. Custom node views add block-specific editing while the outer editor keeps structural authority. This page defines that shared pattern and the read-only fallback for types without it.

## Structure

| Pattern | Outer Editor | Inside the Block |
| --- | --- | --- |
| Editable text node view | Owns block position, selection, and history | Edits the block's text and local controls |
| Editable atom node view | Treats the whole block as one structural leaf | Owns focused editing islands and writes block state back |
| Read-only atom view | Treats the whole block as one structural leaf | Renders current state without an in-place editor |

## The Rule

- **Edit where the block renders**

  - An editable object keeps its rendered form in the document and reveals its controls in place.

- **Editable text stays part of the document**

  - The code node view establishes the text pattern: its content remains editable by the outer editor while the block supplies its own in-place controls.

- **Editable atoms keep one document-level history**

  - The structured-table node view places a mini rich-text editor in each cell, but undo and redo remain document-level.

  - Its block-vocabulary contract owns cell behavior, focus furniture, and commit timing.

- **A missing custom view is an explicit read-only state**

  - Types without a custom node view render their current state as read-only atoms without local editing controls.

  - Their state changes through Typed actions until the type deliberately earns an editable node view.

> **Open call: Which Object Blocks Require Editable Node Views?** — No general policy determines which object types must support in-place editing. Each type needs a deliberate decision; the shared read-only atom view remains the fallback.

## Why

- **The document remains the workspace**

  - In-place controls preserve the object's position and its surrounding explanation while it changes.

- **Undo remains coherent**

  - Embedded editing islands commit into the outer document instead of creating a second, competing history.

- **Editing capability stays deliberate**

  - A custom node view is a type-owned interaction contract, not an automatic consequence of registry membership.
