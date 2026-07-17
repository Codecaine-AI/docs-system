---
covers: How to create new documentation — the production workflow for new features and components.
concepts: [produce, create, new-feature, scaffold, interview, write, annotate]
---

# Produce: Creating New Documentation

Create documentation for new features, components, or projects. Reading existing docs goes through `docs render`/`docs grep`; creating and editing docs goes through the workbench editor (`docs serve`) or the docs-server API.

---

## The Production Workflow

```
Scaffold (structure) → Interview (extract) → Write (generate) → Annotate (embed)
```

Interview and Write are layer-aware — they produce different output per target layer (Foundation, Design, Implementation).

### Step 1: Scaffold (if needed)

- **Load:** `../30-workflows/20-scaffold.md`
- **When:** New codebase area not yet in `docs/`, or restructured code needing realignment.
- **Output:** Empty doc structure mirroring code.

### Step 2: Interview

- **Load by layer:**
  - Foundation (intent/vision): `../30-workflows/30-interview-foundation.md`
  - Design (system architecture): `../30-workflows/35-interview-design.md`
  - Implementation (code specifics): `../30-workflows/40-interview-codebase.md`
- **Output:** Interview notes in `docs/.drafts/`, ready for Write.

### Step 3: Write

- **Load:** `../30-workflows/50-write.md`
- **When:** After an interview, after implementing a feature (with implementation notes), or when knowledge needs formalizing.
- **Output:** L2 (section overview) and L3 (concept) docs.

### Step 4: Annotate

- **Load:** `../30-workflows/60-annotate.md`
- **When:** New code files lack headers, functions lack docstrings, after L2/L3 docs establish context.
- **Output:** Source files with L4 headers and L5 docstrings.

## Workflow Selection

| Scenario | Steps |
|----------|-------|
| New project | Init → Scaffold → Interview (foundation) → Write |
| New system behavior or data flow | Interview (design) → Write (design) |
| New feature area | Scaffold → Interview (codebase) → Write → Annotate |
| New files in existing area | Annotate only |
| Missing architectural docs | Interview (design or codebase) → Write |
| After implementing a feature | Write (with implementation notes) → Annotate |

## Quality Checklist

- [ ] L2 overview exists for the section and links every L3 doc
- [ ] L3 docs cover the key concepts, one per doc
- [ ] L4 headers exist in all source files; L5 docstrings on public functions
- [ ] Every doc has a specific title and opening paragraph
- [ ] Code references link docs to implementation
- [ ] `docs links check` passes
