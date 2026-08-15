# Docs System catalog

This listed catalog root is intentionally bundle-less for now.

The generic `docs-writer` bundle remains in `agent-kernel/catalog/` so it can
be used by the TUI and by other repositories. At boot, docs-kernel mounts that
sibling catalog as an unlisted root: `docs-writer` resolves for docs-edit
session spawns but does not appear in the docs-system catalog listing.
