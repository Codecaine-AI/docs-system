---
covers: Placement rules for the three layers (Foundation/System Design/Implementation) and the L1-L6 depth levels.
concepts: [layers, L1, L2, L3, L4, L5, L6, foundation, system-design, implementation]
---

# Layers and Depth

Two organizing schemes: layers (kind of knowledge) and depth levels (detail within Implementation).

---

## The Three Layers

```
docs/
├── 00-foundation/       # Intent. Organic structure.
├── 10-system-design/    # System behavior and structure, by concept. Code-agnostic.
└── 20-implementation/   # Current codebase. Mirrors source. L1-L3 doc tree.
    └── 99-appendix/     # Operational (setup, tooling, infra)
```

Placement rules:

- North star, identity, fundamental approach → `00-foundation/`. Structure is organic per project; only `00-overview` is required.
- System behavior, data shapes, contracts, flows — anything a builder in any language would need → `10-system-design/`. Organize by concept, never by code structure. No class names, frameworks, or language features.
- How the current code does it — patterns, edge cases, language specifics → `20-implementation/`. Mirror the source tree. Write in present tense about the current system.
- Setup, tooling, infra → `20-implementation/99-appendix/`.

Litmus test: product behavior or architecture changed → Design. How the code handles it changed → Implementation. The north star shifted → Foundation.

## Doc-Tree Depth (L1-L3)

| Level | Location | Contains |
|-------|----------|----------|
| L1 | `20-implementation/00-overview` | Architecture summary + section index linking every L2 |
| L2 | `XX-section/00-overview` | Section scope, file tree of children, child descriptions |
| L3 | Individual concept docs | One coherent idea per doc, with code references |

- Keep the doc tree to these three levels; nest a subsection only when a section genuinely subdivides.
- Make each L3 doc atomic: one concept, link-rich, declarative, code-connected.

## In-Code Continuation (L4-L6)

The web of knowledge continues from the doc tree into the source:

| Level | Location | Contains |
|-------|----------|----------|
| L4 | Top of source files | File contract: responsibilities, dependencies, invariants, public API. Keep ≤50 lines. |
| L5 | Function docstrings | Function contract: purpose, inputs, outputs, side effects, errors |
| L6 | The code | Implementation — read only after L4/L5 confirm you're in the right place |

- Write L4/L5 with `30-workflows/60-annotate.md`; templates in `40-templates/50-L4-file-header/` and `40-templates/60-L5-docstring/`.
- Keep `README.md` at the repo root as the human landing page linking into `docs/`.

Rationale: docs/10-system-design/10-doc-architecture
