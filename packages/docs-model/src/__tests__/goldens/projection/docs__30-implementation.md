How the current docs-system code realizes the system design: how the source is organized and why key implementation choices were made. This section is a concise transition from the design into the code.

## Source Areas

- packages/: the workspace packages, from the document model and the backlinks index to the viewer, the workbench and the command-line dialect. Decisions live under Packages and its per-package children.

- packages/docs-workbench: the composition host where the server and viewer meet. Host-wiring decisions live under Workbench.

- external/: the independently owned Canvas and Sequence projects, mounted as submodules. Boundary decisions live under External Canvas and Sequence.

- evals/: the quality climb, which writes, renders and scores pages to measure the docs tools. Its method and results live under Quality Climb.

- themes/: theme folders and component style knobs. Decisions live under Theming.

## Tier Contract

This tier maps the design to current code and records key implementation choices. Design owns behavior, state models, and load-bearing schemas; Agents owns agent definitions; the code owns file-local detail; reports do not belong in the docs tree at all.

The **inclusion test** is that an entry helps the reader locate how the design is implemented or understand why the code is built this way.

Agents adding code either conform to the decisions recorded here or file a proposal to change them: never silently deviate.

The layer's shape, entry format, and rationale are defined by the Implementation layer standard.
