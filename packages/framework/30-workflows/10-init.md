---
covers: One-time initialization of docs/ with the three-layer structure.
concepts: [init, initialization, setup, three-layers]
---

# Docs Init Workflow

One-time initialization of `docs/` in a project. Sets up the three-layer structure with minimal starting docs.

---

## Prerequisites Check

1. **`.claude/skills/docs-framework/` exists** (framework skill). If missing: mount docs-system first — see `99-appendix/10-setup-guide.md` for the submodule + skill-symlink steps.
2. **`.claude/commands/docs/` exists** (slash commands). If missing: point the user at the setup guide.

Stop and instruct the user to complete setup if either is missing.

## Initialization Steps

### 1. Show Project Structure

Run `eza --tree --level=2` (or `tree -L 2`), excluding node_modules, .git, build artifacts.

### 2. Check for Existing Documentation

- `docs/` exists with the three layers (`00-foundation/`, `10-system-design/`, `20-implementation/`) → report what exists, suggest `/docs:audit`.
- `docs/` exists without the structure → run this init to set it up.
- No `docs/` → proceed.

### 3. Create the Three-Layer Structure

Create the minimal starting docs — through the workbench editor (`docs serve`) or the docs-server API; if seeding from markdown files, convert them with `docs migrate`:

| Doc | Content |
|-----|---------|
| `docs/00-foundation/00-overview` | Placeholder noting that structure emerges from `/docs:interview-foundation` |
| `docs/10-system-design/00-overview` | Design layer index (empty to start) |
| `docs/20-implementation/00-overview` | Implementation overview seeded from `40-templates/20-L1-implementation-overview/10-generic.md` |
| `docs/.drafts/.gitkeep` | Working directory for interview notes (plain markdown) |

### 4. Ask Source Directory

Ask: "What is your main source code directory?" (`src/`, `app/`, `lib/`, or project root). Store the answer for `/docs:scaffold`.

### 5. Suggest Next Steps

```
Documentation initialized.

Next steps:
1. Run /docs:interview-foundation — explore what you're building and why
2. Run /docs:write foundation — generate Foundation docs from the interview
3. Fill in docs/20-implementation/00-overview to describe your codebase
4. Run /docs:scaffold to map your source structure to documentation sections
```

## Output

- List of created docs by layer
- Project structure visualization
- Clear next steps (Foundation interview first, then structure)
