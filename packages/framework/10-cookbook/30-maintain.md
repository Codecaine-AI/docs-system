---
covers: How to maintain documentation alignment — update and audit workflows for ongoing changes.
concepts: [maintain, write, audit, drift, alignment]
---

# Maintain: Keeping Docs Aligned

When code changes — bug fixes, refactors, chores — find the drift, rewrite affected docs to describe the current system, and verify health.

---

## The Maintenance Workflow

```
Write (update) → Audit (verify)
```

### Step 1: Write (Update Docs)

- **Load:** `../30-workflows/50-write.md`
- **Input:** Notes describing what changed (implementation notes, refactor summary).
- **Rule:** Notes are analysis input, not final wording. Finished docs describe what exists now — never narrate the update path. Avoid "now", "no longer", "previously", "changed from" unless the doc is explicitly about migration history.
- **Output:** Updated L2/L3 docs aligned with current code, edited through the workbench editor or docs-server API.

### Step 2: Audit (Verify Health)

- **Load:** `../30-workflows/70-audit.md`
- **Checks:** reference resolution (`docs links check`), structure and numbering, overview coverage, semantic drift (deep mode).
- **Output:** Health report with pass/fail per check.

## Maintenance Triggers

| Trigger | Action |
|---------|--------|
| After code change | Write with implementation notes |
| After refactor | Write on the refactored section |
| Weekly/sprint boundary | Audit active sections |
| Before release | Full audit on `docs/` |

## Common Drift Patterns

| Pattern | Fix |
|---------|-----|
| Renamed function | Update L5 docstring |
| Moved file | Update code reference in L3; run `docs links check` |
| Deleted feature | Remove the orphaned doc; run `docs backlinks rescan` |
| New parameter | Update L5 docstring |
| Changed behavior | Revise L3/L4 description |

## Drift Prevention

1. Document as you code — don't accumulate debt.
2. Write notes as you implement — capture context while fresh.
3. Include docs in review — docs are part of "done".
4. Run `docs links check` routinely.
