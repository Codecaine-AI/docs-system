A document is one canonical state that neither reader touches directly. 

That state is a translation layer between humans and AI

- Each reader meets it through a renderer that speaks its language, and changes it through interactions built for how it works. 

This section defines the idea and the contract between the surfaces; each surface's own doc goes deeper.

## The Issue

The issue is that people are trying to fit the same medium to both humans and agents, even though we have very different optimal information consumption methods

**Humans**

- Text is a great medium, but people learn and understand much more when you can use multiple senses 

- HTML is good as this allows for making significantly better visualizations

**Agents**

- Excel at text but lacking in the visual space

---

Markdown has been the standard for interacting with agents, and for good reason

- Models operate largely in a text based world and simple text system allow for huge gains

Markdown is not good for human readers, especially as the size of documents grows

- I have found myself many a time just not reading the MD docs at all as the UX for it is terrible

Recently HTML or MDX have been touted as the best way to do it, which has merit, but has flaws

- Extra tokens for HTML and no easy way to edit the components

- Similar issue with MDX

The key idea we need to accept is that AI and humans consume information differently, so there is no true single medium that is best for both of use.

## The Solution

<!-- canvas: interaction-surfaces view=one-state-two-readers title="One state, two readers" -->

Every document is a `doc.json` bundle: an id-keyed tree of blocks — the data model — serialized to serialization. 

No reader consumes this form directly**.** 

It is built for precision, not reading: stable ids make every block addressable, canonical bytes make every change diffable and testable, and the whole tree is validated on every write.

## The surfaces

- Human surface

  - The Notion-style editor: rich blocks, direct manipulation, annotations, themes.

- Agent surface

  - Rendered markdown and typed operations through the CLI.

## Symmetry, in practice

| Interaction | Human surface | Agent surface |
| --- | --- | --- |
| Read | Blocks rendered as rich UI components | Deterministic markdown render (docs render) |
| Search | Sidebar tree, backlinks, in-app navigation | docs grep across rendered docs |
| Write | Direct manipulation in the editor | Typed block operations via CLI/API |
| Safety | Autosave, live updates, single-use undo | Hash preconditions, draft locks |
| Discovery | Slash menu and block UI | GET /api/blocks and the docs skill |

Neither column is primary. A feature that improves one surface must not degrade the other; when the two pull in different directions, the canonical state grows whatever structure lets each surface stay optimal — that is the point of keeping state and surface separate.
