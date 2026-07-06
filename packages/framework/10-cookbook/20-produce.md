---
covers: How to create new documentation — the production workflow for new features and components.
concepts: [produce, create, new-feature, scaffold, interview, write, annotate]
---

# Produce: Creating New Documentation

When adding new features, components, or significant functionality, follow this workflow to create aligned documentation. Production ensures new code is documented from the start, not as an afterthought.

---

## When to Use

- Adding a new feature
- Creating a new component or module
- Implementing significant new functionality
- Setting up documentation for a new project

---

## The Production Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Scaffold  │ ──▶ │  Interview  │ ──▶ │    Write    │ ──▶ │  Annotate   │
│  (structure)│     │ (extract)   │     │  (generate) │     │   (embed)   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘

Interview and Write are layer-aware — they produce different output
depending on the target layer (Foundation, Design, or Implementation).
```

### Step 1: Scaffold (if needed)

**Purpose:** Map code structure to documentation structure.

**Load:** `../30-workflows/20-scaffold.md`

**When to run:**
- New section of codebase not yet in `docs/`
- Restructured code that needs doc realignment

**Output:** Empty doc structure mirroring code, ready to fill.

### Step 2: Interview

**Purpose:** Extract knowledge from the human (you) — at the appropriate layer.

**Load by layer:**
- **Foundation** (intent/vision): `../30-workflows/30-interview-foundation.md`
- **Design** (system architecture): `../30-workflows/35-interview-design.md`
- **Implementation** (code specifics): `../30-workflows/40-interview-codebase.md`

**When to run:**
- Foundation: New project, north star needs articulating
- Design: New system behavior, data flow, or component interactions to document
- Implementation: New code area needs documentation, existing code lacks context

**Output:** Interview notes at the target layer, ready for the docs-write agent.

### Step 3: Write

**Purpose:** Generate L2/L3 documentation from notes (interview or implementation).

**Load:** `../30-workflows/50-write.md`

**When to run:**
- After interview produces notes
- After implementing a feature (with implementation notes)
- Knowledge needs to be formalized into docs

**Output:** Polished L2 (section overview) and L3 (concept) docs.

### Step 4: Annotate

**Purpose:** Add L4 file headers and L5 function docstrings to source code.

**Load:** `../30-workflows/60-annotate.md`

**When to run:**
- New code files need headers
- Functions lack docstrings
- After L2/L3 docs establish context

**Output:** Source files with embedded documentation.

---

## Workflow Selection

Not every production task needs all steps:

| Scenario | Steps |
|----------|-------|
| New project | Init → Scaffold → Interview (foundation) → Write |
| New system behavior or data flow | Interview (design) → Write (design) |
| New feature area | Scaffold → Interview (codebase) → Write → Annotate |
| New files in existing area | Annotate only |
| Missing architectural docs | Interview (design or codebase) → Write |
| After implementing feature | Write (with implementation notes) → Annotate |
| System redesign / new component interactions | Interview (design) → Write (design) → Interview (codebase) → Write |

## Quality Checklist

Before considering production complete:

- [ ] L2 overview exists for the section
- [ ] L3 concept docs cover key ideas
- [ ] L4 headers exist in all source files
- [ ] L5 docstrings exist for public functions
- [ ] Frontmatter includes `covers` and `concepts`
- [ ] Code references link docs to implementation
- [ ] `depends-on` captures cross-references
