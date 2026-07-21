A human meets a document as a Notion-style editor: rich blocks, direct manipulation, annotations, live theming. 

This page states what the surface owes a human reader and how a human's edits reach the shared state.

## Reading

- Blocks render as rich components

  - Tables, canvases, annotated code, file trees — not walls of text.

- The page title is furniture derived from the doc's name; the sidebar walks the numbered tree in reading order.

## Editing

- Typing follows Notion semantics

  - Enter, backspace, markdown shortcuts, and the slash menu behave the way a Notion user expects.

- Direct manipulation: a drag grip on every block, band selection from the margins, structure-preserving copy and paste.

- Annotations anchor to blocks and to text spans.

No edit touches the file. Every change the surface makes lands as a typed operation against the canonical state — the mutation model defines them.

## Theming and embedding

- The surface is themable through an open token contract — colors, fonts, spacing — and the theme evolves live while editing.

- It is embeddable: the same editor serves the workbench and any host that wants the docs in place.

## Why

- **Humans learn visually**

  - Rich components and layout carry more than text alone; the reading surface uses them everywhere it can.

- **The editor is the only pen**

  - A human never edits bytes; the surface turns intent into typed operations.

  - That is what keeps a human's edits and an agent's edits the same kind of change.
