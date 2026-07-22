Copy and paste move structure, not strings. The clipboard carries typed block payloads, and a paste becomes ordinary typed operations — so nothing pasted can bypass validation.

## The Rule

- **Copy carries structure**

  - A block selection ships a closed, top-level slice — whole blocks, never fragments of a neighbor.

  - Block props, atom text, and references travel as typed JSON payloads in the clipboard markup (`data-block-props`, `data-block-text`, the reference payload), never as lossy HTML alone.

- **Block runs land at top level**

  - An empty caret block is replaced; at a block's start or end the run inserts before or after; mid-text, the block splits around it.

  - Never accidental nesting — depth is authored deliberately, not created by a paste.

  - Inline and partial-selection pastes merge into the caret block as marked text, the way a text editor would.

- **The copy is a new block**

  - Pasted blocks mint fresh ids; the original keeps its identity, so anchors and annotations stay with the source.

- **External content converts**

  - HTML from outside lands as separate typed blocks — headings, paragraphs, list items — not one merged blob.

- **Nothing bypasses the gate**

  - A paste persists as ordinary ops, and the save validates the entire resulting document before bytes reach disk.

  - Malformed clipboard data degrades to plain text instead of writing a span that fails validation later.

## Why

- **Structure is the point**

  - A paste that flattened blocks would make the human surface a text editor with pictures; structure surviving the clipboard is what keeps both surfaces honest.

- **The clipboard is untrusted input**

  - Anything can put anything on a clipboard. Defensive parsing plus the validation gate means the worst paste costs formatting, never document integrity.
