# Block vocabulary & typed actions

These docs are written primarily for **agents** to read. The markdown projection (`projectToMarkdown` in docs-model, served at `GET /api/markdown` and driving the `docs render` / `docs grep` CLI) is the primary consumer: every block type defines a deterministic, greppable markdown form, so an agent never has to parse `doc.json` just to read a document. The workbench renders the human view from the same blocks.

The author surface stays deliberately minimal: **fourteen block types, and no more**. A small vocabulary keeps the projection stable, the editor learnable, and the agent edit surface enumerable. For documenting agentic systems, two of those types carry the whole model:

> State is an annotated JSON code block; the ways to change that state are an interaction-surface block.

This document dogfoods the vocabulary it documents: the table below is a `structured-table`, the typed actions are real `interaction-surface` blocks, the state example is an annotated `code` block, and the repo slice is a live `file-tree`.

## The 14 block types

The source of truth is `DOC_BLOCK_TYPES` in docs-model’s `doc-schema.ts`. Seven component bundles in `components/<name>/` own those 14 types exactly once: rich-text owns the eight text-flow types, while code, mermaid, file-tree, structured-table, interaction-surface, and canvas each own their namesake. Every bundle supplies a manifest, closed TypeBox state schemas with a per-type `carriesText` fact, one file per action verb, and an `agent-view.ts` markdown projection.

**The 14 block types**

| type | component | purpose |
| --- | --- | --- |
| paragraph | rich-text | Rich text prose (delta spans); the default block. |
| heading | rich-text | Section heading; props.level picks h1-h6 (default 2). |
| list-item | rich-text | Bullet (or ordered) item; nesting via child list-item blocks. |
| quote | rich-text | A block quote of rich text. |
| code | code | Source code in text; props.language plus optional props.annotations side notes. |
| callout | rich-text | Highlighted note; props.tone colors it, free-form props.kind labels the chip. |
| divider | rich-text | A horizontal rule separating sections. |
| structured-table | structured-table | Typed table from props.columns (string[]) and props.rows (string[][]). |
| file-tree | file-tree | Rendered tree of props.entries: { path, note?, change?, from? }. |
| interaction-surface | interaction-surface | Operation signatures ({ name, description?, params?, returns?, kind? }) describing how a system is changed or queried. |
| mermaid | mermaid | Mermaid diagram; the source lives in the block's text. |
| canvas | canvas | Embedded interactive canvas; props.canvasId (or legacy src) plus an optional view crop. |
| image | rich-text | Image from the bundle's assets/images/; props: src, alt, caption. |
| video | rich-text | Bundle video (src) or external URL (url); YouTube/Vimeo/Loom embed privacy-friendly players. |

One nuance: the `code` component keeps structured `annotations` in props, while its source carries text and still edits through generic text ops.

## The edit model

Everything is an op. The kernel (`doc-ops.ts`) speaks **seven ops**: six generic structural/text ops — `insertBlock`, `updateBlock`, `deleteBlock`, `moveBlock`, `splitBlock`, `mergeBlocks` — plus `blockAction`, the typed-action bridge. Ops post to `POST /api/ops` with an `expected_hash` precondition (409 on a stale hash, 423 while another editor holds the draft lock). Every applied op returns **exact inverse ops**, stored as undo units keyed by patch id and replayed through `POST /api/undo`.

> **Mermaid: The one write path** — flowchart LR
>   agent["agent / editor"] -->|"POST /api/ops + expected_hash"| kernel["applyOps kernel"]
>   kernel -->|"exact inverse ops"| undo["undo stack"]
>   kernel -->|"doc + fresh hash"| agent
>   kernel -->|"SSE change event"| watchers["GET /api/events"]

Four component bundles expose **typed actions** from `components/<name>/actions/<verb>.ts`: a `blockAction` names an action, the dispatcher validates its TypeBox params before apply, and the action returns a props patch executed through `updateBlock`. Rejections stay at `$.params.<name>`; unknown extra params are ignored. The 13 actions are unchanged: code (2), structured-table (5), file-tree (3), interaction-surface (3). `ALL_COMPONENTS` folds into the type and action registries, with module-load checks for exact type ownership, action-key grammar, and closed state schemas. `GET /api/blocks` serves `{ schemaVersion: 2, ops, components }`: kernel-op descriptions plus component manifests, per-type carriesText and state schemas, and action descriptions and params schemas, with TypeBox schemas served verbatim as JSON Schema. The four surfaces below show the bundles that define actions:

### code

**code — annotation actions (source text stays on generic ops)**

```
code.setAnnotation(lines: string, note: string, label?: string) -> props patch: { annotations }  # Upsert a line annotation keyed by its exact "lines" string (e.g. "4-9").
code.removeAnnotation(lines: string) -> props patch: { annotations }  # Remove the annotation whose "lines" key matches exactly.
```

### structured-table

**structured-table — row and column actions**

