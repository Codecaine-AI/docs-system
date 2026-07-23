System design defines the contracts for organizing documentation, rendering canonical document state, mutating block trees, and presenting the workbench. Its five sections separate corpus rules, reader surfaces, state structure, canonical content types, and editor behavior.

## Docs Architecture

Documentation is divided into three layers so each piece of knowledge has one canonical home.

- Each change lands in the layer that owns its rationale.

Doc standards defines that structure and the rules that preserve it.

- **Foundation**

  - Why the system exists.

- **System design**

  - What the system does and why.

- **Implementation**

  - How this build realizes those contracts.

The child docs cover directory structure, numbering, titles and openings, and linking. Each rule is paired with its rationale.

## Reader Surfaces

Each doc is a canonical JSON object with two rendering surfaces, one per reader type.

Translation layer defines both.

- **Humans**

  - A Notion-style editor in the workbench.

- **Agents**

  - Rendered markdown and typed operations through the CLI.

- Neither reader edits the file through read / write commands

  - Every change lands as a typed operation against the same state.

## Document State

The data model defines canonical document state, block identity, annotations, serialization, and mutation.

- A document is a tree of blocks; rich text is attributed spans inside them.

- Blocks carry typed state; annotations anchor to blocks and spans.

- The same document state always serializes to the same canonical bytes.

- State changes only through typed operations, validated before anything persists.

## Canonical Block Types

Block vocabulary defines and exemplifies every canonical type in `DOC_BLOCK_TYPES`.

- Both surfaces know every block they will meet because the set is closed.

- Each type's doc lists its props and typed actions, and shows the block in use.

## Designed Editor Surface

Editor design specifies the workbench surface around and between blocks.

- Its contracts cover reading, editing, styling controls, shared visuals, and canvas and media behavior.

- Per-block appearance and editing behavior remain in the block vocabulary.
