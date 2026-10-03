Every block type defines two forms of itself: a rich component in the workbench and a deterministic, greppable markdown form on the agent surface. The vocabulary is the set of twenty-two types both renders speak. Fourteen component families own those types, and their reference pages sit in five groups.

> **Decision: Twenty-Two Registered Types** — The source of truth is `DOC_BLOCK_TYPES` in docs-model's `doc-schema.ts`, which lists exactly twenty-two type strings. A small vocabulary keeps the render stable, the editor learnable, and the agent edit surface enumerable.

For documenting agentic systems, three of those types carry the whole model:

A state-shape block carries the shape of state and an example instance side by side. An interaction-surface block lists the operations that change or query it. Annotated code blocks hold the source evidence.

## The Twenty-Two Types

| type | family | purpose |
| --- | --- | --- |
| paragraph | rich-text | Rich text prose (delta spans). The default block. |
| heading | rich-text | Section heading. props.level picks h1-h6 (default 2). |
| list-item | rich-text | Bullet (or ordered) item. Nesting via child list-item blocks. |
| callout | rich-text | Highlighted note. props.tone colors it, props.variant picks the style (eyebrow by default, or hairline, rail, tab), and free-form props.kind names the type. |
| divider | rich-text | A horizontal rule separating sections. |
| image | rich-text | Image from the bundle's assets/images/. Props: src, alt, caption. |
| image-grid | rich-text | Ordered images with individual headings, alt text, captions, and responsive columns. |
| video | rich-text | Bundle video (src) or external URL (url). YouTube/Vimeo/Loom embed privacy-friendly players. |
| html | rich-text | Self-contained HTML/CSS artifact in an opaque-origin sandbox. Optional inline scripts. |
| code | code | Source code in text. props.language plus optional props.annotations side notes. |
| pseudocode | pseudocode | Algorithm sketch in text. Keywords and calls highlight, and optional props.diff reads leading +/- markers. |
| structured-table | structured-table | Typed table from props.columns (string[]) and props.rows (string[][]). |
| file-tree | file-tree | Rendered tree of props.entries: { path, note?, change?, from? }. |
| file-explorer | file-explorer | Editor-sidebar rows of props.entries with change badges, plus optional props.title and props.maxRows. |
| state-shape | state-shape | Recursive field tree ({ name, type?, required?, description?, fields? }) describing the shape of a structure's state. Optional source link. |
| interaction-surface | interaction-surface | Operation signatures ({ name, description?, params?, returns?, kind? }) describing how a system is changed or queried. |
| sequence | sequence | UML-style sequence diagram. props.src (or sequenceId) points at a SequenceDocument, optional props.title. |
| canvas | canvas | Embedded interactive canvas. props.canvasId (or legacy src) plus an optional view crop. |
| process-outline | process-outline | Ordered process outline. props.steps holds the recursive step tree with optional clarification-note leaves. |
| stack | stack | Boundary stack of nested named layers. props.nodes holds the layer tree with uses arrows, and optional props.boundaries name the rule enforced between layers. |
| call-stack | call-stack | One code path frame by frame. props.frames holds call and branch rows with comment, change, and path:line source. |
| component-tree | component-tree | Render tree. props.nodes holds component, hook, and branch rows with comment, change, and path:line source. |

## The Five Groups

The family pages sit in five groups. Each group page opens with a table of its block types and links to each family page.

- Text and media

  - The Rich text family owns paragraph, heading, list-item, callout, divider, image, image-grid, video, and html.

- Code

  - The code and pseudocode families each own the one type of the same name.

- Trees and paths

  - The file-tree, file-explorer, call-stack, and component-tree families each own the one type of the same name.

- Structured reference

  - The state-shape, interaction-surface, and structured-table families each own the one type of the same name.

- Flow and diagrams

  - The process-outline, stack, sequence, and canvas families each own the one type of the same name.

## Page Structure

Every family page follows one skeleton. The deep story of how a component operates lives on the family's own page, not here.

- **Opener**

  - What the family is and which types it owns.

- **Six contract sections**

  - One H2 per element of the Block design contract: state schema, typed actions, doc renderer, agent renderer, theme, agent adapter.

  - Each section states how that element works for this family.

- **Depth**

  - Inline when short; a subpage when deep.

  - Rich text keeps per-type reference pages as subpages.
