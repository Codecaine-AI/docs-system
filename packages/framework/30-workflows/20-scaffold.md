---
covers: Map source directory structure to docs/20-implementation/ sections.
concepts: [scaffold, mapping, structure, sections]
---

# Docs Scaffold Workflow

Map the source tree to documentation sections: analyze `src/` (or equivalent), propose a mirrored structure in `docs/20-implementation/`, create L2 section overview stubs.

---

## Prerequisites

- `/docs:init` has been run (`docs/` exists with the three layers)
- The source directory is identified

## Process

### 1. Analyze Source Structure

Run `eza --tree --level=3 [source_path]` (or `tree -L 3`). Identify major subdirectories that represent architectural domains (auth, api, core, data, services). Skip tests, build artifacts, caches.

### 2. Propose Section Mapping

Present a mapping table:

```
src/auth/   →  docs/20-implementation/10-auth/
src/api/    →  docs/20-implementation/20-api/
src/core/   →  docs/20-implementation/30-core/
src/utils/  →  (skip — utilities rarely need architecture docs)
```

Numbering: 10, 20, 30... with gaps; group related sections numerically.

Ask the user: does the mapping look right? Any directories to skip, add, or rename?

### 3. Create Section Stubs

For each confirmed mapping, create `docs/20-implementation/XX-section/00-overview` (through the editor or docs-server API), seeded from `40-templates/30-L2-section-overview/10-generic.md` (or a more specific archetype). Fill in the actual file tree from source; mark scope and children "[To be filled after interview]".

### 4. Update the L1 Overview

Add each new section to the Section Index in `docs/20-implementation/00-overview` with placeholder descriptions until interviews complete.

### 5. Generate Coverage Report

Output a summary table: source directory → docs section → created/skipped. Then next steps:

```
1. Run /docs:interview-codebase src/auth/ to start knowledge extraction
2. Repeat for each section
3. Run /docs:write to generate full documentation
```

## Output

- Created sections in `20-implementation/`
- Coverage map (source → docs)
- Next steps with specific commands
