# external/canvas — a supported neighbor

The Codecaine canvas engine is vendored here as a git submodule at `external/canvas`. It is its own project, with its own repository, workspace, and release cadence; it is not part of the docs system.

## How it is wired in

The submodule mounts the canvas project at `external/canvas`. The root Bun workspace pulls in only `external/canvas/packages/*`, so `@codecaine-ai/canvas` resolves for the embed components without making the canvas project itself a docs-system package.

## Why it lives under external/, not packages/

> **Boundary: Canvas is not an eighth package** — The docs system supports canvas because canvas documents can be embedded in docs, but canvas is not part of the docs system. Keeping it outside `packages/` makes that ownership boundary literal. The placement is forced by canvas being another project; it is not a judgment call about package organization.

## Where the docs system touches it

- docs-model consumes only the agent-schema leaf. The repository-root `import-boundaries.test.ts` enforces that canvas imports from docs-model go exclusively through `@codecaine-ai/canvas/agent-schema`: types cross the boundary, never the engine.

- docs-server does not apply canvas actions itself. It forwards them to the canvas authority through `POST /api/ops`.

- docs-viewer and `docs-workbench` render embedded canvases through a `canvas-embed` component injected through the viewer's `DocsClientProvider` seam. The canvas block is one of the fourteen block types.

> **Clone caveat: Check for a submodule cycle** — Before cloning recursively, read the repository `README.md` submodule-cycle caveat. Follow that guidance before initializing nested submodules.
