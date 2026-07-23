Selection and movement treat top-level blocks as a contiguous structural run. Dragging across page whitespace creates a screenshot-style band backed by a real editor selection, so direct manipulation and the clipboard act on the same blocks. This page defines how a band starts, collapses, moves, deletes, and pastes.

## Structure

| Gesture | Result |
| --- | --- |
| Drag at least 4 px from a page margin, a gap between blocks, or the empty run-out beside a line | A screenshot-style rectangle collects the touched top-level blocks into one contiguous band |
| Move less than 4 px before release | A plain click clears the band; a click inside the editor column also places the caret |
| Press on text, inside a node view, or on a real control | The band stays out of the gesture and the local interaction owns it |
| Press Escape | The band clears and its real editor selection collapses to a caret at the run's first block |
| Press Backspace or Delete with a band active | The complete selected run is deleted in one edit |
| Drag the grip of a selected block | The complete run moves as one top-level slice under a stacked ghost |
| Paste a copied block run | The blocks land as top-level siblings rather than inside the caret block |

## The Rule

- **The band is contiguous and top-level**

  - The first and last top-level blocks touched by the rectangle bound the range; every block between them joins the selection.

  - The rectangle and selected blocks use borderless soft fill. The selection has no hard ring.

- **Existing interactions keep their press**

  - Text keeps native text selection. Clicking into it clears an active band.

  - Node views keep their In-Place Editing interactions.

  - Buttons, links, inputs, text areas, selects, and button-role elements keep their native or component behavior.

- **The visual band and the editor selection are one selection**

  - Every band update writes a real editor selection over the same run; mouse release returns focus to the editor.

  - Copy and cut serialize complete blocks with their types, order, properties, and children intact.

  - Escape clears the soft fill and collapses the editor selection, so a subsequent copy cannot act on a hidden range.

- **A selected run moves and deletes as one slice**

  - Backspace and Delete remove the complete range.

  - Hover reveals one left grip for the top-level block under the pointer. Dragging the grip of any selected block picks up the complete range.

  - The drag ghost stacks one full-fidelity copy per selected block while the source run dims.

  - Block drops snap to top-level boundaries. They do not nest a selected run inside a paragraph, heading, callout, or another block.

- **Block-shaped paste preserves top-level structure**

  - An empty caret block is replaced by the run.

  - A caret at a block edge places the run before or after that block.

  - A caret in the middle of paragraph text splits the paragraph around the inserted run.

  - A deeper caret places the run after its complete top-level block.

  - Inline text and a partial single-block selection keep normal merge-at-caret behavior.

> **Decision: Native Drag Handoff** — The hover grip owns block pickup, then hands a single block's selection and dragged slice to native ProseMirror movement. The editor adds the top-level drop clamp and selected-run move.

## Why

- **Whitespace can carry structure**

  - Margins, gaps, and line run-out expose block selection without taking text selection or embedded interactions away from their owners.

- **One selection model preserves trust**

  - The highlight, clipboard, deletion, and Escape all address the same range, so visible selection never disagrees with the next command.

- **Top-level slices preserve document shape**

  - Movement and paste retain block boundaries instead of fitting a copied run into another block's child slot.
