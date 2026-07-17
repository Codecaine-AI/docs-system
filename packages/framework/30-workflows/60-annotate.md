---
covers: Add L4 file headers and L5 function docstrings to source code.
concepts: [annotate, L4, L5, headers, docstrings, code-comments]
---

# Docs Annotate Workflow

Add L4 file headers and L5 function docstrings to source code. These live IN the source files and carry the file and function contracts.

---

## Prerequisites

- The corresponding `docs/20-implementation/` section exists with L2/L3 docs
- Ideally, interview and write have been run for this section

## Process

### 1. Load Context

- Section docs: `bun run docs render docs/20-implementation/[section]/00-overview` (and relevant L3 docs)
- Interview notes if available: `docs/.drafts/[section].interview.md`
- Templates (resolve via your skill mount, e.g. `.claude/skills/docs-framework/`): `40-templates/50-L4-file-header/10-generic.md`, `40-templates/60-L5-docstring/10-generic.md`

### 2. Analyze Target Files

For each source file: check existing headers/docstrings (note what to preserve), identify major functions (public/exported first, then complex private, entry points), and understand the file's role from the docs and the code.

### 3. Generate L4 Headers

Propose a header per file and confirm before applying (`[y/n/edit]`).

Guidelines:
- Keep under 50 lines.
- Focus on WHAT, not HOW: responsibilities as bullets, key dependencies, contracts/invariants, public API.
- Choose Component vs Process mode per the template.

### 4. Generate L5 Docstrings

Propose docstrings for major functions and confirm before applying.

Guidelines:
- Start with an action verb.
- Document parameters (with constraints), return value, errors raised, and side effects (DB writes, external calls, state changes).
- Keep it a contract, not a tutorial; scale detail with complexity per the template.

### 5. Apply Changes

Show each exact change, apply with confirmation, preserve existing formatting.

### 6. Summary

Report: files with L4 headers added, functions with L5 docstrings added, files skipped (already documented). Next steps: review, run tests to catch syntax errors, continue with other directories, or `/docs:audit`.

## Language Formats

Match the language's native doc convention and the codebase's existing style:

- **Python** — module/function `"""docstrings"""`
- **JS/TS** — `/** JSDoc */` blocks
- **Go** — `// Package ...` and function comments
- **Rust** — `//!` module docs, `///` function docs

## Output

- Files modified, headers and docstrings added
- Files skipped and why
- Next steps
