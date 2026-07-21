<!-- canvas: interaction-surfaces view=one-state-two-readers title="One state, two readers" -->

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

Recently HTML or MDX have been touted as the best way to do it, which has merrit, but has flaws

- Extra tokens for HTML and no easy way to edit the components

- Similar issue with MDX

The key idea we need to accept is that AI and humans consume information differently, so there is no true single medium that is best for both of use.

## The Solution

### Canonical Shared State

Every document is a `doc.json` bundle: an id-keyed tree of blocks — the data model — serialized to canonical bytes. 

No reader consumes this form directly**.** 

It is built for precision, not reading: stable ids make every block addressable, canonical bytes make every change diffable and testable, and the whole tree is validated on every write.

**Shared State**

The idea is to have a shared representation of the information, but then different ways to render the information to the desired audience.

Every document is this system is a one canonical state (an id-keyed block tree) that neither reader touches directly. 

A human meets it as a Notion-style editor: 

- direct manipulation, drag, comments, themes. 

An agent meets it as rendered MDX through the CLI

- stable, greppable, precisely addressable

One idea underpins everything else in this system: a document is a single canonical state with two kinds of readers, and each reader gets a surface engineered for how it consumes. A human should never have to read storage bytes; an agent should never have to drive a UI. Both work on the same truth, through the form that is optimal for them.

## The human interaction surface

A human meets a document as a Notion-style editor in the workbench, rendered by docs-viewer. Blocks appear as rich components — highlighted code, tables, callouts, media, embeds — and editing is direct manipulation: typing with markdown input rules, a slash menu for insertion, drag to reorder, marks for emphasis. Every edit becomes a typed operation against a block id, autosaved and broadcast live to other views.

The surface is embeddable and themable by design: a small set of core building blocks with an open token contract — see theming — so the same document renders in the workbench, an exported site, or any host page, and can be restyled without touching component code.

## The agent interaction surface

An agent meets the same document as rendered markdown. `docs render <path>` prints it; `docs grep <term>` searches every doc as its render. The render is deterministic and pinned byte-for-byte by golden tests, which makes it a contract: an agent never parses `doc.json`, and never has to.

Writing is typed operations, not text patches: the mutation model addresses blocks by id, with hash preconditions and draft locks so concurrent editors fail loudly instead of clobbering each other. Discovery is built in — `GET /api/blocks` enumerates every block type and the actions it supports, so the available moves are learnable by machine rather than tribal memory.

> **WARNING: Open direction: a richer agent render** — Rendered markdown is the current contract. A richer render — MDX-like, keeping typed structure intact through the trip — is an open direction, deliberately unspecified until it earns its shape. The canonical state makes new renders cheap to add without disturbing existing readers.

## Symmetry, in practice

| Interaction | Human surface | Agent surface |
| --- | --- | --- |
| Read | Blocks rendered as rich UI components | Deterministic markdown render (docs render) |
| Search | Sidebar tree, backlinks, in-app navigation | docs grep across rendered docs |
| Write | Direct manipulation in the editor | Typed block operations via CLI/API |
| Safety | Autosave, live updates, single-use undo | Hash preconditions, draft locks |
| Discovery | Slash menu and block UI | GET /api/blocks and the docs skill |

Neither column is primary. A feature that improves one surface must not degrade the other; when the two pull in different directions, the canonical state grows whatever structure lets each surface stay optimal — that is the point of keeping state and surface separate.
