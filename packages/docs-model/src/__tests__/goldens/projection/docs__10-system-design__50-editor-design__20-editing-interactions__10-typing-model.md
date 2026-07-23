Typing edits the document's block structure without creating accidental children. Enter, Backspace, Tab, and Markdown-like patterns follow learned Notion semantics while respecting block identity and schema boundaries. This page defines those key-to-structure mappings.

## Structure

Structural keys act on the cursor's visual block context:

| Key | Context | Result |
| --- | --- | --- |
| Enter | Start of a non-empty text block | Inserts an empty paragraph sibling above; the original block stays intact and keeps the cursor. |
| Enter | Middle of a text block | Splits into same-type siblings; the head keeps its block ID, the tail mints a fresh ID, and nested children ride with the tail. |
| Enter | End of a non-list text block | Inserts a fresh empty paragraph sibling below. |
| Enter | Non-empty list item | Splits into a sibling list item with the same ordered or unordered form. |
| Enter | Empty list item | Outdents one level when nested; converts the top-level item to a paragraph. |
| Backspace | Start of a heading, quote, callout, or list item | Outdents a nested list item one level; otherwise converts the block to a paragraph. |
| Backspace | Start of a paragraph | Merges into the deepest last text block of the visually preceding sibling in one press. |
| Tab | List item / code block | Nests the item under its previous list sibling / inserts two spaces. |
| Shift-Tab | Text block nested inside a list item | Outdents one level; following siblings remain visually below by becoming its children. |
| Enter | Code block | Inserts a newline in the same block. |
| Mod-Enter | Code block | Exits to a fresh paragraph sibling below. |

Typing patterns convert only at the start of a paragraph or when their closing inline delimiter lands:

| Typed Pattern | Result |
| --- | --- |
| # / ## / ### plus space | Heading levels 1 / 2 / 3. |
| - or * plus space | Unordered list item. |
| Number plus . plus space | Ordered list item. |
| > plus space | Quote. |
| --- | Divider, followed by an empty paragraph; conversion fires on the third hyphen. |
| ``` | Code block; conversion fires on the third backtick. |
| **text** / `text` | Bold / inline code. |
| *text* / ~~text~~ | Literal text; italic and strike remain formatting-command shortcuts only. |

## The Rule

- **Siblings are the default**

  - Enter creates a boundary beside the current block. It never uses the block's child slot as an incidental continuation.

  - Enter over selected text deletes the selection and applies the cursor rule at the collapse point as one edit. A cross-block range resolves through the head block rather than creating nesting.

- **Lists follow a depth ladder**

  - Repeated Enter presses on an empty item walk outward one level at a time, then leave the list as a paragraph.

  - Backspace at an item's text start walks the same ladder whether the item is empty or not.

  - Tab nests under the previous list sibling. Shift-Tab can free any text block nested inside a list item.

- **Backspace follows the rendered order**

  - A paragraph below a nested list joins the deepest visible item in one press, not one structural level per press.

  - When the preceding visual block is an atom or code block, the editor's ordinary node-boundary behavior owns the key.

> **Decision: Two Inline Typing Conversions** — Bold and inline code delimiters convert as the closing delimiter lands. Italic and strike delimiters stay literal; their formatting commands remain available through keyboard shortcuts.

- **Code owns its line break**

  - Enter is content inside a code block, so it inserts a newline instead of splitting the block.

  - Mod-Enter is the explicit structural exit to a paragraph sibling.

## Why

- **Learned interaction**

  - Notion semantics make structural editing predictable without a private key dialect.

- **Stable identity**

  - The head-retained, tail-fresh split follows the anchor contract in The document & block tree.

- **Component ownership**

  - Block design keeps schema-aware conversion rules with their component, so a shortcut cannot create a structurally invalid block.

- **Visual adjacency**

  - Backspace acts on the line the reader sees immediately above, so the visible document predicts the result.
