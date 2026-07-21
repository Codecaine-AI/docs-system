# Block vocabulary

These docs are written primarily for **agents** to read. The markdown render (`projectToMarkdown` in docs-model, driving the `docs render` / `docs grep` CLI and the backend `GET /api/markdown`) is the agent surface: every block type defines a deterministic, greppable markdown form, so an agent never has to parse `doc.json` just to read a document. The workbench renders the human view from the same blocks.

> **Decision: Sixteen types and no more** — The author surface stays deliberately minimal. The source of truth is `DOC_BLOCK_TYPES` in docs-model's `doc-schema.ts`: exactly sixteen type strings. A small vocabulary keeps the render stable, the editor learnable, and the agent edit surface enumerable.

For documenting agentic systems, three of those types carry the whole model:

> A state-shape block carries the shape of state and an example instance side by side; an interaction-surface block lists the operations that change or query it; annotated code blocks hold the source evidence.

Naming history, in one line: a block's kind field is `type` — the BlockSuite-heritage key `flavour` went through a full wire-format rename and survives only as a READ alias that validation normalizes into `type`; writes always emit canonical `type`.

> **Decision: Retired types never break a corpus** — Validation never rejects a retired or unknown block type. After legacy `flavour` aliasing, any block whose type is a string but not one of the 16 canonical types coerces to a callout, preserving the old type name as `props.kind` (unless the block already carries its own non-empty `kind`); props, text, and children carry over verbatim. That is how the canvas sibling's semantic cards (requirement, decision, constraint, ...) load with zero file rewrites — coerced blocks simply canonicalize on their next save.

## Three groups, nine components

The model has no runtime category constant — the grouping lives in two places. First, `DOC_BLOCK_TYPES` declares the sixteen types in three commented groups: *core text & structure* (paragraph, heading, list-item, quote, code, callout, divider), *structured / engineering* (structured-table, file-tree, interaction-surface, state-shape), and *diagram & media* (mermaid, canvas, sequence, image, video). Second, nine component bundles in `components/<name>/` own the sixteen types exactly once: rich-text owns the eight text-flow types (including image and video), while code, mermaid, file-tree, structured-table, interaction-surface, state-shape, canvas, and sequence each own their namesake.

These pages file the types on a third, reader-facing axis that follows the folder numbering: the 10s are the **rich-text blocks** (the seven core text & structure types), the 20s are the **object blocks** (typed-props state carriers: the structured / engineering four plus mermaid, sequence, and canvas), and the 30s are the **media blocks** (image and video). Same sixteen types, sliced by how an agent edits them: rich-text blocks edit through delta text, object blocks through typed props and actions, media blocks through asset references.

## The 16 block types

| type | group | component | purpose |
| --- | --- | --- | --- |
| paragraph | rich text | rich-text | Rich text prose (delta spans); the default block. |
| heading | rich text | rich-text | Section heading; props.level picks h1-h6 (default 2). |
| list-item | rich text | rich-text | Bullet (or ordered) item; nesting via child list-item blocks. |
| quote | rich text | rich-text | A block quote of rich text. |
| code | rich text | code | Source code in text; props.language plus optional props.annotations side notes. |
| callout | rich text | rich-text | Highlighted note; props.tone colors it, free-form props.kind labels the chip. |
| divider | rich text | rich-text | A horizontal rule separating sections. |
| structured-table | object | structured-table | Typed table from props.columns (string[]) and props.rows (string[][]). |
| file-tree | object | file-tree | Rendered tree of props.entries: { path, note?, change?, from? }. |
| interaction-surface | object | interaction-surface | Operation signatures ({ name, description?, params?, returns?, kind? }) describing how a system is changed or queried. |
| state-shape | object | state-shape | Recursive field tree ({ name, type?, required?, description?, fields? }) describing the shape of a structure's state; optional source link. |
| mermaid | object | mermaid | Mermaid diagram; the source lives in the block's text. |
| canvas | object | canvas | Embedded interactive canvas; props.canvasId (or legacy src) plus an optional view crop. |
| sequence | object | sequence | UML-style sequence diagram; props.src (or sequenceId) points at a SequenceDocument, optional props.title. |
| image | media | rich-text | Image from the bundle's assets/images/; props: src, alt, caption. |
| video | media | rich-text | Bundle video (src) or external URL (url); YouTube/Vimeo/Loom embed privacy-friendly players. |

Each type has its own reference page:

- **Rich text (10s):** paragraph · heading · list-item · quote · code · callout · divider

- **Object (20s):** structured-table · file-tree · state-shape · interaction-surface · sequence · canvas

- **Media (30s):** image · video

## Reference page structure

Every type page follows one section order:

- **Lead** — opening paragraphs, no heading: what the block is and its doctrine position.

- **Example** — a live block of the documented type.

- **State** — the state structure: shape, props, `carriesText`.

- **Typed actions** — the block's action verbs, or one line stating there are none.

- **Renderers** — the doc renderer first, then the agent markdown projection with its example fence.

- **Agent notes** — authoring guidance for agents.

- **Theming** — the type's theme surface.

## Typed actions, in one paragraph

Every bundle supplies a manifest, closed TypeBox state schemas with a per-type `carriesText` fact, one file per action verb, and an `agent-view.ts` markdown render. Five bundles expose 17 typed actions — code (2), structured-table (5), file-tree (3), interaction-surface (3), state-shape (4) — canvas forwards 5 more to the external canvas authority, and sequence forwards 3 to the sequence engine. Actions ride the generic op kernel as `componentAction` ops; the kernel, hash preconditions, and undo are the mutation model's story, not this one. The per-type pages document each block's actions where they exist.
