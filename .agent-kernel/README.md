# Docs kernel manifest

`kernel.json` is owned by this repository. The docs-kernel harness reads it
at boot and does not rewrite it.

The built-in listed catalog root is `packages/docs-kernel/catalog/`. The
repo-level `catalog/` is an optional listed extension root for additional
agents; duplicate names across roots are rejected rather than overridden. The
generic `docs-writer` bundle remains in `agent-kernel/catalog/`; the harness
mounts that sibling catalog as an unlisted root so the bundle can resolve for
session spawns without appearing in the docs-system catalog listing.
