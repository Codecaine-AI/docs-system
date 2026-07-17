---
covers: Doc metadata — bundle-level titles for corpus docs; frontmatter conventions for this package's own markdown files.
type: standard
concepts: [metadata, title, covers, concepts]
---

# Doc Metadata

---

## Corpus Docs (doc.json Bundles)

- Docs carry their title as bundle-level metadata inside `doc.json`. There is no YAML frontmatter in a doc bundle.
- Give every doc a title specific enough to differentiate it from its siblings — the title is what navigation, search, and `docs grep` results surface first.
- Open every doc with a short paragraph (2-4 sentences) stating what it covers. Readers and agents decide relevance from the title plus this opening without reading the body.

## This Package's Own Markdown Files

The plain markdown files in this skill package (not the corpus) keep YAML frontmatter:

| Field | Rule |
|-------|------|
| `covers` | Required. One sentence describing what the file addresses. |
| `concepts` | Optional. Short keyword tags (≤30 chars each). |
| `type` | `overview` on `00-overview.md` files; `standard` where applicable. |

Rationale: docs/10-system-design/10-doc-architecture
