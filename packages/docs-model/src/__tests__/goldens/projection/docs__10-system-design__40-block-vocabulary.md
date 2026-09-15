Every block type defines two forms of itself: a rich component in the workbench and a deterministic, greppable markdown form on the agent surface. The vocabulary is the set of eighteen types both renders speak, grouped into nine component families. These pages are the per-family reference.

> **Decision: Eighteen Registered Types** — The source of truth is `DOC_BLOCK_TYPES` in docs-model's `doc-schema.ts`: exactly eighteen type strings. A small vocabulary keeps the render stable, the editor learnable, and the agent edit surface enumerable.

For documenting agentic systems, three of those types carry the whole model:

> A state-shape block carries the shape of state and an example instance side by side; an interaction-surface block lists the operations that change or query it; annotated code blocks hold the source evidence.

## The Eighteen Types

| type | family | purpose |
| --- | --- | --- |
| paragraph | rich-text | Rich text prose (delta spans); the default block. |
| heading | rich-text | Section heading; props.level picks h1-h6 (default 2). |
| list-item | rich-text | Bullet (or ordered) item; nesting via child list-item blocks. |
| quote | rich-text | A block quote of rich text. |
| callout | rich-text | Highlighted note; props.tone colors it, free-form props.kind labels the chip. |
| divider | rich-text | A horizontal rule separating sections. |
| image | rich-text | Image from the bundle's assets/images/; props: src, alt, caption. |
| image-grid | rich-text | Ordered images with individual headings, alt text, captions, and responsive columns. |
| video | rich-text | Bundle video (src) or external URL (url); YouTube/Vimeo/Loom embed privacy-friendly players. |
| html | rich-text | Self-contained HTML/CSS artifact in an opaque-origin sandbox; optional inline scripts. |
| code | code | Source code in text; props.language plus optional props.annotations side notes. |
| structured-table | structured-table | Typed table from props.columns (string[]) and props.rows (string[][]). |
| file-tree | file-tree | Rendered tree of props.entries: { path, note?, change?, from? }. |
| state-shape | state-shape | Recursive field tree ({ name, type?, required?, description?, fields? }) describing the shape of a structure's state; optional source link. |
| interaction-surface | interaction-surface | Operation signatures ({ name, description?, params?, returns?, kind? }) describing how a system is changed or queried. |
| sequence | sequence | UML-style sequence diagram; props.src (or sequenceId) points at a SequenceDocument, optional props.title. |
| canvas | canvas | Embedded interactive canvas; props.canvasId (or legacy src) plus an optional view crop. |
| process-outline | process-outline | Ordered process outline; props.steps holds the recursive step tree with optional clarification-note leaves. |

## The Families

- Rich text

  - paragraph · heading · list-item · quote · callout · divider · image · image-grid · video · html

- code

- structured-table

- file-tree

- state-shape

- interaction-surface

- sequence

- canvas

- process-outline

## Page Structure

Every family page follows one skeleton; the deep story of how a component operates lives on the family's own page, not here.

- **Opener**

  - What the family is and which types it owns.

- **Six contract sections**

  - One H2 per element of the Block design contract: state schema, typed actions, doc renderer, agent renderer, theme, agent adapter.

  - Each section states how that element works for this family.

- **Depth**

  - Inline when short; a subpage when deep.

  - Rich text keeps per-type reference pages as subpages.
