# Docs kernel manifest

`kernel.json` is owned by this repository. The docs-kernel harness reads it
at boot and does not rewrite it.

The listed catalog root is `docs-system/catalog/`. The generic `docs-writer`
bundle remains in `agent-kernel/catalog/`; the harness mounts that sibling
catalog as an unlisted root so the bundle can resolve for session spawns
without appearing in the docs-system catalog listing.
