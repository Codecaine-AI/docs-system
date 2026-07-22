Every doc and folder carries a two-digit prefix, and every listing — sidebar, terminal, render — sorts by it identically. 

This page states the scheme, the reserved ranges, and what running out of gap space actually means.

## Structure

```
00-foundation/  # 00 — early/foundational slot, used sparingly
10-system-design/  # top-level sections gap by ten: 10-, 20-, 30-…
├── 10-doc-standards/
│   ├── 10-structure/  # children start at 10
│   ├── 20-numbering/  # siblings continue 20-, 30-, 40-…
│   └── 25-new-standard/  # ← a mid-gap insertion lands here; nothing renumbers (hypothetical)
└── 40-block-vocabulary/
    └── 10-rich-text/  # the named deviation: type pages run 10–17 dense, one family as a unit
20-implementation/
└── 99-appendix/  # 99 — appendix and meta only
```

## The Rule

- Prefix every doc and directory with two digits and a hyphen: `XX-lowercase-hyphenated-name`.

- Leave gaps of ten (`10-`, `20-`, `30-`) so a new doc can be inserted without renumbering anything.

- Insert mid-gap first — `25-` between `20-` and `30-` — before considering any reorganization.

- When the gaps are exhausted, the number line is telling you the section has outgrown its shape: reorganize into a subfolder rather than packing consecutive numbers.

| Range     | Reserved for |
| --- | --- |
| 00–09 | Early or foundational content, used sparingly — 00 is a plain sort prefix, not a reserved slot; new sections start children at 10 |
| 10–89 | Main content |
| 90–98 | Late or supplementary content |
| 99 | Appendix and meta (20-implementation/99-appendix/) |

Violations look like: consecutive numbers with no gaps, mixed formats (`1-intro`, `02-setup`, `section-3`), `99-` on anything but appendix material.

## Why

- **Ordered for human reading**

  - The numbers are for people first.

  - Prefixes put reading order in the filesystem itself — sidebar, terminal, and render agree without a manifest.

- **Insertion is local**

  - A new doc lands mid-gap and nothing else moves, which matters when paths are reference targets.

- **A clean search path for agents**

  - Second to human reading, and just as real.

  - The same explicit order tells an agent where to search and where to land a change — structure instead of hand-waving.

- **Exhaustion is a signal**

  - The moment you cannot number a doc, the section needs a subfolder. Packing consecutive numbers silences that signal.
