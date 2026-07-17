---
covers: Validate documentation structure, references, and semantic drift.
concepts: [audit, validation, references, drift-detection]
---

# Docs Audit Workflow

Validate documentation health. Quick mode runs the deterministic checks; deep mode adds semantic drift analysis.

**Modes:**
- `quick` (default) — reference resolution + structure checks
- `deep` — quick + semantic drift sampling

---

## Quick Audit

### 1. Reference Check

Run `bun run docs links check` — rescans the backlinks index and reports every doc-to-doc or doc-to-code reference that doesn't resolve. Exits non-zero on failures. This is the primary deterministic check for a bundle tree.

### 2. Structure Check

Verify against `20-standards/`:

- Three layers present (`00-foundation/`, `10-system-design/`, `20-implementation/`)
- Every folder has a `00-overview` doc
- Numbering follows `XX-lowercase-hyphenated` with gaps; `00`/`99` reserved correctly
- Every overview links its children; no orphan docs (present but unlinked from the parent overview)
- Render spot-checks (`docs render <path>`): specific titles, opening paragraph present, no placeholder text ("[To be filled]", "TBD")

Note: `scripts/audit.py` (in this package) is a markdown-era validator — it scans `*.md` files and YAML frontmatter. Use it only on a markdown docs tree (pre-migration); it reports nothing useful on `doc.json` bundles.

## Deep Audit

Run quick first, then sample 2-3 L3 docs for semantic drift:

1. Render the doc (`docs render <path>`) and read the code files it references.
2. Compare: does the documented architecture match the code? Are stated responsibilities accurate? Do code references point to the right files? Does documented behavior match implementation?

Example findings: "doc says Redis, code uses Memcached"; "doc references `UserSession`, renamed to `AuthSession`"; "doc says tokens expire after 1 hour, code shows 24".

Also check coverage: which source directories lack a corresponding `20-implementation/` section?

## Severity

| Issue | Severity |
|-------|----------|
| Missing layer; missing `00-overview`; broken reference | Critical |
| Numbering format; orphan doc; generic reference label; placeholder text | Warning |
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
