This section documents how the current build is cut and operated: package boundaries, the workbench host, the save pipeline, theme application, and the local development loop. It owns code-shaped mechanics and the reasons for code boundaries; designed interaction and appearance live in system design.

## In This Section

- Packages

  - Where the code is allowed to be cut — the boundaries, and the as-built map of every package.

- Using the workbench

  - The host runtime: edit persistence, conflict handling, annotations, media handoffs, and static degradation.

- The save pipeline: keystroke to disk

  - How an edit becomes validated canonical bytes.

- Theming: Overview

  - Theme-folder resolution, registry validation, style-state application, font stacks, and Default persistence.

- Local development loop

  - Running, testing, and iterating on the tooling itself.

To read these docs live, run `bun run docs serve` from the repo root — the workbench opens at `http://localhost:4800`. The full loop is Local development loop.
