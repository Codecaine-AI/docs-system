# Package map

Every workspace package, what it owns, and why it exists as its own layer—the rationale now lives in System Design: Packages — why seven.

| package | one-line role |
| --- | --- |
| packages/docs-model | the format: doc.json schema, 14 block types, 7-op mutation kernel, markdown render |
| packages/docs-index | bun:sqlite backlinks index — derived, gitignored, rebuildable |
| packages/docs-server | the mutation authority: embeddable Elysia /api/* routes, hash preconditions, undo, SSE |
| packages/docs-viewer | the React layer: DocBlockRenderer, TipTap DocEditor, targeting, DocsClientProvider seam |
| packages/docs-workbench | the thin composition shell: server + SPA, Edit/Annotate modes, static export |
| packages/docs-cli | the docs command: render, grep, backlinks, links, migrate, serve, export |
| packages/framework | the methodology: manual, templates, skill definition (zero code) |
| external/canvas | vendored canvas engine — a supported neighbor, not a part |

- packages/docs-model

- packages/docs-index

- packages/docs-server

- packages/docs-viewer

- packages/docs-workbench

- packages/docs-cli

- packages/framework

- external/canvas

The repo-root `Makefile` wraps common commands: `make test`, `make typecheck`, `make check`, `make serve`, `make dev`, `make canvas`, and `make spa`.
