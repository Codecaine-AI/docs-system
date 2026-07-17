# docs-model — the format

`@codecaine-ai/docs-model` is the dependency-pure TypeScript definition of `doc.json`. It owns the shared format, operations, and rendering that every other package builds around.

## What it owns

The package has 88 source files. It is pure TypeScript: no React, filesystem, or network code.

`packages/docs-model/src/doc-schema.ts` defines `doc.json` as a normalized, id-keyed block tree with delta-style rich-text spans. The schema has exactly 14 block types: paragraph, heading, list-item, quote, code, callout, divider, structured-table, file-tree, interaction-surface, mermaid, canvas, image, and video. Retired MDX-era types coerce to callout on read, with the old type name preserved as `props.kind`.

**Key source paths**

```
packages/
└── docs-model/
    └── src/
        ├── components/
        │   ├── <name>/  # Seven component bundles that own all 14 block types.
        │   └── index.ts  # The folded component registry.
        ├── comments-schema.ts  # Comment targets for blocks and canvas objects.
        ├── doc-ops.ts  # The seven-operation mutation kernel.
        ├── doc-schema.ts  # The doc.json schema, validation, and deterministic serializer.
        ├── markdown-to-delta.ts  # Inline Markdown back to delta spans.
        └── project-markdown.ts  # Document-to-Markdown render.
```

`packages/docs-model/src/doc-ops.ts` defines the seven-op mutation kernel: `insertBlock`, `updateBlock`, `deleteBlock`, `moveBlock`, `splitBlock`, `mergeBlocks`, and `blockAction`. Its pure `applyOp(doc, op) -> { doc, inverse }` returns the inverse that powers undo in docs-server.

The seven bundles under `packages/docs-model/src/components/<name>/` are rich-text, code, structured-table, file-tree, interaction-surface, mermaid, and canvas. Together they own all 14 block types; each separates its manifest, state, actions, and agent view. `packages/docs-model/src/components/index.ts` folds them into the registry used by validation, discovery, rendering, and typed actions.

`packages/docs-model/src/comments-schema.ts` defines comments whose targets anchor to document blocks or canvas objects.

`packages/docs-model/src/project-markdown.ts` and `packages/docs-model/src/markdown-to-delta.ts` cover Markdown conversion in both directions: documents render to Markdown, and edited inline Markdown parses back to delta spans. `serializeDocDocument` produces canonical on-disk bytes deterministically; golden tests assert byte equality.

## Why it is its own package

The browser viewer, Bun server, and CLI must agree on one definition of a valid document and one mutation contract.

> **DECISION: One format must cross three runtimes** — The only artifact the browser viewer, Bun server, and CLI can all share is a dependency-pure package. This boundary is a forcing constraint, not a judgment call.

The root `import-boundaries.test.ts` enforces the constraint: docs-model may not import `react`, `react-dom`, or `@tiptap/*`. It may import canvas only through the `@codecaine-ai/canvas/agent-schema` leaf for types, never through the engine.

## Dependencies

**Package boundary**

| Direction | Package or layer | Relationship |
| --- | --- | --- |
| Depends on | @sinclair/typebox | Defines the package's runtime schemas. |
| Depends on, types only | @codecaine-ai/canvas through @codecaine-ai/canvas/agent-schema | Provides canvas types without importing the engine. |
| Depended on by | docs-index | Consumes the shared document format. |
| Depended on by | docs-server | Applies operations and uses returned inverses for undo. |
| Depended on by | docs-viewer | Consumes the shared document format in the browser. |
| Depended on by | docs-workbench | Builds editing machinery around the shared types. |
| Depended on by | docs-cli | Consumes the shared format and rendering from the CLI. |

Everything else in the repo is machinery around this package's types.

## Using it alone

Consume docs-model by itself when a tool needs to read, validate, mutate, or render `doc.json` without running a server. Offline agents, static generators, and scripts can use the format and its pure operations without browser, server, or CLI machinery.
