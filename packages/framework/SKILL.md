---
name: docs-framework
description: Three-layer documentation framework (Foundation, System Design, Implementation) for maintaining structured, navigable documentation. Use when reading docs/ to understand the codebase, or when writing/maintaining documentation.
---

# Purpose

Maintain structured, layered documentation that is easy to navigate and update.
Follow the `Instructions`, execute the `Workflow`, based on the `Cookbook`.

## Instructions

- Based on your intent (navigate, produce, or maintain), follow the `Cookbook` to load the appropriate workflow.
- All documentation output goes to `docs/`

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
├── 00-foundation/       # Manifesto — north star, intent, why and what
├── 10-system-design/    # Architect's blueprints — system-agnostic, organized by concept
└── 20-implementation/   # Current codebase — language-specific, organized by code structure
    └── 99-appendix/     # Operational (setup, tooling, infra)
```

### This Skill

Fetch sub-files via `skill_read({ skill: "docs-framework", file: "<key>" })`:

```
docs-framework/
├── 00-reference/      # Philosophy and background
├── 10-cookbook/       # Intent-based entry points
├── 20-standards/      # Structure rules and schemas
└── 40-templates/      # Document templates
```

## Reference

| Topic | Location |
|-------|----------|
| Philosophy | `00-reference/10-philosophy.md` |
| Architecture | `00-reference/20-architecture.md` |
| Standards | `20-standards/` |
| Templates | `40-templates/` |
