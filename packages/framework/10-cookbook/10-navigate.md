---
covers: How to navigate documentation to understand the codebase — the SCAN/SKIM/READ algorithm over docs render output.
concepts: [navigate, research, traversal, scan, skim, read, progressive-disclosure]
---

# Navigate: Understanding the Codebase

Navigate the documentation before reading code. Read docs only through the CLI:

- `bun run docs render <path>` — print a doc as markdown (title, opening paragraph, full body in one string)
- `bun run docs grep <term> [path-prefix]` — search across rendered docs

Never Read `doc.json` (or any leftover markdown twin) directly.

---

## Entry Points

| What You Need | Start Here |
|---------------|------------|
| Architecture, code structure, how things work | `bun run docs render docs/20-implementation/00-overview` |
| Purpose, boundaries, "why" | `bun run docs render docs/00-foundation/00-overview` |
| Intended behavior before changing it | `docs/10-system-design/` — follow references from Implementation docs |

## SCAN → SKIM → READ

Each phase is a slice of one `docs render` output. Take only what the phase needs.

1. **SCAN** — the title and first line. Decide: potentially relevant? No → skip the doc entirely.
2. **SKIM** — the opening paragraph (before the first `---`). Decide: enough context? Yes → stop, move on.
3. **READ** — the full body. Only when implementing in this area, the topic is central to the task, or SKIM raised questions.

## Traversal

1. Prime with Foundation: SCAN+SKIM its docs; READ rarely.
2. Render L1 (`docs/20-implementation/00-overview`); pick relevant sections from its index.
3. For each relevant section: SCAN/SKIM its L2 overview; skip the section if irrelevant.
4. For each relevant child: SCAN/SKIM the L3 doc; READ only if needed. Extract code references.
5. Before changing anything, follow references to the relevant System Design docs.
6. Continue into code only as deep as the task requires: L4 file headers → L5 docstrings → L6 code.

Backtrack when a doc or header shows you're in the wrong place. Use `docs grep <term>` for cross-cutting lookups when the tree doesn't lead you there.

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Reading every doc fully | SCAN first, SKIM selectively |
| Going straight to READ | Always SCAN the title/opening first |
| Drilling to L6 for every doc | Stop when you have enough |
| Loading "just in case" content | Trust SCAN/SKIM to filter |
| Reading `doc.json` or markdown twins | Always `docs render` |
