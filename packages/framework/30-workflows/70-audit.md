---
covers: Validate documentation structure, references, and semantic drift.
concepts: [audit, validation, references, drift-detection]
---

# Docs Audit Workflow

Validate documentation health. Quick mode runs the deterministic checks; deep mode adds semantic drift analysis.

**Modes:**
- `quick` (default) — reference resolution + machine structure audit
- `deep` — quick + semantic drift sampling

---

## Quick Audit

### 1. Reference Check

Run `bun run docs links check` — rescans the backlinks index and reports every doc-to-doc or doc-to-code reference that doesn't resolve. Exits non-zero on failures.

### 2. Structure Audit

Run `bun run docs audit docs` — walks the doc.json bundle tree and machine-checks the structural standards in `20-standards/`. It replaces the retired markdown-era `scripts/audit.py`; it operates on bundles only, never on markdown files.

Findings come at two severities, one line each (`ERROR|WARN <check-id> <path> — <message>`), followed by a summary count.

**Errors** — structural invariants. Any error makes the command exit non-zero; a clean corpus must have zero:

| Check | Invariant |
|-------|-----------|
| E1 | No two sibling entries share a two-digit `NN-` prefix |
| E2 | Every entry (section folder or bundle folder) matches `NN-lowercase-hyphenated` |
| E3 | Every section with ≥ 2 children has a `00-overview` bundle (the docs root itself is exempt — the top level is the layer folders) |
| E4 | Every bundle has a `doc.json` that parses and passes `validateDocDocument` |

**Warnings** — content conventions. Printed but exit 0; they are read-through fodder, not failures. They will be promoted to errors after the corpus read-through:

| Check | Convention |
|-------|-----------|
| W1 | A doc has exactly one level-1 heading |
| W2 | Image blocks carry alt text |
| W3 | `00-`prefixed bundles are named `00-overview` (e.g. `00-manifesto` is a known deviation) |
| W4 | The first content block after the title is an opening paragraph |
| W5 | Sibling numbering keeps gaps of ten (dense families are deliberate in places) |

**Exit codes:** 1 if any error, 0 otherwise (warnings never fail the run). A clean run prints only the summary line.

### 3. Render Spot-Checks

`bun run docs render <path>` a few docs: specific titles, opening paragraph present, no placeholder text ("[To be filled]", "TBD").

## Deep Audit

Run quick first, then sample 2-3 concept docs for semantic drift:

1. Render the doc (`docs render <path>`) and read the code files it references.
2. Compare: does the documented architecture match the code? Are stated responsibilities accurate? Do code references point to the right files? Does documented behavior match implementation?

Example findings: "doc says Redis, code uses Memcached"; "doc references `UserSession`, renamed to `AuthSession`"; "doc says tokens expire after 1 hour, code shows 24".

Also check coverage: which source directories lack a corresponding `20-implementation/` section?

## Severity

| Issue | Severity |
|-------|----------|
| Broken reference; any `docs audit` ERROR | Critical |
| Any `docs audit` WARN; orphan doc; generic reference label; placeholder text | Warning |
| Stale code reference; drifted behavior claims | Warning (deep) |

## Report Format

```markdown
# Docs Audit Report

**Date / Mode / Path**

## Summary
| Files checked | Critical | Warnings |

## Critical Issues
- **Location** / **Problem** / **Fix**

## Warnings
- **Location** / **Problem** / **Fix**

## Semantic Drift (deep mode)
- Sampled doc → per-claim pass/fail

## Recommended Actions
1. [Priority-ordered fixes; suggest /docs:write or /docs:interview-codebase for stale sections]
```

## Output

- Structured audit report, issues categorized by severity
- Specific locations and fixes
- Recommended next actions