```
structured-table.addRow(cells: array, index?: number) -> props patch: { rows }  # Insert a row (cells padded/truncated to the column count); index defaults to the end.
structured-table.removeRow(index: number) -> props patch: { rows }  # Remove the row at the given index.
structured-table.updateCell(rowIndex: number, column?: string, columnIndex?: number, value: string) -> props patch: { rows }  # Set one cell, addressing the column by name (column) or position (columnIndex).
structured-table.addColumn(name: string, index?: number, fill?: string) -> props patch: { columns, rows }  # Insert a column (default at the end), extending every row with the fill value.
structured-table.removeColumn(column?: string, columnIndex?: number) -> props patch: { columns, rows }  # Remove a column by name (column) or position (columnIndex), shrinking every row.
```

### file-tree

**file-tree — entry actions (stable ordering: add appends, rename patches in place)**

```
file-tree.addEntry(path: string, note?: string, change?: string) -> props patch: { entries }  # Append a path entry (optional note and change marker) to the file tree.
file-tree.removeEntry(path: string) -> props patch: { entries }  # Remove the entry with the given path from the file tree.
file-tree.updateEntry(path: string, note?: string, change?: string, from?: string, newPath?: string) -> props patch: { entries }  # Patch an entry's note/change/from, or rename it via newPath (in place).
```

### interaction-surface

**interaction-surface — operation actions (yes, the surface documents itself)**

```
interaction-surface.addOperation(name: string, description?: string, params?: array, returns?: string, kind?: string) -> props patch: { operations }  # Append an operation signature ({ name, description?, params?, returns?, kind? }) to the surface.
interaction-surface.updateOperation(name: string, patch: object) -> props patch: { operations }  # Patch an operation (rename via patch.name; null clears description/params/returns/kind).
interaction-surface.removeOperation(name: string) -> props patch: { operations }  # Remove the operation with the given name from the surface.
```

## State as annotated JSON

The other half of the model: when a doc needs to show *what the state is*, it shows the real JSON and annotates the lines that matter. Here is an actual `file-tree` block as it sits in a `doc.json`, with the field design called out:

```json
{
  "id": "b-example-tree",
  "type": "file-tree",
  "props": {
    "title": "docs-viewer, one release later",
    "entries": [
      { "path": "src/render/block-registry.ts", "change": "renamed", "from": "src/flavour-registry.ts" },
      { "path": "src/docs-blocks/code/highlight.ts", "change": "added", "note": "hljs wrapper" },
      { "path": "src/render/DocsBlockLibrary.tsx", "note": "gallery of every block type" }
    ]
  },
  "children": []
}
```
> **L2-3 (Identity):** Every block carries a stable id and one of the 14 type strings. The id never changes across edits — comments, backlinks, and undo units all anchor to it.
> **L6-10 (State as data):** Object types keep their state in typed props, not prose. An agent edits this array through file-tree.addEntry / updateEntry / removeEntry — never by hand-patching JSON — so every change validates and returns an undo inverse.
> **L7 (Diff story):** change and from are the v2 diff fields: this entry renders with a rename marker as "src/flavour-registry.ts -> block-registry.ts" — the actual rename this repo shipped.

## The file tree, live

And the same block type rendered, not quoted — a slice of this repo with a note on every load-bearing file, plus the v2 diff markers (`added`, `renamed` with `from`) in action:

**Where the content model lives**

```
  docs/
  └── 10-system-design/
      └── 10-block-vocabulary/
+         └── doc.json  # this document
  packages/
  ├── docs-model/
  │   └── src/
  │       ├── components/  # the seven component bundles + folded registries
  │       ├── doc-ops.ts  # the 7-op kernel + inverses
  │       ├── doc-schema.ts  # the 14-type vocabulary + coercion
  │       └── project-markdown.ts  # the markdown projection
  ├── docs-server/
  │   └── src/
  │       └── routes.ts  # POST /api/ops, GET /api/blocks
  └── docs-viewer/
      └── src/
          └── render/
>             └── packages/docs-viewer/src/flavour-registry.ts -> block-registry.ts  # render descriptors per type
```

---

> **Decision: Retired types never break a corpus** — Validation never rejects a retired or unknown block type. After legacy flavour aliasing, any block whose type is a string but not one of the 14 canonical types coerces to a callout, preserving the old type name as props.kind (unless the block already carries its own non-empty kind); props, text, and children carry over verbatim. That is how the canvas sibling's semantic cards (requirement, decision, constraint, ...) and its never-in-schema legacy blocks load with zero file rewrites — coerced blocks simply canonicalize on their next save.

## Authoring notes

- Code annotations are `props.annotations: [{ lines, label?, note }]` with 1-indexed lines like `"4"`, `"4-9"`, or `"1,4-6"`; they render as click-pairable side notes and project to markdown as `> **L4-9 (Label):** note` lines under the fence.

- Plain (annotation-free) code blocks with language `json` display pretty-printed at render time — display-only; the stored block text is never mutated.

- Video blocks appear *from content* — deliberately no slash-menu entry. Paste or drop a YouTube/Vimeo/Loom URL (embedded via privacy-friendly players), or drop a video file, which uploads to the bundle's `assets/videos/` through `POST /api/assets/video`.

- Links: select text and press `Cmd+K` for the link popover, or paste a URL over a non-empty selection to wrap it in a link mark.
