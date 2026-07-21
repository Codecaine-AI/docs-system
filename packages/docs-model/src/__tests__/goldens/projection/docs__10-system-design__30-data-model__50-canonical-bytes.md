# Canonical bytes: serialization, rendering, hashing

The same document must always become identical bytes. Everything downstream leans on that: git diffs stay reviewable, goldens stay byte-exact, and a SHA-256 hash of the file is a usable identity. A document has three derived forms — canonical JSON on disk, a markdown render for agents, and a content hash for write preconditions — and all three exist because serialization is deterministic.

## The deterministic serializer

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

## The markdown render

Agents read documents through `projectToMarkdown`. The function is pure and runtime-only: it never writes a markdown mirror to disk, so the render can never go stale against the source of truth. Each block type has a deterministic, greppable form, produced by the owning component's `agentView`.

**Render map**

| type | renders as |
| --- | --- |
| paragraph | Plain text line; the root paragraph shell is skipped. |
| heading | # through ###### from props.level, default 2 and clamped 1-6. |
| list-item | - bullet or 1. when props.ordered; 2-space indent per nesting depth. |
| quote | >-prefixed blockquote line(s). |
| code | Fenced block with props.language; annotations render as > **L<lines>[ (<label>)]:** <note> lines. |
| callout | Blockquote label from props.kind or uppercased props.tone, optional title, then body. |
| divider | --- |
| structured-table | Optional bold title plus a markdown pipe table from props.columns and props.rows. |
| file-tree | Literal tree fence with dirs-first sort, change markers, and note suffixes. |
| interaction-surface | Optional bold title plus a bare fenced list of signature lines; query/event get bracket prefixes. |
| mermaid | Blockquote labeled Mermaid with optional title and body. |
| canvas | HTML comment: <!-- canvas: <src> [view=...] [title="..."] -->. |
| image | Markdown image ![alt](src) plus optional italic caption. |
| video | Blockquote labeled Video with title, url-or-src target, and optional caption. |

## Content hashes

The content hash is SHA-256 hex over the on-disk bytes. One helper — `createContentHash` in docs-server's `content-hash.ts` — is shared by every surface that hashes content: doc hashes, comment-sidecar hashes, and canvas hashes all derive byte-identical values for identical content.

Hashes are the staleness precondition on writes: a mutation names the hash of the document it thinks it is editing, and the write authority rejects the op if the file has moved on. That only works because serialization is canonical — the hash changes when and only when the document actually changes. The locking and atomic-write machinery around this lives in the save pipeline.

---

The tree being serialized is the document & block tree; the span and reference orders above are the shapes from rich text; the ops whose preconditions use these hashes are the mutation model.
