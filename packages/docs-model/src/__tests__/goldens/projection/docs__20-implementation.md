# docs-system: System Architecture

`docs-system` is Codecaine's documentation infrastructure: a layered implementation
pipeline built around a block-based document format (`doc.json`), the tooling that reads/writes/serves it, and a
browser workbench for humans *and* agents to read, edit, and annotate docs.

The foundation layer carries the philosophy; this overview focuses on the
implementation shape: **docs are structured data, not markdown
files.** Every document is a normalized tree of typed blocks with stable
ids, which lets the pipeline address a precise block instead of a whole file.
An agent can say
"change *this* block", a comment can anchor to *this* paragraph and survive
edits around it, a backlink can point at *this* exact card, and a save can
be expressed as a minimal batch of block operations instead of a whole-file
rewrite.

Every block is one of **14 types**: paragraph, heading, list-item, quote, code,
callout, divider, structured-table, file-tree, interaction-surface, mermaid,
canvas, image, and video. Retired MDX-era types (the old semantic cards,
`data-model`, `api-surface`, …) coerce to `callout` on read, with the old type
name preserved as `props.kind`. The full vocabulary — every type's props and
its typed actions — is documented in Block vocabulary & typed actions.

## The Pipeline at a Glance

```
                    ┌─────────────┐
   authoring        │  docs-model │   pure schema + ops (no I/O, no React)
   (markdown ───►   └──────┬──────┘
    migrate,               │
    or live edit)   ┌──────┴──────┐
                    │ docs-index  │   sqlite backlinks index (derived, rebuildable)
                    └──────┬──────┘
                    ┌──────┴──────┐
                    │ docs-server │   mutation authority: locks, hashes, undo, SSE
                    └──────┬──────┘
                    ┌──────┴──────┐
                    │ docs-viewer │   React rendering + TipTap editor + targeting
                    └──────┬──────┘
                    ┌──────┴──────┐
                    │docs-workbench│  the runnable app (serve + static export)
                    └──────┬──────┘
                    ┌──────┴──────┐
                    │  docs-cli   │   `docs` command: serve, export, migrate, …
                    └─────────────┘
```

Each layer only depends on the layers above it in this list. The
package map walks through every package in
detail.

## Where Content Lives

A document is a **bundle**: a folder holding `doc.json` (the block tree),
optional `annotations.json` (annotations), and an `assets/` folder for images
and canvas sidecars. Bundles live in a `docs/` tree owned by whichever
project the docs are *about* — the canvas repo has `canvas/docs/`, and this
repo has its own `docs/` (the one you are reading right now).

Markdown is an on-ramp, not the storage format: `docs migrate` converts an
existing `.md`/`.mdx` tree into bundles once, and from then on the workbench
(or an agent driving the ops API) edits `doc.json` directly. Edits are
expressed in a seven-op kernel — six generic structural/text ops plus
`componentAction`, which invokes one of 13 typed actions on structured blocks
(tables, file trees, interaction surfaces, code annotations) — and an agent
can discover the whole edit surface from `GET /api/blocks`.

## Reading These Docs

From the repo root:

```
bun run docs serve
```

opens this very documentation in the workbench at `http://localhost:4800`.
