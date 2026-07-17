---
name: docs-framework
description: Agent skill for authoring, navigating, and maintaining structured three-layer documentation (Foundation, System Design, Implementation). Use when reading docs/ to understand the codebase, or when writing or maintaining documentation.
---

# Purpose

Author, navigate, and maintain the `docs/` corpus. Determine your intent, load the matching cookbook entry, execute its steps.

## Instructions

- Based on your intent (navigate, produce, or maintain), follow the `Cookbook` to load the appropriate workflow.
- All documentation output goes to `docs/`.
- Read docs only through the docs CLI (`docs render <path>`, `docs grep <term> [path-prefix]`). Never read `doc.json` directly.

## Workflow

1. Determine your intent (navigate, produce, maintain)
2. Follow the `Cookbook` to load the appropriate entry point
3. Execute the workflow steps from the loaded cookbook file

## Cookbook

### Navigate

- IF: You need to research, understand the codebase, or find where something is handled
- THEN: Read and execute: `10-cookbook/10-navigate.md`
- EXAMPLES:
  - "How does authentication work?"
  - "Where is error handling implemented?"
  - "What components use the API client?"

### Produce

- IF: You need to create new documentation for a feature, component, or significant addition
- THEN: Read and execute: `10-cookbook/20-produce.md`
- EXAMPLES:
  - "Document the new payment module"
  - "Create docs for the authentication system"
  - "Add documentation for the API endpoints"

### Maintain

- IF: You need to fix, update, refactor, or check alignment of existing documentation
- THEN: Read and execute: `10-cookbook/30-maintain.md`
- EXAMPLES:
  - "Update docs after refactoring auth"
  - "Check if docs are in sync with code"
  - "Fix outdated documentation"

---

## Architecture

### Documentation Output (`docs/`)

```
docs/
├── 00-foundation/       # Intent — what this is and why
├── 10-system-design/    # System behavior and structural decisions, by concept
└── 20-implementation/   # Current codebase — mirrors source structure
    └── 99-appendix/     # Operational (setup, tooling, infra)
```

Each doc is a `doc.json` block bundle in its own folder (e.g. `10-authentication/` containing `doc.json`). Read and write docs through the docs CLI (`docs render <path>`, `docs grep <term>`) and the workbench editor — never by reading `doc.json` directly.

### This Skill

Fetch sub-files via `skill_read({ skill: "docs-framework", file: "<key>" })`:

```
docs-framework/
├── 00-reference/      # Pointer to the host corpus (no doctrine here)
├── 10-cookbook/       # Intent-based entry points
├── 20-standards/      # Structure rules
├── 30-workflows/      # Step-by-step task guides
└── 40-templates/      # Document templates
```

## Where the Why Lives

This skill is imperative: it says what to do, not why. Rationale lives in the host corpus:

- `docs/10-system-design/10-doc-architecture` — every structural decision (layers, folders-with-overviews, numbering, linking, doc↔code references) with its rationale
- `docs/00-foundation/00-manifesto` — the intent: knowledge transfer between humans and AI; docs define behavior; code is the projection of specs

When a structural decision changes, update both together: the corpus design doc (why) and this skill (how).

## Reference

| Topic | Location |
|-------|----------|
| Structural rationale | `docs/10-system-design/10-doc-architecture` (host corpus) |
| Intent and philosophy | `docs/00-foundation/00-manifesto` (host corpus) |
| State model and interaction surfaces | `docs/10-system-design/00-interaction-surfaces` (host corpus) |
| Standards | `20-standards/` |
| Workflows | `30-workflows/` |
| Templates | `40-templates/` |
