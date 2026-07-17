---
covers: Directory rules — bundle folders, source mirroring, the overview requirement, folders vs docs.
concepts: [directory, bundles, mirroring, overview, structure]
---

# Directory Rules

---

## Docs Are Bundle Folders

- A doc is a folder containing `doc.json` — e.g. `10-authentication/` holding `doc.json`, not `10-authentication.md`.
- Read docs with `docs render <path>` (path without extension, e.g. `docs render docs/20-implementation/10-auth/00-overview`). Never read `doc.json` directly.
- Create and edit docs through the workbench editor (`docs serve`) or the docs-server API. Never hand-edit `doc.json`.

## Top-Level Shape

```
docs/
├── 00-foundation/           # organic structure; only 00-overview required
├── 10-system-design/        # by concept; flat or shallow nesting
└── 20-implementation/       # mirrors source; sections use the 10-80 range
    └── 99-appendix/         # operational (setup, tooling, infra)
```

## Mirror the Source (Implementation Only)

- Mirror your source tree inside `20-implementation/`: `src/core/workflow/` → `docs/20-implementation/10-core/10-workflow/`.
- Put cross-cutting concerns (logging, caching, error handling) in one primary location; do not scatter them.

## Every Folder Has an Overview

- Every folder in `docs/` must contain a `00-overview` doc.
- Every overview lists its immediate children (one level deep) with a one-line description each.
- L2 overviews include a file tree of immediate children.

## Folders vs Docs

- Create a folder when a topic needs 3+ related docs, has a clear subcategory, or will grow.
- Keep a single doc when one concept covers it. If `XX-topic/` would hold only an overview plus one doc, use `XX-topic/` as a single doc instead.

## Anti-Patterns

- Flat structure with no hierarchy.
- Over-nesting (`10-app/10-backend/10-services/10-user/...`).
- Folders without a `00-overview` doc.

Rationale: docs/10-system-design/10-doc-architecture
