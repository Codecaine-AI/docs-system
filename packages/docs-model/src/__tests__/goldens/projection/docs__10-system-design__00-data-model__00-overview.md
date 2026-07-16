# The data model — one format, five shapes

The docs system has one on-disk content format: `doc.json`, a normalized block tree, plus a `comments.json` sidecar per bundle. Agents read through a pure markdown projection and write through the same seven-op kernel the editor uses. That keeps reading greppable, writing enumerable, and file bytes deterministic enough for reviewable diffs.

This section is system-agnostic: it describes shapes and invariants, not transport wiring. Everything here is defined in pure TypeScript in `packages/docs-model` — no React, no filesystem, no HTTP — so the browser, the Bun server, and the CLI share one definition. The model decomposes into five shapes, and each gets its own page.

## The five shapes

- The document & block tree — the envelope, the flat id-keyed `blocks` map, ordered children arrays, stable anchor ids, graph invariants, and the seven-op write surface.

- Rich text — delta spans, the four boolean marks, outbound links, and the shared SpectreRef reference chip.

- Per-type block state — seven component bundles owning the 14 types, closed TypeBox state schemas for `props`, typed actions as data, and the `GET /api/blocks` discovery payload.

- Comments & targets — the `comments.json` sidecar: block and canvas-object anchors, intents, agent runs, and dangling-target detection.

- Canonical bytes — the deterministic serializer, the markdown projection map, and the SHA-256 content hashes that make write preconditions possible.

> **Mental model** — **SHAPES LIVE HERE, BEHAVIOR LIVES NEXT DOOR.** If you can hold five shapes in your head — document, span, state, comment, bytes — you can read or write anything in the system. How those shapes change over time (ops, inverses, undo) and how they reach disk (locks, hashes, atomic writes) are separate pages.

## Neighbors

Read this section alongside the block vocabulary — what each of the 14 types is for, the mutation model — ops, inverses, undo, and the save pipeline — how bytes reach disk.
