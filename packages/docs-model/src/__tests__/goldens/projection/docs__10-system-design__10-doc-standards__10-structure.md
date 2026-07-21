Within every layer, the docs keep the same substructure.

A tree of bundle folders descending L1–L6

- Three levels in the doc tree

- Three in the source

This page states the depth ladder, the folder rules, and why the shape holds.

## Structure

```
10-system-design/  # L1 — the layer's parent doc: summary plus an index of every section
└── 10-doc-standards/  # L2 — a section: the folder is itself a doc introducing its children
    └── 10-structure/  # L3 — a concept doc: one coherent idea (this one)
20-implementation/
├── 30-save-pipeline/  # a single doc — one concept covers it
└── 40-theming/  # a folder — themes split four ways
```

## The depth ladder

Six levels — three in the doc tree, three in the source:

| Level | Lives at | Carries |
| --- | --- | --- |
| L1 | A layer's parent doc (00-foundation, 10-system-design, 20-implementation) | Layer summary plus a section index linking every L2 |
| L2 | XX-section (the section's parent doc) | Section scope and its children, one line each |
| L3 | A concept doc | One coherent idea — atomic, link-rich, code-connected |
| L4 | Top of a source file | The file's contract: responsibilities, dependencies, invariants — kept under 50 lines |
| L5 | Function docstrings | The function's contract: purpose, inputs, outputs, side effects, errors |
| L6 | The code | The implementation itself — read only after L4/L5 confirm you are in the right place |

- The ladder is the same in every layer

  - L1–L3 structure foundation and system design exactly as they structure implementation.

- The doc tree stays at three levels; a subsection appears only when a section genuinely subdivides.

- Below L3 the rungs live in the source — in-code docs owns them.

## Folders and bundles

- A doc is a folder containing `doc.json` — `10-authentication/` holding a bundle, not `10-authentication.md`. The folder name is the doc's address; the bundle inside is its state.

- Implementation mirrors the source: `src/core/workflow/` documents at `docs/20-implementation/10-core/10-workflow/`. Cross-cutting concerns — logging, caching, error handling — get one primary home, never a scatter.

- A section folder is itself a document: it carries its own `doc.json` — the parent doc — introducing its immediate children, one level deep, one line each.

  - An abstract, not a table of contents: after reading it, a reader can explain the domain and descends only where the task lives.

- A topic becomes a folder when it needs about three related docs or has clear room to grow; until then it stays a single doc. A folder holding only its parent doc plus one child collapses back into a single doc.

## Why

- **On disk, next to the code**

  - Every doc is a folder in the repo, versioned with the source it describes.

    - An agent reads and edits it with plain file access — no special tooling.

    - Docs and code change in the same place, so they track together.

- **Progressive disclosure**

  - Read only what the task needs.

    - The concept doc points at a source file; the file's header says whether to keep going; docstrings answer for each function.

    - Each level rules the next in or out

      - No scattered hunting.

- **A clear place for everything**

  - The structure answers where a thing lives and where a new thing goes.

    - A human files and finds by walking the numbered tree.

    - An agent searches along the same explicit structure instead of guessing.
