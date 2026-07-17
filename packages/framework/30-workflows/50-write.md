---
covers: Write or update documentation across layers — Design (system-agnostic) or Implementation (code-specific).
concepts: [write, update, L2, L3, generation, notes, design, implementation, layer]
---

# Docs Write Workflow

Write or update documentation for a source path or system concept. Layer-aware:

| Layer | Target | Tone | Output |
|-------|--------|------|--------|
| **Design** | System concepts, behaviors, flow | Code-agnostic — no language, framework, or file references | `docs/10-system-design/` |
| **Implementation** | Source code sections | Code-specific — files, patterns, language details | `docs/20-implementation/` |

Layer detection: if the target is `design` or `docs/10-system-design/`, use Section A; otherwise Section B.

Read existing docs via `bun run docs render <path>` / `docs grep <term> [path-prefix]` — never read `doc.json` directly. Create and update docs through the workbench editor (`docs serve` Edit mode) or the docs-server API; never hand-edit `doc.json`.

Notes and diffs are drafting inputs only; final docs describe the current system as it exists now.

---

## Section A: Design Layer

Input: a design interview report (`docs/.drafts/design.interview.md`) or equivalent notes.

### A.1 Gather Context

- Notes file — behaviors, flow, contracts to document
- Foundation docs (`docs render docs/00-foundation/00-overview`) — Design must align with intent
- Existing Design docs (`docs grep` / targeted `docs render` under `docs/10-system-design`)
- Do NOT read source code for Design docs.

### A.2 Write Design Docs

- System terms only: "the session processor validates input before advancing phase" — never class names or method calls.
- Data shapes as concepts, not type definitions.
- Contracts at boundaries: what crosses, what each side guarantees.
- Organize by concept (session flow, data model, event system), not by directory.
- Shape each doc: title, opening paragraph, then Behavior / Data Shape / Contracts / Boundaries sections as applicable.

### A.3 Validate

- No code references, file paths, class names, or language-specific terms.
- Aligns with Foundation intent.
- Could be implemented in any language from these docs alone.

---

## Section B: Implementation Layer

Inputs: `source_path` (required) and a notes file (interview notes, implementation notes, or a spec). If no notes and no existing docs, ask for notes. If no notes but docs exist, proceed in minor-update mode from code analysis.

### B.1 Gather Context

| Source | Via |
|--------|-----|
| Notes file | Read directly (plain markdown in `docs/.drafts/`) |
| Source code | Read `[source_path]/` |
| Existing docs | `docs render docs/20-implementation/[section]/<doc>` or `docs grep <term> docs/20-implementation/[section]` |
| L1 overview | `docs render docs/20-implementation/00-overview` |

### B.2 Normalize Notes Into Present-State Facts

- Extract current responsibilities, boundaries, interfaces, invariants, terminology; verify against the code.
- Write final docs as if fresh against today's codebase. Avoid change-log voice: "now", "no longer", "previously", "used to", "changed from", "replaced", "after refactor", "we switched" — unless history is the document's subject.

### B.3 Plan the Changes

Compare notes, code, and existing docs. Present a change plan (doc → CREATE/UPDATE → reason) and get approval.

- New section, no docs → CREATE L2 overview + L3 docs.
- Existing section + new functionality → CREATE new L3 docs, UPDATE L2 overview.
- Existing section + changes → UPDATE affected L3 docs and L2 overview.
- File tree changed → UPDATE the L2 overview's file tree.

### B.4 Write the L2 Overview

Seed from `40-templates/30-L2-section-overview/` (pick the fitting archetype). Include: title, opening paragraph, accurate file tree from source, section scope (owns / does not own), architecture, and links to every L3 child. When updating: preserve content not contradicted by notes; rewrite change-log phrasing into present-state prose.

### B.5 Write the L3 Docs

One concept per doc — don't create a doc per source file; group functionality into concepts. Seed from `40-templates/40-L3-concept/10-generic.md`. Include: context, architecture, key rules/invariants, code references (file + purpose), links to related docs. Number 10, 20, 30 with gaps.

### B.6 Update the L1 Overview

Link new sections from `docs/20-implementation/00-overview`; update descriptions if scope changed.

### B.7 Validate

1. Run `docs links check` — every doc and code reference must resolve.
2. Confirm the L2 overview links all L3 docs, and L1 links the L2.
3. Report issues found.

### B.8 Summary

Report created/updated docs, validation results, and next steps: review via `bun run docs serve` (live rendered view with edit support), then `/docs:annotate [source_path]`, then `/docs:audit`.

---

## Quality Checklist

- [ ] L2 overview has an accurate file tree and links all L3 docs
- [ ] Each doc has a specific title and opening paragraph
- [ ] Code references use correct paths
- [ ] No placeholder text remains
- [ ] Key insights from notes are captured
- [ ] `docs links check` passes
