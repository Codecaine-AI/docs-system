---
covers: The two-digit numbering scheme for docs and directories.
concepts: [numbering, prefix, ordering, insertion]
---

# Numbering

---

## Scheme

- Prefix every doc and directory with two digits and a hyphen: `XX-lowercase-hyphenated-name`.
- Use gaps of 10 (`10-`, `20-`, `30-`) so new docs can be inserted without renumbering (`15-session-management/` between `10-` and `20-`).
- If you run out of gap space, reorganize into a subfolder instead of packing numbers.

## Reserved Numbers

| Number | Purpose |
|--------|---------|
| `00` | Overview docs only (`00-overview`) |
| `01-09` | Early/foundational content (use sparingly) |
| `10-89` | Main content |
| `90-98` | Late/supplementary content |
| `99` | Appendix/meta (e.g. `20-implementation/99-appendix/`) |

## Anti-Patterns

- Consecutive numbers with no gaps (`10-`, `11-`, `12-`).
- Mixed formats (`1-intro`, `02-setup`, `section-3`).
- `00-` on anything but an overview; `99-` on anything but appendix/meta.

Canonical: docs/10-system-design/10-doc-standards/20-numbering — the corpus doc owns this standard (rule and rationale); this file is the operational copy.
