The same document must always become identical bytes. Everything downstream leans on that: git diffs stay reviewable, goldens stay byte-exact, and a SHA-256 hash of the file is a usable identity. A document has three derived forms — canonical JSON on disk, a markdown render for agents, and a content hash for write preconditions — and all three exist because serialization is deterministic.

## The Deterministic Serializer

`serializeDocDocument` fixes every degree of freedom JSON leaves open: a stable key order at every level, blocks emitted in depth-first document order, two-space indentation, and a trailing newline. In-memory key insertion order is irrelevant — the same document becomes identical bytes, every time. Because blocks are emitted in document order, a sibling reorder reads as a localized line move in the diff, not a file-wide shuffle.

**Canonical key orders**

| level | key order |
| --- | --- |
| document | schemaVersion, id, title, root, blocks |
| block | id, type, props, text, children |
| props | alphabetical |
| span | insert, attributes |
| attributes | bold, italic, strike, code, link, reference |
| reference | kind, path, symbol, line, section, label |

> **Git-diff discipline** — Canonical bytes are a contract, not a convenience: every write path — server saves, migrations, authoring scripts — must round-trip through `validateDocDocument` and `serializeDocDocument` before bytes reach disk. A hand-edited doc.json that validates but is not canonical will re-serialize to different bytes on its next save, polluting that diff.

One defensive edge: if the serializer is handed an invalid document with unreachable blocks, it appends them after the document-order walk, sorted by id — even broken input serializes deterministically instead of depending on map iteration order.

The second derived form is the runtime markdown render: pure, never written to disk, so it can never go stale against the source of truth. Its per-type mappings belong to each block's agent renderer, and the read contract to the agent surface.

## Content Hashes

The content hash is SHA-256 hex over the on-disk bytes. One helper — `createContentHash` in docs-server's `content-hash.ts` — is shared by every surface that hashes content: doc hashes, annotation-sidecar hashes, and canvas hashes all derive byte-identical values for identical content.

Hashes are the staleness precondition on writes: a mutation names the hash of the document it thinks it is editing, and the write authority rejects the op if the file has moved on. That only works because serialization is canonical — the hash changes when and only when the document actually changes. The locking and atomic-write machinery around this lives in the save pipeline.
