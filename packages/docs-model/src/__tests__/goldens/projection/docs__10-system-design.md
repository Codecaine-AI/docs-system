## Docs Architecture

The documentation has a strict layout allowing every new piece of knowledge has one clear home

- This ensures agents making changes lands it where it belongs instead of scattering sloppy docs.

Doc standards holds the structure and the standards that keep it that way.

- **Foundation**

  - Why the system exists.

- **Design**

  - What the system does and WHY.

- **Implementation**

  - How the code delivers it today.

The standards — directory structure, numbering, titles and openings, linking — are child docs there, each rule paired with its rationale.

## Translation layer

Each doc is a canonical JSON object with two rendering surfaces, one per reader type.

Translation layer defines both.

- **Humans**

  - A Notion-style editor in the workbench.

- **Agents**

  - Rendered markdown and typed operations through the CLI.

- Neither reader edits the file through read / write commands

  - Every change lands as a typed operation against the same state.

## Data model

The data model is the actual data structure under the hood.

- A document is a tree of blocks; rich text is attributed spans inside them.

- Blocks carry typed state; annotations anchor to blocks and spans.

- Canonical bytes: the same state always serializes to the same file.

- State changes only through typed operations, validated before anything persists.

## Block vocabulary

The block vocabulary explains all fourteen block types, with an example of each.

- The set is closed: both surfaces know every block they will ever meet.

- Each type's doc lists its props and typed actions, and shows the block in use.

## Package boundaries

The implementation is cut into seven packages. Package boundaries records which seams are forced by runtimes and which are judgment calls.
