How the current docs-system code realizes the system design: how the source is organized and why key implementation choices were made. This section is a concise transition from the design into the code.

## Source Areas

- packages/ — the workspace packages: the pure document model, the derived backlinks index, the mutation authority, the browser viewer/editor, the runnable workbench, the command-line dialect, and the methodology package; decisions live under Packages and its per-package children.

- packages/docs-workbench — the composition host where the server and viewer meet; host-wiring decisions live under Workbench.

- external/ — the independently owned Canvas and Sequence projects, mounted as submodules; boundary decisions live under External Canvas and Sequence.

- themes/ — theme folders and component style knobs; decisions live under Theming.

## Tier Contract

This tier maps the design to current code and records key implementation choices. Design owns behavior, state models, and load-bearing schemas; Agents owns agent definitions; the code owns file-local detail; reports do not belong in the docs tree at all.

**Inclusion test**: an entry helps the reader locate how the design is implemented or understand why the code is built this way.

Agents adding code either conform to the decisions recorded here or file a proposal to change them — never silently deviate.

The layer's shape, entry format, and rationale are defined by the Implementation layer standard.
