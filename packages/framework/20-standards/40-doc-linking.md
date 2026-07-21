---
covers: Linking between docs — reference spans, declarative labels, top-down navigation.
concepts: [linking, references, anchor-text, navigation, backlinks]
---

# Doc Linking

---

## Rules

- Link docs to docs with reference spans created in the editor or through the docs-server API — not raw markdown links. The backlinks index tracks them; `docs links check` verifies they resolve.
- Give every reference a declarative label that describes what the target provides — never "click here" or "this document".
- Surround the reference with brief context: what the linked doc covers and why you'd follow it.
- Link top-down: parent overviews link to children. Do not add upward (parent) links or cross-cutting sibling links — navigate via parent overviews.
- Every overview lists its children, each with a one-line description.
- After moving or renaming a doc, run `docs backlinks rescan`, then `docs links check`.

## Anti-Patterns

- Generic labels with no context.
- Upward navigation links.
- Sibling links across sections.
- Two docs each deferring to the other for the full explanation.

Canonical: docs/10-system-design/10-doc-standards/30-cross-doc-linking — the corpus doc owns this standard (rule and rationale); this file is the operational copy.
